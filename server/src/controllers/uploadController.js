const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");

// POST /api/upload
const uploadSubmission = asyncHandler(async (req, res) => {
  const files = req.files || {};

  // --- Validation: this is part of "Reliability" from the brief ---
  // A missing required file is a CLIENT error (400), not a server
  // crash. We check explicitly rather than letting a later step
  // fail with a confusing "cannot read property of undefined".
  const required = ["questionPaper", "studentAnswer", "modelAnswer"];
  const missing = required.filter((key) => !files[key]);

  if (missing.length > 0) {
    throw new AppError(
      `Missing required file(s): ${missing.join(", ")}`,
      400,
      "MISSING_FILES"
    );
  }

  // For now we just confirm what we received. Next step: save a
  // Submission document to MongoDB referencing these file paths.
  const received = required.map((key) => ({
    field: key,
    originalName: files[key][0].originalname,
    storedPath: files[key][0].path,
    sizeBytes: files[key][0].size,
  }));

  res.status(201).json({
    message: "Files received",
    files: received,
  });
});

module.exports = { uploadSubmission };
