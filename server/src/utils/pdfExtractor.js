const fs = require("fs/promises");
const { PDFParse } = require("pdf-parse");
const AppError = require("./AppError");
const { renderPdfPagesToImages } = require("./pdfToImages");
const { transcribeHandwrittenImages } = require("../services/llmClient");

function hasUsableTextLayer(text) {
  if (!text) return false;

  const cleaned = text.replace(/\s+/g, " ").trim();

  const letters = (cleaned.match(/[a-zA-Z]/g) || []).length;

  const words = cleaned
    .split(/\s+/)
    .filter(word => /[a-zA-Z]{2,}/.test(word));

  return letters >= 40 && words.length >= 8;
}

async function extractTextFromPDF(filePath, { forceScenario } = {}) {
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (err) {
    throw new AppError(
      `Could not read file at ${filePath}`,
      400,
      "FILE_NOT_FOUND",
    );
  }

  let textLayer = "";
  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    textLayer = result.text.trim();
  } catch (err) {
    textLayer = "";
  } finally {
    if (parser && typeof parser.destroy === "function") {
      await parser.destroy().catch(() => {});
    }
  }

  if (hasUsableTextLayer(textLayer)) {
    return textLayer;
  }

  try {
    console.log("Text layer unusable. Falling back to OCR...");
    const pageImages = await renderPdfPagesToImages(filePath);
    console.log(`Rendered ${pageImages.length} pages for OCR`);
    const ocrText = await transcribeHandwrittenImages(pageImages, {
      forceScenario,
    });

    console.log("OCR RESULT:", ocrText);

    if (ocrText.replace(/\s/g, "").length > 0) {
      return ocrText.trim();
    }
  } catch (ocrErr) {
    console.error("OCR FALLBACK FAILED:", {
      message: ocrErr.message,
      code: ocrErr.code,
      status: ocrErr.status,
      stack: ocrErr.stack,
    });
  }

  throw new AppError(
    "Could not extract text from PDF (it may be a scanned/handwritten image with no readable content)",
    400,
    "PDF_PARSE_FAILED",
  );
}

module.exports = { extractTextFromPDF };
