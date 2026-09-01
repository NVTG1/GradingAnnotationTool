// Turns grading evidence into positioned annotations by locating the
// evidence text within the actual student answer. This runs once,
// right after grading — after that, annotations are fully independent
// and editable (see Annotation.js for why).

const Annotation = require("../models/Annotation");

function annotationTypeForStatus(status) {
  if (status === "incorrect") return "strikethrough";
  if (status === "missing") return "comment"; // nothing to underline — it's absent
  return "underline"; // correct / partial
}

/**
 * @param {string} submissionId
 * @param {string} studentAnswerText
 * @param {Array} rubricPoints - graded rubric points with .evidence and .feedback
 */
async function generateAnnotationsFromGrading(submissionId, studentAnswerText, rubricPoints) {
  const annotationsToCreate = [];

  for (const point of rubricPoints) {
    if (point.status === "missing" || !point.evidence) {
      // No text to anchor to — still worth surfacing as a comment,
      // anchored at the very start of the answer (offset 0) so it's
      // visible without claiming a false location.
      annotationsToCreate.push({
        submissionId,
        type: "comment",
        anchorText: "",
        startOffset: 0,
        endOffset: 0,
        note: `[${point.description}] ${point.feedback}`,
        createdBy: "system",
      });
      continue;
    }

    // Try to locate the evidence text within the actual student answer.
    // Evidence is often a paraphrase, not a verbatim quote, so we do a
    // best-effort substring search rather than requiring an exact match.
    const index = studentAnswerText.indexOf(point.evidence);

    if (index === -1) {
      // Evidence didn't match verbatim (expected — the LLM paraphrases).
      // Fall back to an unanchored comment rather than guessing a
      // wrong location, which would misdirect the teacher.
      annotationsToCreate.push({
        submissionId,
        type: "comment",
        anchorText: "",
        startOffset: 0,
        endOffset: 0,
        note: `[${point.description}] ${point.feedback} (evidence: "${point.evidence}")`,
        createdBy: "system",
      });
      continue;
    }

    annotationsToCreate.push({
      submissionId,
      type: annotationTypeForStatus(point.status),
      anchorText: point.evidence,
      startOffset: index,
      endOffset: index + point.evidence.length,
      note: point.feedback,
      createdBy: "system",
    });
  }

  return Annotation.insertMany(annotationsToCreate);
}

module.exports = { generateAnnotationsFromGrading };