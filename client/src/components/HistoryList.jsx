import { useEffect, useState } from "react";
import { fetchHistory } from "../api/gradesenseApi";
import StatusBadge from "./StatusBadge";

export default function HistoryList({ onOpen }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchHistory()
      .then((res) => setHistory(res.history))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="panel">
      <h1>History</h1>
      <p className="lede">Every past grading result, most recent first. Nothing here is re-graded by opening it.</p>

      {error && <div className="error-banner">{error}</div>}
      {!history && !error && <p className="muted">Loading…</p>}
      {history && history.length === 0 && <p className="muted">No gradings yet — start a new submission.</p>}

      {history && history.length > 0 && (
        <table className="history-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Score</th>
              <th>Confidence</th>
              <th>LLM status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {history.map((item) => (
              <tr key={item._id}>
                <td>{new Date(item.createdAt).toLocaleString()}</td>
                <td>
                  {item.totalMarks} / {item.maxMarks}
                </td>
                <td>{Math.round(item.confidence * 100)}%</td>
                <td>
                  <StatusBadge status={item.llmStatus} />
                  {item.needsHumanReview && <span className="badge badge-review">Review</span>}
                </td>
                <td>
                  <button className="btn-ghost" onClick={() => onOpen(item._id)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
