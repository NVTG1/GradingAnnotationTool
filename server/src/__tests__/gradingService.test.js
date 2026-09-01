const { gradeSubmission } = require("../services/gradingService");

const rubricDefinition = [
  { pointId: "p1", description: "Defines the concept correctly", maxMarks: 3 },
  { pointId: "p2", description: "Gives a correct example", maxMarks: 2 },
];

const baseArgs = {
  questionText: "Explain X.",
  modelAnswerText: "X is defined as... Example: ...",
  rubricDefinition,
};

describe("gradeSubmission", () => {
  it("handles a blank answer without calling the LLM", async () => {
    const result = await gradeSubmission({ ...baseArgs, studentAnswerText: "" });
    expect(result.totalMarks).toBe(0);
    expect(result.rubricPoints.every((p) => p.status === "missing")).toBe(true);
    expect(result.needsHumanReview).toBe(false); // blank is a known, confident outcome
  });

  it("grades a well-formed mock response and sums marks correctly", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "X is roughly this concept.",
    });
    expect(result.maxMarks).toBe(5);
    expect(result.totalMarks).toBe(
      result.rubricPoints.reduce((s, p) => s + p.awardedMarks, 0)
    );
  });

  it("clamps marks that exceed the rubric maximum", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "Some answer",
      forceScenario: "over_max",
    });
    const p1 = result.rubricPoints.find((p) => p.pointId === "p1");
    expect(p1.awardedMarks).toBeLessThanOrEqual(3); // never exceeds maxMarks
    expect(result.totalMarks).toBeLessThanOrEqual(result.maxMarks);
    expect(result.llmStatus).toBe("repaired");
  });

  it("handles malformed LLM output by flagging every point as missing, not crashing", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "Some answer",
      forceScenario: "malformed",
    });
    expect(result.totalMarks).toBe(0);
    expect(result.llmStatus).toBe("repaired");
    expect(result.needsHumanReview).toBe(true);
  });

  it("handles a simulated API failure gracefully and flags for human review", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "Some answer",
      forceScenario: "api_failure",
    });
    expect(result.llmStatus).toBe("failed");
    expect(result.needsHumanReview).toBe(true);
    expect(result.confidence).toBe(0);
  });

  it("never lets total exceed max regardless of rubric point count", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "Some answer",
      forceScenario: "over_max",
    });
    expect(result.totalMarks).toBeLessThanOrEqual(result.maxMarks);
  });
});
