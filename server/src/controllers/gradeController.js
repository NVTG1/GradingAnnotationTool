const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Submission = require("../models/Submission");
const GradingResult = require("../models/GradingResult");
const Annotation = require("../models/Annotation");
const { parseRubric } = require("../services/rubricParser");
const { gradeSubmission } = require("../services/gradingService");
const {
  generateAnnotationsFromGrading,
} = require("../services/annotationGenerator");

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
  let rubricParseWarning = null;
  if (
    !submission.rubricDefinition ||
    submission.rubricDefinition.length === 0
  ) {
    const { rubricDefinition, parseWarning } = await parseRubric(
      submission.modelAnswerText
    );
    submission.rubricDefinition = rubricDefinition;
    rubricParseWarning = parseWarning;
    await submission.save();
  }

  const gradingOutput = await gradeSubmission({
    questionText: submission.questionText,
    modelAnswerText: submission.modelAnswerText,
    rubricDefinition: submission.rubricDefinition,
    studentAnswerText: submission.studentAnswerText,
    forceScenario: req.body?.forceScenario, // test/demo-only hook
    // A rubric that had to fall back to the generic catch-all point
    // is a real reliability concern — without this, a submission
    // graded against a broken/unparseable rubric would come back
    // with normal-looking confidence and no human-review flag, even
    // though the rubric itself couldn't be trusted.
    rubricParseWarning,
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

  // Re-grading a submission regenerates the AUTO-GENERATED annotations
  // only — both fully manual ones (createdBy: "user") AND any
  // system-generated annotation a teacher has since edited/moved/
  // resized (editedByUser: true) are left untouched. Deleting
  // everything indiscriminately, as this used to do, meant a
  // teacher's manual corrections were silently wiped the moment
  // anyone re-graded the same submission (e.g. after tweaking a
  // rubric or retrying a failed LLM call), which directly breaks
  // "annotations persist without a re-grade."
  await Annotation.deleteMany({
    submissionId: submission._id,
    createdBy: "system",
    editedByUser: { $ne: true },
  });
  await generateAnnotationsFromGrading(
    submission._id,
    submission.studentAnswerText,
    gradingOutput.rubricPoints,
    submission.studentAnswerLayout,
  );
  
  res.status(201).json({ gradingResult });
});

module.exports = { gradeBySubmissionId };