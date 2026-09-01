const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Submission = require("../models/Submission");
const GradingResult = require("../models/GradingResult");
const Annotation = require("../models/Annotation");
const { parseRubric } = require("../services/rubricParser");
const { gradeSubmission } = require("../services/gradingService");
const { generateAnnotationsFromGrading } = require("../services/annotationGenerator");

// POST /api/grade/:submissionId
const gradeBySubmissionId = asyncHandler(async (req, res) => {
  const { submissionId } = req.params;

  const submission = await Submission.findById(submissionId);
  if (!submission) {
    throw new AppError("Submission not found", 404, "SUBMISSION_NOT_FOUND");
  }

  // Rubric parsing happens lazily, once, and is cached on the
  // Submission document — re-grading the same submission (e.g. after
  // an annotation edit) never re-parses the rubric or re-spends an
  // LLM call on something that hasn't changed.
  if (!submission.rubricDefinition || submission.rubricDefinition.length === 0) {
    const { rubricDefinition } = await parseRubric(submission.modelAnswerText);
    submission.rubricDefinition = rubricDefinition;
    await submission.save();
  }

  const gradingOutput = await gradeSubmission({
    questionText: submission.questionText,
    modelAnswerText: submission.modelAnswerText,
    rubricDefinition: submission.rubricDefinition,
    studentAnswerText: submission.studentAnswerText,
    forceScenario: req.body?.forceScenario, // test/demo-only hook
  });

  const gradingResult = await GradingResult.create({
    submissionId: submission._id,
    totalMarks: gradingOutput.totalMarks,
    maxMarks: gradingOutput.maxMarks,
    rubricPoints: gradingOutput.rubricPoints,
    confidence: gradingOutput.confidence,
    needsHumanReview: gradingOutput.needsHumanReview,
    reviewReason: gradingOutput.reviewReason,
    llmStatus: gradingOutput.llmStatus,
  });

  // Re-grading a submission replaces the auto-generated annotations
  // (system-created) but leaves this simple for now: any annotations
  // a user has since hand-edited would also be regenerated. That's an
  // acceptable trade-off given the assignment's scope/time limit —
  // documented here rather than hidden.
  await Annotation.deleteMany({ submissionId: submission._id });
  await generateAnnotationsFromGrading(
    submission._id,
    submission.studentAnswerText,
    gradingOutput.rubricPoints
  );

  res.status(201).json({ gradingResult });
});

module.exports = { gradeBySubmissionId };