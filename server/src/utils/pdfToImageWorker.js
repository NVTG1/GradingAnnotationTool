// Runs in its own worker thread, NOT the main process.
//
// Why this needs to be a separate thread at all: pdf-parse and
// pdf-to-img each bundle their own (different) version of pdfjs-dist,
// which keeps global state (GlobalWorkerOptions, API/worker version
// checks). If both libraries are ever required in the same JS
// realm, pdf-to-img fails with something like:
//   "The API version 'X' does not match the Worker version 'Y'"
// A worker_thread gets its own module registry, so pdf-to-img's
// pdfjs-dist never collides with the one pdf-parse already loaded on
// the main thread — even though both run in the same Node process.
const { parentPort, workerData } = require("worker_threads");

async function run() {
  const { filePath, scale, maxPages } = workerData;
  try {
    const { pdf: pdfToImg } = await import("pdf-to-img");
    const document = await pdfToImg(filePath, { scale });

    const images = [];
    for await (const image of document) {
      images.push(image); // PNG Buffer
      if (images.length >= maxPages) break;
    }
    parentPort.postMessage({ ok: true, images });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err.message });
  }
}

run();