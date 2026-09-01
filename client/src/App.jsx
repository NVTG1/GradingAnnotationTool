import { useState } from "react";
import Sidebar from "./components/Sidebar";
import UploadForm from "./components/UploadForm";
import GradingResultView from "./components/GradingResultView";
import AnnotationEditor from "./components/AnnotationEditor";
import HistoryList from "./components/HistoryList";
import { fetchHistoryItem, fetchAnnotations } from "./api/gradesenseApi";

// Deliberately no router: the app has exactly five states someone can be
// in, and a component swap on plain state covers that without pulling in
// react-router for what would be four routes. If this grows past a
// single reviewer-facing tool, that's the first dependency to add.
export default function App() {
  const [view, setView] = useState("upload"); // upload | loading | result | history | historyDetail
  const [gradingResult, setGradingResult] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [error, setError] = useState(null);

  // After POST /api/grade/:id, the response only contains the
  // GradingResult — not the full submission text. GET /api/history/:id
  // (keyed by the GradingResult's own _id) is what the backend already
  // exposes for "full detail on one grading result", so we reuse it here
  // instead of adding a new endpoint just for this.
  async function loadFullResult(gradingResultId) {
    setView("loading");
    setError(null);
    try {
      const { gradingResult: fullResult, submission: fullSubmission } = await fetchHistoryItem(
        gradingResultId
      );
      const { annotations: anns } = await fetchAnnotations(fullSubmission._id);
      setGradingResult(fullResult);
      setSubmission(fullSubmission);
      setAnnotations(anns);
      setView("result");
    } catch (err) {
      setError(err.message);
      setView("upload");
    }
  }

  function handleGraded(newGradingResult) {
    loadFullResult(newGradingResult._id);
  }

  function handleOpenHistoryItem(gradingResultId) {
    loadFullResult(gradingResultId);
  }

  function handleNavigate(target) {
    setError(null);
    if (target === "upload") {
      setGradingResult(null);
      setSubmission(null);
      setAnnotations([]);
    }
    setView(target);
  }

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={handleNavigate} />

      <main className="app-main">
        {error && <div className="error-banner top-error">{error}</div>}

        {view === "upload" && <UploadForm onGraded={handleGraded} />}

        {view === "loading" && (
          <div className="panel">
            <p className="muted">Loading result…</p>
          </div>
        )}

        {view === "result" && gradingResult && submission && (
          <div className="panel">
            <GradingResultView gradingResult={gradingResult} />
            <AnnotationEditor
              submissionId={submission._id}
              studentAnswerText={submission.studentAnswerText}
              annotations={annotations}
              setAnnotations={setAnnotations}
            />
          </div>
        )}

        {view === "history" && <HistoryList onOpen={handleOpenHistoryItem} />}
      </main>
    </div>
  );
}
