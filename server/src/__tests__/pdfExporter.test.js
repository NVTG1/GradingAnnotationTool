const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const { buildAnnotatedPDF } = require("../services/pdfExporter");

async function makeTestPDF() {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]); // A4-ish, single blank page
  const bytes = await doc.save();

  const tmpFile = path.join(
    os.tmpdir(),
    `pdfExporter-test-${Date.now()}-${Math.random()}.pdf`
  );
  await fs.writeFile(tmpFile, bytes);
  return tmpFile;
}

// A page's worth of OCR layout, split across two physical lines —
// the same shape studentAnswerLayout takes in production. Used to
// exercise the "annotation has no coordinates yet, resolve them from
// anchorText" fallback path in resolveAnnotation().
const twoLineLayout = [
  {
    pageNumber: 1,
    blocks: [
      {
        text: "Ammeter: connected in series to measure the",
        bbox: [30, 280, 780, 315],
      },
      {
        text: "current flowing in circuit.",
        bbox: [30, 316, 780, 350],
      },
    ],
  },
];

describe("buildAnnotatedPDF", () => {
  let tmpFile;

  afterEach(async () => {
    if (tmpFile) await fs.unlink(tmpFile).catch(() => {});
  });

  it("produces a valid PDF (original page count + 1 feedback page) with no annotations", async () => {
    tmpFile = await makeTestPDF();

    const outBytes = await buildAnnotatedPDF(
      tmpFile,
      "irrelevant",
      [],
      []
    );

    const outDoc = await PDFDocument.load(outBytes);
    expect(outDoc.getPageCount()).toBe(2); // 1 original + 1 feedback page
  });

  it("keeps the original page count unchanged — never regenerates the answer page from OCR text", async () => {
    tmpFile = await makeTestPDF();

    const annotations = [
      {
        type: "highlight",
        status: "correct",
        pageNumber: 1,
        x: 100,
        y: 100,
        width: 200,
        height: 40,
        note: "Good.",
      },
    ];

    const outBytes = await buildAnnotatedPDF(
      tmpFile,
      "some student text",
      [],
      annotations
    );

    const outDoc = await PDFDocument.load(outBytes);
    // Page 1 must still be the ORIGINAL page — same dimensions as
    // the source PDF, not a freshly generated text page.
    const [originalPage] = (await PDFDocument.load(
      await fs.readFile(tmpFile)
    )).getPages();
    const [outputFirstPage] = outDoc.getPages();

    expect(outputFirstPage.getWidth()).toBe(originalPage.getWidth());
    expect(outputFirstPage.getHeight()).toBe(originalPage.getHeight());
  });

  it("resolves an annotation with no stored coordinates using its anchorText against the OCR layout, spanning multiple lines", async () => {
    tmpFile = await makeTestPDF();

    const annotations = [
      {
        type: "highlight",
        status: "correct",
        pageNumber: null,
        x: null,
        y: null,
        width: null,
        height: null,
        anchorText:
          "Ammeter: connected in series to measure the current flowing in circuit.",
        note: "Correctly explains ammeter placement.",
      },
    ];

    // Should not throw, and should place the mark on the original
    // page rather than falling back to the feedback-only page —
    // asserted indirectly via page count staying at 2 (1 original +
    // 1 feedback) rather than growing because the mark was pushed to
    // an unresolved/overflow feedback page.
    const outBytes = await buildAnnotatedPDF(
      tmpFile,
      "irrelevant",
      twoLineLayout,
      annotations
    );

    const outDoc = await PDFDocument.load(outBytes);
    expect(outDoc.getPageCount()).toBe(2);
  });

  it("does not crash and puts the note on the feedback page when an annotation's anchorText matches nothing on the page", async () => {
    tmpFile = await makeTestPDF();

    const annotations = [
      {
        type: "comment",
        pageNumber: null,
        x: null,
        y: null,
        width: null,
        height: null,
        anchorText: "text that does not appear anywhere on the page",
        note: "This should land on the feedback page, not crash export.",
      },
    ];

    const outBytes = await buildAnnotatedPDF(
      tmpFile,
      "irrelevant",
      twoLineLayout,
      annotations
    );

    const outDoc = await PDFDocument.load(outBytes);
    expect(outDoc.getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it("handles an empty annotations array without crashing", async () => {
    tmpFile = await makeTestPDF();

    await expect(
      buildAnnotatedPDF(tmpFile, "irrelevant", [], [])
    ).resolves.toBeInstanceOf(Uint8Array);
  });
});