import StatusBadge from "./StatusBadge";

export default function GradingResultView({ gradingResult }) {
  const { totalMarks, maxMarks, rubricPoints, confidence, needsHumanReview, reviewReason, llmStatus } =
    gradingResult;

  return (
    <div className="grading-result">
      <div className="score-row">
        <div className="score-stamp">
          <span className="score-value">{totalMarks}</span>
          <span className="score-max">/ {maxMarks}</span>
        </div>

        <div className="score-meta">
          <div className="confidence-line">
            <span>Confidence</span>
            <div className="confidence-bar">
              <div
                className="confidence-fill"
                style={{ width: `${Math.round(confidence * 100)}%` }}
              />
            </div>
            <span>{Math.round(confidence * 100)}%</span>
          </div>
          <div className="meta-badges">
            <StatusBadge status={llmStatus} />
            {needsHumanReview && <span className="badge badge-review">Needs human review</span>}
          </div>
          {needsHumanReview && reviewReason && (
            <p className="review-reason">{reviewReason}</p>
          )}
        </div>
      </div>

      <table className="rubric-table">
        <thead>
          <tr>
            <th>Rubric point</th>
            <th>Status</th>
            <th>Marks</th>
            <th>Evidence</th>
            <th>Feedback</th>
          </tr>
        </thead>
        <tbody>
          {rubricPoints.map((point) => (
            <tr key={point.pointId}>
              <td>{point.description}</td>
              <td>
                <StatusBadge status={point.status} />
              </td>
              <td className="marks-cell">
                {point.awardedMarks} / {point.maxMarks}
              </td>
              <td className="evidence-cell">{point.evidence || <em>—</em>}</td>
              <td>{point.feedback}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
