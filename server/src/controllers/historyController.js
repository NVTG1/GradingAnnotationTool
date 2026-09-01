const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const GradingResult = require("../models/GradingResult");
const Submission = require("../models/Submission");

// GET /api/history
// Returns a lightweight list — full rubric detail is fetched per-item
// via GET /api/history/:id, so the list view stays fast even with
// many past gradings.
const listHistory = asyncHandler(async (req, res) => {
  const results = await GradingResult.find()
    .sort({ createdAt: -1 })
    .select("submissionId totalMarks maxMarks confidence needsHumanReview llmStatus createdAt")
    .limit(100);

  res.json({ history: results });
});

// GET /api/history/:id
// Full detail for one grading result, including the original
// submission's extracted text (useful for the annotation viewer).
const getHistoryItem = asyncHandler(async (req, res) => {
  const gradingResult = await GradingResult.findById(req.params.id);
  if (!gradingResult) {
    throw new AppError("Grading result not found", 404, "GRADING_RESULT_NOT_FOUND");
  }

  const submission = await Submission.findById(gradingResult.submissionId);

  res.json({ gradingResult, submission });
});

module.exports = { listHistory, getHistoryItem };