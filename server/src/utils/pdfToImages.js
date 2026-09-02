const path = require("path");
const { Worker } = require("worker_threads");
const AppError = require("./AppError");

// scale: 2 keeps page images legible for OCR without producing huge
// base64 payloads. maxPages guards against a mischievous/oversized
// upload turning into dozens of vision API calls — the brief only
// expects a 1-2 page answer, so 5 is a generous ceiling.
//
// This runs the actual PDF-to-image conversion in a worker thread
// (see pdfToImageWorker.js) rather than inline, because pdf-to-img's
// bundled pdfjs-dist collides with pdf-parse's bundled pdfjs-dist when
// both run in the same JS realm. Isolating it in a worker thread avoids
// that without pinning fragile transitive dependency versions.
function renderPdfPagesToImages(filePath, { scale = 2, maxPages = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "pdfToImageWorker.js"), {
      workerData: { filePath, scale, maxPages },
    });

    worker.once("message", (msg) => {
      worker.terminate();
      if (!msg.ok) {
        return reject(
          new AppError(`Could not render PDF pages as images for OCR: ${msg.error}`, 400, "PDF_RENDER_FAILED")
        );
      }
      if (msg.images.length === 0) {
        return reject(new AppError("PDF has no renderable pages", 400, "PDF_RENDER_FAILED"));
      }
      // Buffers cross the worker boundary as plain objects with numeric
      // keys, not Buffer instances — rewrap them.
      resolve(msg.images.map((img) => Buffer.from(img)));
    });

    worker.once("error", (err) => {
      worker.terminate();
      reject(new AppError(`OCR worker crashed: ${err.message}`, 500, "PDF_RENDER_FAILED"));
    });
  });
}

module.exports = { renderPdfPagesToImages };