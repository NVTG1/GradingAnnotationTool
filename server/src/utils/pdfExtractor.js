const fs = require("fs/promises");
const { PDFParse } = require("pdf-parse");
const AppError = require("./AppError");

/**
 * Extracts plain text from a PDF file on disk.
 * Throws a 400 AppError (not a 500) if the file can't be parsed —
 * a corrupt/unreadable upload is a CLIENT-side problem, not a server bug.
 *
 * NOTE: pdf-parse v2 uses a class-based API (PDFParse), different
 * from the old v1 function-style API. See their README if upgrading.
 */
async function extractTextFromPDF(filePath) {
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch (err) {
    throw new AppError(`Could not read file at ${filePath}`, 400, "FILE_NOT_FOUND");
  }

  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text.trim();
  } catch (err) {
    throw new AppError(
      "Could not extract text from PDF (it may be a scanned image with no text layer)",
      400,
      "PDF_PARSE_FAILED"
    );
  } finally {
    if (parser && typeof parser.destroy === "function") {
      await parser.destroy().catch(() => {});
    }
  }
}

module.exports = { extractTextFromPDF };