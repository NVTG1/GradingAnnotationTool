const { gradeWithLLM } = require("./llmClient");
const { parseLLMOutput, validateAndClamp } = require("./gradingValidator");

function buildPrompt({
  questionText,
  modelAnswerText,
  rubricDefinition,
  studentAnswerText,
}) {
  return `You are grading a student's answer against a rubric. Respond with ONLY valid JSON, no other text.

QUESTION:
${questionText}

MODEL ANSWER:
${modelAnswerText}

RUBRIC POINTS (award marks only up to maxMarks for each):
${JSON.stringify(rubricDefinition, null, 2)}

STUDENT ANSWER:
${studentAnswerText}

For each rubric point, return:
pointId,
awardedMarks,
status (correct|partial|missing|incorrect),
evidence (a verbatim excerpt of AT LEAST 6-8 words / a full clause or sentence copied exactly from the student answer — never a single word or short fragment like "circuit." — because a program will try to locate this exact text on the original page to draw a correction mark, and a one-word excerpt can match the wrong place or nowhere at all. Use an empty string if there is truly no such excerpt to quote.),
feedback (specific, actionable correction).

Respond with JSON of the shape:
{
  "rubricPoints": [
    {
      "pointId": "...",
      "awardedMarks": 0,
      "status": "correct",
      "evidence": "...",
      "feedback": "..."
    }
  ]
}`;
}

function computeConfidence({ wasClamped, llmStatus, rubricPoints }) {
  let confidence = 1.0;
  const reasons = [];

  if (llmStatus === "repaired" || wasClamped) {
    confidence -= 0.4;
    reasons.push("LLM output required correction");
  }

  const missingEvidence = rubricPoints.filter(
    (p) => p.status !== "missing" && !p.evidence,
  );
  if (missingEvidence.length > 0) {
    confidence -= 0.3;
    reasons.push("Some awarded points lack evidence");
  }

  confidence = Math.max(0, Math.min(1, confidence));
  const needsHumanReview = confidence < 0.7;

  return {
    confidence,
    needsHumanReview,
    reviewReason: needsHumanReview ? reasons.join("; ") : "",
  };
}

async function gradeSubmission({
  questionText,
  modelAnswerText,
  rubricDefinition,
  studentAnswerText,
  forceScenario,
}) {
  if (!studentAnswerText || !studentAnswerText.trim()) {
    const rubricPoints = rubricDefinition.map((rp) => ({
      pointId: rp.pointId,
      description: rp.description,
      maxMarks: rp.maxMarks,
      awardedMarks: 0,
      status: "missing",
      evidence: "",
      feedback: "No answer was provided for this point.",
    }));
    const maxMarks = rubricDefinition.reduce((s, p) => s + p.maxMarks, 0);
    return {
      rubricPoints,
      totalMarks: 0,
      maxMarks,
      confidence: 1.0,
      needsHumanReview: false,
      reviewReason: "",
      llmStatus: "ok",
    };
  }

  const prompt = buildPrompt({
    questionText,
    modelAnswerText,
    rubricDefinition,
    studentAnswerText,
  });

  let llmStatus = "ok";
  let rawText;
  try {
    rawText = await gradeWithLLM(prompt, { forceScenario });
  } catch (err) {
    return {
      rubricPoints: rubricDefinition.map((rp) => ({
        pointId: rp.pointId,
        description: rp.description,
        maxMarks: rp.maxMarks,
        awardedMarks: 0,
        status: "missing",
        evidence: "",
        feedback: "Automatic grading unavailable — pending human review.",
      })),
      totalMarks: 0,
      maxMarks: rubricDefinition.reduce((s, p) => s + p.maxMarks, 0),
      confidence: 0,
      needsHumanReview: true,
      reviewReason: `LLM error: ${err.message}`,
      llmStatus: "failed",
    };
  }

  let parsed;
  try {
    parsed = parseLLMOutput(rawText);
  } catch (err) {
    llmStatus = "repaired";
    parsed = { rubricPoints: [] };
  }

  const { rubricPoints, totalMarks, maxMarks, wasClamped } = validateAndClamp(
    parsed,
    rubricDefinition,
  );
  if (wasClamped && llmStatus === "ok") llmStatus = "repaired";
  if (process.env.LLM_PROVIDER === "mock")
    llmStatus = llmStatus === "ok" ? "mock" : llmStatus;

  const { confidence, needsHumanReview, reviewReason } = computeConfidence({
    wasClamped,
    llmStatus,
    rubricPoints,
  });

  return {
    rubricPoints,
    totalMarks,
    maxMarks,
    confidence,
    needsHumanReview,
    reviewReason,
    llmStatus,
  };
}

module.exports = { gradeSubmission, buildPrompt, computeConfidence };