import { useState } from "react";
import Sidebar from "./components/Sidebar";
import UploadForm from "./components/UploadForm";
import GradingResultView from "./components/GradingResultView";
import AnnotationEditor from "./components/AnnotationEditor";
import HistoryList from "./components/HistoryList";
import { fetchHistoryItem, fetchAnnotations } from "./api/gradesenseApi";

export default function App() {
  const [view, setView] = useState("upload");
  const [gradingResult, setGradingResult] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [error, setError] = useState(null);

  async function loadFullResult(gradingResultId) {
    setView("loading");
    setError(null);

    try {
      const {
        gradingResult: fullResult,
        submission: fullSubmission,
      } = await fetchHistoryItem(gradingResultId);

      const { annotations: anns } = await fetchAnnotations(
        fullSubmission._id
      );

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

  const pageInfo = {
    upload: {
      eyebrow: "Workspace",
      title: "New submission",
      description:
        "Upload a question paper, student answer and model rubric to begin.",
    },
    loading: {
      eyebrow: "Processing",
      title: "Loading result",
      description: "Preparing the grading workspace.",
    },
    result: {
      eyebrow: "Review workspace",
      title: "Grading result",
      description:
        "Review the AI assessment and refine annotations before exporting.",
    },
    history: {
      eyebrow: "Archive",
      title: "Grading history",
      description:
        "Browse previous grading results and reopen any submission.",
    },
  };

  const currentPage = pageInfo[view] || pageInfo.upload;

  return (
    <div className="app-shell">
      <Sidebar view={view} onNavigate={handleNavigate} />

      <main className="app-main">
        <header className="topbar">
          <div className="topbar-copy">
            <span className="eyebrow">{currentPage.eyebrow}</span>
            <h1>{currentPage.title}</h1>
            <p>{currentPage.description}</p>
          </div>

          <div className="topbar-status">
            <span className="status-dot" />
            AI grading workspace
          </div>
        </header>

        {error && (
          <div className="error-banner top-error">
            <span className="error-icon">!</span>
            <span>{error}</span>
          </div>
        )}

        <section className="page-content">
          {view === "upload" && (
            <UploadForm onGraded={handleGraded} />
          )}

          {view === "loading" && (
            <div className="panel loading-panel">
              <div className="loading-spinner" />
              <h2>Loading result…</h2>
              <p className="muted">
                Fetching the submission, grading result and annotations.
              </p>
            </div>
          )}

          {view === "result" && gradingResult && submission && (
            <div className="result-workspace">
              <div className="panel result-panel">
                <GradingResultView gradingResult={gradingResult} />
              </div>

              <AnnotationEditor
                submissionId={submission._id}
                studentAnswerText={submission.studentAnswerText}
                annotations={annotations}
                setAnnotations={setAnnotations}
              />
            </div>
          )}

          {view === "history" && (
            <HistoryList onOpen={handleOpenHistoryItem} />
          )}
        </section>
      </main>
    </div>
  );
}