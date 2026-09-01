const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Submission = require("../models/Submission");
const Annotation = require("../models/Annotation");
const { buildAnnotatedPDF } = require("../services/pdfExporter");

// GET /api/export/:submissionId
// Renders a NEW PDF from the submission's text + whatever annotations
// currently exist. Always reads live state — never a cached/stale
// export — so editing an annotation and re-hitting this endpoint
// reflects the edit immediately, with no re-grading involved.
const exportAnnotatedPDF = asyncHandler(async (req, res) => {
  const submission = await Submission.findById(req.params.submissionId);
  if (!submission) {
    throw new AppError("Submission not found", 404, "SUBMISSION_NOT_FOUND");
  }

  const annotations = await Annotation.find({ submissionId: submission._id }).sort({
    startOffset: 1,
  });

  const pdfBytes = await buildAnnotatedPDF(submission.studentAnswerText, annotations);

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="annotated-${submission._id}.pdf"`,
  });
  res.send(Buffer.from(pdfBytes));
});

module.exports = { exportAnnotatedPDF };