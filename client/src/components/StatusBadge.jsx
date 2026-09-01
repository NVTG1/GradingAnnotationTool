// One badge component for both kinds of status the app shows:
// a rubric point's status (correct/partial/missing/incorrect) and an
// llmStatus (ok/mock/repaired/failed). Sharing the component keeps the
// color vocabulary consistent everywhere it appears.

const LABELS = {
  correct: "Correct",
  partial: "Partial",
  missing: "Missing",
  incorrect: "Incorrect",
  ok: "LLM ok",
  mock: "Mock LLM",
  repaired: "Auto-corrected",
  failed: "LLM failed",
};

export default function StatusBadge({ status }) {
  const label = LABELS[status] || status;
  return <span className={`badge badge-${status}`}>{label}</span>;
}
