// Mocks every I/O boundary pdfExtractor's OCR fallback touches, so this
// test asserts pdfExtractor's BRANCHING logic (when to fall back to
// OCR, how to fail) in isolation — the same spirit as ocrNoise.test.js
// testing the grading pipeline's robustness rather than a real model's
// output quality.
//
// pdf-parse itself is mocked too (not just pdfToImages/llmClient):
// its bundled pdfjs-dist uses a dynamic import() internally that some
// Jest configs choke on ("...without --experimental-vm-modules"),
// which is an environment quirk unrelated to what this test is
// actually checking — the fallback decision logic.
jest.mock("pdf-parse");
jest.mock("../utils/pdfToImages");
jest.mock("../services/llmClient");

const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { PDFParse } = require("pdf-parse");
const { renderPdfPagesToImages } = require("../utils/pdfToImages");
const { transcribeHandwrittenImages } = require("../services/llmClient");
const { extractTextFromPDF } = require("../utils/pdfExtractor");

function mockTextLayer(text) {
  PDFParse.mockImplementation(() => ({
    getText: () => Promise.resolve({ text }),
    destroy: () => Promise.resolve(),
  }));
}

describe("extractTextFromPDF — scanned/handwritten fallback", () => {
  let tmpFile;

  beforeEach(async () => {
    // The file just needs to exist on disk — fs.readFile happens before
    // any parsing, and PDFParse itself is mocked above.
    tmpFile = path.join(os.tmpdir(), `fake-scan-${Date.now()}.pdf`);
    await fs.writeFile(tmpFile, "placeholder");
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.unlink(tmpFile).catch(() => {});
  });

  it("falls back to OCR when the text layer is empty and returns the transcription", async () => {
    mockTextLayer(""); // simulates a scanned/handwritten page: no text layer at all
    renderPdfPagesToImages.mockResolvedValue([Buffer.from("fake-page-1-png")]);
    transcribeHandwrittenImages.mockResolvedValue("Q1: The battery provides potential difference.");

    const text = await extractTextFromPDF(tmpFile);

    expect(renderPdfPagesToImages).toHaveBeenCalledWith(tmpFile);
    expect(text).toBe("Q1: The battery provides potential difference.");
  });

  it("falls back to OCR when the text layer is present but too sparse to trust", async () => {
    mockTextLayer("-- 1 of 1 --"); // e.g. a lone page-number artifact, not real content
    renderPdfPagesToImages.mockResolvedValue([Buffer.from("fake-page-1-png")]);
    transcribeHandwrittenImages.mockResolvedValue("Q1: Handwritten transcription here.");

    const text = await extractTextFromPDF(tmpFile);

    expect(text).toBe("Q1: Handwritten transcription here.");
  });

  it("throws a clean 400 PDF_PARSE_FAILED when OCR also fails, not a crash", async () => {
    mockTextLayer("");
    renderPdfPagesToImages.mockResolvedValue([Buffer.from("fake-page-1-png")]);
    transcribeHandwrittenImages.mockRejectedValue(new Error("Simulated vision API failure"));

    await expect(extractTextFromPDF(tmpFile)).rejects.toMatchObject({
      code: "PDF_PARSE_FAILED",
      status: 400,
    });
  });

  it("throws a clean 400 when the PDF has no renderable pages at all", async () => {
    mockTextLayer("");
    renderPdfPagesToImages.mockRejectedValue(new Error("PDF has no renderable pages"));

    await expect(extractTextFromPDF(tmpFile)).rejects.toMatchObject({
      code: "PDF_PARSE_FAILED",
      status: 400,
    });
  });

  it("never calls OCR when the PDF already has a real text layer", async () => {
    mockTextLayer("Q1: A circuit is a closed path that allows current to flow, powered by a battery.");

    const text = await extractTextFromPDF(tmpFile);

    expect(text.length).toBeGreaterThan(20);
    expect(renderPdfPagesToImages).not.toHaveBeenCalled();
    expect(transcribeHandwrittenImages).not.toHaveBeenCalled();
  });
});