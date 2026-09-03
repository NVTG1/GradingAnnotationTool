const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Submission = require("../models/Submission");
const Annotation = require("../models/Annotation");
const {
  buildAnnotatedPDF,
} = require("../services/pdfExporter");

const exportAnnotatedPDF =
  asyncHandler(async (req, res) => {
    const submission =
      await Submission.findById(
        req.params.submissionId
      );

    if (!submission) {
      throw new AppError(
        "Submission not found",
        404,
        "SUBMISSION_NOT_FOUND"
      );
    }

    const annotations =
      await Annotation.find({
        submissionId:
          submission._id,
      }).sort({
        pageNumber: 1,
        y: 1,
        startOffset: 1,
      });

    /*
     * Pass the ORIGINAL uploaded PDF.
     */
    const pdfBytes =
      await buildAnnotatedPDF(
        submission.studentAnswerPath,
        submission.studentAnswerText,
        submission.studentAnswerLayout,
        annotations
      );

    res.set({
      "Content-Type":
        "application/pdf",

      "Content-Disposition":
        `attachment; filename="annotated-${submission._id}.pdf"`,
    });

    res.send(
      Buffer.from(pdfBytes)
    );
  });

module.exports = {
  exportAnnotatedPDF,
};