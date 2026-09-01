// Usage: node debug-pdf.js "/path/to/file.pdf"
const fs = require("fs");
const { PDFParse } = require("pdf-parse");

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node debug-pdf.js <path-to-pdf>");
  process.exit(1);
}

(async () => {
  console.log("Reading:", filePath);
  const buffer = fs.readFileSync(filePath);
  console.log("File size:", buffer.length, "bytes");

  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    console.log("SUCCESS. Text length:", result.text.length);
    console.log("First 300 chars:\n", result.text.slice(0, 300));
  } catch (err) {
    console.error("PDF-PARSE FAILED:");
    console.error(err);
  } finally {
    if (parser) await parser.destroy().catch(() => {});
  }
})();