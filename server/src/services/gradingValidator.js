// This is the single most important file in the grading pipeline.
//
// The assignment states two rules as non-negotiable:
//   "Marks must never be higher than the marks available."
//   "The total must equal the sum of the rubric-point marks."
//
// We do NOT trust the LLM to honor these on its own — LLMs
// hallucinate, miscount, and sometimes return malformed JSON.
// This function is a deterministic, code-enforced gate that runs
// on every LLM response before it's allowed to reach the database
// or the user. If the raw text isn't even parseable, or is missing
// required fields, we flag for human review rather than guessing.

const AppError = require("../utils/AppError");

function parseLLMOutput(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new AppError("LLM returned malformed JSON", 502, "MALFORMED_OUTPUT");
  }

  if (!Array.isArray(parsed.rubricPoints)) {
    throw new AppError("LLM output missing rubricPoints array", 502, "MALFORMED_OUTPUT");
  }

  return parsed;
}

/**
 * Cross-references LLM output against the rubric definition (source
 * of truth for maxMarks/description) and clamps/validates marks.
 *
 * @param {object} llmOutput - parsed { rubricPoints: [...] }
 * @param {Array} rubricDefinition - [{ pointId, description, maxMarks }]
 * @returns {{ rubricPoints, totalMarks, maxMarks, wasClamped }}
 */
function validateAndClamp(llmOutput, rubricDefinition) {
  let wasClamped = false;

  const rubricPoints = rubricDefinition.map((rubricPoint) => {
    const llmPoint = llmOutput.rubricPoints.find(
      (p) => p.pointId === rubricPoint.pointId
    );

    // LLM didn't return this point at all -> treat as missing, 0 marks,
    // don't silently drop it (every rubric point must be accounted for).
    if (!llmPoint) {
      wasClamped = true;
      return {
        pointId: rubricPoint.pointId,
        description: rubricPoint.description,
        maxMarks: rubricPoint.maxMarks,
        awardedMarks: 0,
        status: "missing",
        evidence: "",
        feedback: "No evidence found for this rubric point.",
      };
    }

    let awarded = Number(llmPoint.awardedMarks);
    if (!Number.isFinite(awarded) || awarded < 0) {
      wasClamped = true;
      awarded = 0;
    }
    if (awarded > rubricPoint.maxMarks) {
      wasClamped = true;
      awarded = rubricPoint.maxMarks; // HARD clamp — the rule from the brief
    }

    return {
      pointId: rubricPoint.pointId,
      description: rubricPoint.description,
      maxMarks: rubricPoint.maxMarks,
      awardedMarks: awarded,
      status: llmPoint.status || "partial",
      evidence: llmPoint.evidence || "",
      feedback: llmPoint.feedback || "",
    };
  });

  // Total is COMPUTED from the parts, never taken from the LLM directly —
  // this is what guarantees "total must equal sum of rubric-point marks."
  const totalMarks = rubricPoints.reduce((sum, p) => sum + p.awardedMarks, 0);
  const maxMarks = rubricDefinition.reduce((sum, p) => sum + p.maxMarks, 0);

  return { rubricPoints, totalMarks, maxMarks, wasClamped };
}

module.exports = { parseLLMOutput, validateAndClamp };
