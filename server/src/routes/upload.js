const express = require("express");
const multer = require("multer");
const AppError = require("../utils/AppError");
const { uploadSubmission } = require("../controllers/uploadController");

const router = express.Router();

// --- Reliability: reject non-PDF and oversized uploads up front ---
// The brief asks us to handle "unclear answers" and malformed input
// gracefully. A .exe or a 200MB file renamed to .pdf shouldn't reach
// pdf-parse and blow up there with a confusing error — reject it here,
// at the edge, with a clear 400.
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB per file — generous for a 1-2 page scan

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "src/uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      // Passing an error here (rather than throwing) is how multer
      // expects fileFilter to reject a file — it surfaces via the
      // callback in the route below, not via asyncHandler.
      return cb(new AppError(`${file.fieldname} must be a PDF file`, 400, "INVALID_FILE_TYPE"));
    }
    cb(null, true);
  },
});

const uploadFields = upload.fields([
  { name: "questionPaper", maxCount: 1 },
  { name: "studentAnswer", maxCount: 1 },
  { name: "modelAnswer", maxCount: 1 },
]);

// multer's own errors (wrong type, too large) happen INSIDE its
// middleware, before our asyncHandler ever runs — they don't reject a
// promise, they call a callback. So we invoke multer manually here and
// route anything it hands back through next(), same as every other
// error in the app, instead of letting it 500 or crash the process.
function handleUpload(req, res, next) {
  uploadFields(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `${err.field || "File"} exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`
          : err.message;
      return next(new AppError(message, 400, "UPLOAD_ERROR"));
    }
    next(err); // our own AppError from fileFilter, or something unexpected
  });
}

// POST /api/upload
// Expects three files: questionPaper, studentAnswer, modelAnswer
router.post("/", handleUpload, uploadSubmission);

module.exports = router;