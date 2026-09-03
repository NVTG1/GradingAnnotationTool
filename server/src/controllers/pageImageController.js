const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Submission = require("../models/Submission");
const {
  renderPdfPagesToImages,
} = require("../utils/pdfToImages");

const getPageImages = asyncHandler(
  async (req, res) => {
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

    const images =
      await renderPdfPagesToImages(
        submission.studentAnswerPath,
        { scale: 1.5 }
      );

    const pages = images.map(
      (buffer, index) => ({
        pageNumber: index + 1,
        image: `data:image/png;base64,${buffer.toString(
          "base64"
        )}`,
      })
    );

    res.json({ pages });
  }
);

module.exports = { getPageImages };