const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Submission = require("../models/Submission");
const { extractTextFromPDF } = require("../utils/pdfExtractor");

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

  const questionPaperPath = files.questionPaper[0].path;
  const studentAnswerPath = files.studentAnswer[0].path;
  const modelAnswerPath = files.modelAnswer[0].path;

  // Extract text from all three PDFs up front. If the STUDENT answer
  // fails to extract, we don't hard-fail the whole upload — a blank/
  // unreadable answer is itself a valid grading scenario the brief
  // requires us to handle (it'll just grade as blank). Question paper
  // and model answer failing to extract, though, IS a hard failure —
  // we can't grade anything without those.
  const [questionText, modelAnswerText] = await Promise.all([
    extractTextFromPDF(questionPaperPath),
    extractTextFromPDF(modelAnswerPath),
  ]);

  let studentAnswerText = "";
  try {
    studentAnswerText = await extractTextFromPDF(studentAnswerPath);
  } catch (err) {
    // Treated as a blank/unreadable answer rather than an upload failure.
    studentAnswerText = "";
  }

  const submission = await Submission.create({
    questionPaperPath,
    studentAnswerPath,
    modelAnswerPath,
    questionText,
    modelAnswerText,
    studentAnswerText,
  });

  res.status(201).json({
    message: "Files received and processed",
    submissionId: submission._id,
    textPreview: {
      questionText: questionText.slice(0, 200),
      modelAnswerText: modelAnswerText.slice(0, 200),
      studentAnswerText: studentAnswerText.slice(0, 200),
    },
  });
});

module.exports = { uploadSubmission };