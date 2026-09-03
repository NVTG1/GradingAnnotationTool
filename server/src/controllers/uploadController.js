const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Submission = require("../models/Submission");
const {
  extractTextFromPDF,
} = require("../utils/pdfExtractor");

const uploadSubmission =
  asyncHandler(async (req, res) => {
    const files = req.files || {};

    const required = [
      "questionPaper",
      "studentAnswer",
      "modelAnswer",
    ];

    const missing =
      required.filter(
        (key) => !files[key]
      );

    if (missing.length > 0) {
      throw new AppError(
        `Missing required file(s): ${missing.join(", ")}`,
        400,
        "MISSING_FILES"
      );
    }

    const questionPaperPath =
      files.questionPaper[0].path;

    const studentAnswerPath =
      files.studentAnswer[0].path;

    const modelAnswerPath =
      files.modelAnswer[0].path;

    const [
      questionText,
      modelAnswerText,
    ] = await Promise.all([
      extractTextFromPDF(
        questionPaperPath
      ),

      extractTextFromPDF(
        modelAnswerPath
      ),
    ]);

    let studentAnswerText = "";
    let studentAnswerLayout = [];

    try {
      /*
       * IMPORTANT:
       * Student answer is extracted with layout
       * because annotations must be mapped to the
       * original handwritten PDF.
       */
      const extracted =
        await extractTextFromPDF(
          studentAnswerPath,
          {
            withLayout: true,
          }
        );

      if (
        typeof extracted ===
        "string"
      ) {
        studentAnswerText =
          extracted;
      } else {
        studentAnswerText =
          extracted.text || "";

        studentAnswerLayout =
          extracted.pages || [];
      }
    } catch (err) {
      console.error(
        "Student answer extraction failed:",
        err
      );

      studentAnswerText = "";
      studentAnswerLayout = [];
    }

    const submission =
      await Submission.create({
        questionPaperPath,
        studentAnswerPath,
        modelAnswerPath,

        questionText,
        modelAnswerText,

        studentAnswerText,
        studentAnswerLayout,
      });

    res.status(201).json({
      message:
        "Files received and processed",

      submissionId:
        submission._id,

      textPreview: {
        questionText:
          questionText.slice(0, 200),

        modelAnswerText:
          modelAnswerText.slice(
            0,
            200
          ),

        studentAnswerText:
          studentAnswerText.slice(
            0,
            500
          ),
      },

      ocrPages:
        studentAnswerLayout.length,
    });
  });

module.exports = {
  uploadSubmission,
};