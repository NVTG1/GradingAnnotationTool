// Surfaces the mock LLM's forceScenario hook (server/src/services/llmClient.js)
// as a dropdown. This isn't a "real" product feature — it exists so you (and
// whoever reviews the assignment) can trigger every required reliability
// test case from the UI itself, live, without curl: malformed model output,
// a simulated API failure, and marks that would exceed the rubric max.
// "Blank answer" doesn't need a flag — it's handled by submitting an empty
// student answer, which gradingService short-circuits before ever calling
// the LLM.
const SCENARIOS = [
  { value: "", label: "Normal grading" },
  { value: "malformed", label: "Simulate malformed LLM output" },
  { value: "api_failure", label: "Simulate LLM API failure" },
  { value: "over_max", label: "Simulate marks exceeding max" },
];

export default function ScenarioPicker({ value, onChange }) {
  return (
    <label className="scenario-picker">
      <span>Reliability test scenario</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {SCENARIOS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
    </label>
  );
}
