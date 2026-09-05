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

  it("awards full marks on every rubric point for a fully correct answer", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "A complete, fully correct answer.",
      forceScenario: "full_marks",
    });
    expect(result.totalMarks).toBe(result.maxMarks);
    expect(
      result.rubricPoints.every((p) => p.status === "correct")
    ).toBe(true);
    expect(
      result.rubricPoints.every((p) => p.awardedMarks === p.maxMarks)
    ).toBe(true);
  });

  it("awards partial marks on every rubric point for a partially correct answer", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "An answer that gets halfway there.",
      forceScenario: "partial_marks",
    });
    expect(result.totalMarks).toBeGreaterThan(0);
    expect(result.totalMarks).toBeLessThan(result.maxMarks);
    expect(
      result.rubricPoints.every((p) => p.status === "partial")
    ).toBe(true);
  });

  it("awards zero marks with status 'incorrect' (not 'missing') for a wrong but attempted answer", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "An answer that is confidently wrong.",
      forceScenario: "zero_marks",
    });
    expect(result.totalMarks).toBe(0);
    expect(
      result.rubricPoints.every((p) => p.status === "incorrect")
    ).toBe(true);
    // Distinguishes "attempted and wrong" from "not attempted" —
    // a rubric-wise breakdown that collapses both into "missing"
    // would mislead a teacher into thinking nothing was written.
    expect(
      result.rubricPoints.every((p) => p.status !== "missing")
    ).toBe(true);
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

  it("flags for human review when the rubric itself had to fall back, even on an otherwise-clean grade", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "A complete, fully correct answer.",
      forceScenario: "full_marks",
      rubricParseWarning: "No valid rubric points survived validation",
    });
    expect(result.needsHumanReview).toBe(true);
    expect(result.reviewReason).toMatch(/rubric/i);
    // The grade itself is still computed and usable, not blocked —
    // low confidence is a signal to check, not a refusal to grade.
    expect(result.totalMarks).toBe(result.maxMarks);
  });

  it("flags for human review on a blank answer when the rubric fell back (blank grade alone shouldn't hide a bad rubric)", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "",
      rubricParseWarning: "Rubric-parsing output was not valid JSON",
    });
    expect(result.totalMarks).toBe(0);
    expect(result.needsHumanReview).toBe(true);
    expect(result.reviewReason).toMatch(/rubric/i);
  });

  it("does not flag for human review when no rubric warning is present", async () => {
    const result = await gradeSubmission({
      ...baseArgs,
      studentAnswerText: "A complete, fully correct answer.",
      forceScenario: "full_marks",
    });
    expect(result.needsHumanReview).toBe(false);
  });
});