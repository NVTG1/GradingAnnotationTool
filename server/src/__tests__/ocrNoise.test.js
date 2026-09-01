const { gradeSubmission } = require("../services/gradingService");

const rubricDefinition = [
  { pointId: "p1", description: "Defines the concept correctly", maxMarks: 3 },
];

describe("gradeSubmission — OCR-like spelling errors", () => {
  it("still produces a valid, marks-capped result when the student answer has garbled/misspelled text", async () => {
    // Simulates what OCR commonly produces: dropped letters, swapped
    // characters, merged words — the kind of noise a scanned answer
    // sheet introduces even before the LLM sees it.
    const noisyText =
      "Th e batery previdez tha p0tential differance taht drivs curent thruogh teh circut.";

    const result = await gradeSubmission({
      questionText: "Explain how a circuit works.",
      modelAnswerText: "A circuit is a closed path for current, powered by a battery.",
      rubricDefinition,
      studentAnswerText: noisyText,
    });

    // We're not asserting the LLM "understood" the garbled text
    // correctly (that's a model-quality question, not ours to test
    // with a mock) — we're asserting the PIPELINE doesn't break:
    // marks still validate, total still never exceeds max, and the
    // system still returns a well-formed result rather than crashing
    // or throwing on noisy input.
    expect(result.totalMarks).toBeLessThanOrEqual(result.maxMarks);
    expect(result.rubricPoints.length).toBe(rubricDefinition.length);
    expect(typeof result.confidence).toBe("number");
  });
});