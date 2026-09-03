const fs = require("fs/promises");
const { PDFParse } = require("pdf-parse");
const AppError = require("./AppError");
const { renderPdfPagesToImages } = require("./pdfToImages");
const { transcribeHandwrittenImages } = require("../services/llmClient");

function hasUsableTextLayer(text) {
  if (!text) return false;

  const cleaned = text
    .replace(/\s+/g, " ")
    .trim();

  const letters =
    (cleaned.match(/[a-zA-Z]/g) || []).length;

  const words = cleaned
    .split(/\s+/)
    .filter((word) => /[a-zA-Z]{2,}/.test(word));

  return letters >= 40 && words.length >= 8;
}

async function readTextLayer(filePath) {
  const buffer = await fs.readFile(filePath);

  let parser;

  try {
    parser = new PDFParse({
      data: buffer,
    });

    const result = await parser.getText();

    return result.text.trim();
  } catch (err) {
    return "";
  } finally {
    if (
      parser &&
      typeof parser.destroy === "function"
    ) {
      await parser.destroy().catch(() => {});
    }
  }
}

async function extractTextFromPDF(
  filePath,
  {
    forceScenario,
    withLayout = false,
  } = {}
) {
  try {
    await fs.access(filePath);
  } catch (err) {
    throw new AppError(
      `Could not read file at ${filePath}`,
      400,
      "FILE_NOT_FOUND"
    );
  }

  const textLayer = await readTextLayer(filePath);

  /*
   * Normal text PDFs don't need OCR.
   */
  if (
    hasUsableTextLayer(textLayer) &&
    !withLayout
  ) {
    return textLayer;
  }

  /*
   * Student answer PDFs need OCR layout information so that
   * annotations can later be placed on the original PDF page.
   */
  if (
    hasUsableTextLayer(textLayer) &&
    withLayout
  ) {
    console.log(
      "Text layer found, but layout OCR is required for annotations."
    );
  } else {
    console.log(
      "Text layer unusable. Falling back to OCR..."
    );
  }

  try {
    const pageImages =
      await renderPdfPagesToImages(filePath);

    console.log(
      `Rendered ${pageImages.length} pages for OCR`
    );

    const ocrResult =
      await transcribeHandwrittenImages(
        pageImages,
        {
          forceScenario,
          withLayout,
        }
      );

    if (withLayout) {
      console.log(
        `OCR returned ${ocrResult.length} pages`
      );

      const text = ocrResult
        .map((page) => page.text || "")
        .filter(Boolean)
        .join("\n\n")
        .trim();

      console.log("OCR TEXT:", text);

      if (text) {
        return {
          text,
          pages: ocrResult,
        };
      }
    } else {
      if (
        typeof ocrResult === "string" &&
        ocrResult.replace(/\s/g, "").length > 0
      ) {
        console.log(
          "OCR RESULT:",
          ocrResult
        );

        return ocrResult.trim();
      }
    }
  } catch (ocrErr) {
    console.error(
      "OCR FALLBACK FAILED:",
      {
        message: ocrErr.message,
        code: ocrErr.code,
        status: ocrErr.status,
        stack: ocrErr.stack,
      }
    );
  }

  /*
   * If layout OCR failed but there was usable PDF text,
   * still return the text so grading can continue.
   */
  if (
    withLayout &&
    hasUsableTextLayer(textLayer)
  ) {
    return {
      text: textLayer,
      pages: [],
    };
  }

  throw new AppError(
    "Could not extract text from PDF (it may be a scanned/handwritten image with no readable content)",
    400,
    "PDF_PARSE_FAILED"
  );
}

module.exports = {
  extractTextFromPDF,
  hasUsableTextLayer,
};