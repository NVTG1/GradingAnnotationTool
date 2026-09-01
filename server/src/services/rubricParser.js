const { gradeWithLLM } = require("./llmClient");
const AppError = require("../utils/AppError");

function buildRubricParsePrompt(modelAnswerText) {
  return `You are extracting a structured grading rubric from a model-answer document. Respond with ONLY valid JSON, no other text.

DOCUMENT:
${modelAnswerText}

Identify each distinct rubric point (a gradeable criterion) and its maximum marks. Assign each a short pointId like "p1", "p2", etc.

Respond with JSON of the shape: { "rubricPoints": [ { "pointId": "p1", "description": "...", "maxMarks": 0 } ] }`;
}

/**
 * Parses raw rubric text into a structured rubricDefinition array.
 * Falls back to a single catch-all rubric point if parsing fails,
 * rather than throwing — a submission should still be gradeable
 * (with a low-confidence flag) even if rubric parsing has trouble.
 */
async function parseRubric(modelAnswerText) {
  const prompt = buildRubricParsePrompt(modelAnswerText);

  let rawText;
  try {
    rawText = await gradeWithLLM(prompt, { mode: "rubric" });
  } catch (err) {
    return fallbackRubric(modelAnswerText, `LLM error during rubric parsing: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return fallbackRubric(modelAnswerText, "Rubric-parsing output was not valid JSON");
  }

  if (!Array.isArray(parsed.rubricPoints) || parsed.rubricPoints.length === 0) {
    return fallbackRubric(modelAnswerText, "Rubric-parsing output had no usable points");
  }

  const rubricDefinition = parsed.rubricPoints
    .filter((p) => p.pointId && p.description && Number.isFinite(Number(p.maxMarks)))
    .map((p) => ({
      pointId: String(p.pointId),
      description: String(p.description),
      maxMarks: Math.max(0, Number(p.maxMarks)),
    }));

  if (rubricDefinition.length === 0) {
    return fallbackRubric(modelAnswerText, "No valid rubric points survived validation");
  }

  return { rubricDefinition, parseWarning: null };
}

// A safe, deterministic fallback so a submission is never un-gradeable
// just because rubric extraction had trouble. The single point makes
// the degraded state visible (low marks resolution) rather than hidden.
function fallbackRubric(modelAnswerText, reason) {
  return {
    rubricDefinition: [
      { pointId: "p1", description: "Overall answer quality vs. model answer", maxMarks: 10 },
    ],
    parseWarning: reason,
  };
}

module.exports = { parseRubric };