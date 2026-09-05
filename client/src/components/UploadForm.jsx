import { useState } from "react";
import { uploadSubmission, gradeSubmission } from "../api/gradesenseApi";
import ScenarioPicker from "./ScenarioPicker";

const FILE_FIELDS = [
  {
    key: "questionPaper",
    label: "Question paper",
    hint: "The question paper the student was answering.",
  },
  {
    key: "studentAnswer",
    label: "Student answer",
    hint: "The handwritten or typed answer submitted by the student.",
  },
  {
    key: "modelAnswer",
    label: "Model answer & rubric",
    hint: "The expected answer and grading rubric.",
  },
];

export default function UploadForm({ onGraded }) {
  const [files, setFiles] = useState({
    questionPaper: null,
    studentAnswer: null,
    modelAnswer: null,
  });

  const [scenario, setScenario] = useState("");
  const [stage, setStage] = useState("idle");
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submissionId, setSubmissionId] = useState(null);

  const allFilesSelected =
    Boolean(files.questionPaper) &&
    Boolean(files.studentAnswer) &&
    Boolean(files.modelAnswer);

  const isBusy =
    stage === "uploading" ||
    stage === "grading";

  const canUpload =
    allFilesSelected &&
    !isBusy &&
    stage !== "uploaded";

  function handleFileChange(key, event) {
    const file = event.target.files?.[0] || null;

    if (!file) return;

    if (file.type !== "application/pdf") {
      setError(`${key} must be a PDF file.`);
      event.target.value = "";
      return;
    }

    setError(null);

    setFiles((current) => ({
      ...current,
      [key]: file,
    }));
  }

  async function handleUpload(event) {
    event.preventDefault();

    setError(null);

    if (!files.questionPaper) {
      setError("Please select the question paper PDF.");
      return;
    }

    if (!files.studentAnswer) {
      setError("Please select the student answer PDF.");
      return;
    }

    if (!files.modelAnswer) {
      setError("Please select the model answer & rubric PDF.");
      return;
    }

    setStage("uploading");

    try {
      const result = await uploadSubmission(files);

      setSubmissionId(result.submissionId);
      setPreview(result.textPreview);
      setStage("uploaded");
    } catch (err) {
      console.error("Upload failed:", err);

      setError(
        err?.message ||
          "Upload failed. Please check that the backend server is running."
      );

      setStage("error");
    }
  }

  async function handleGrade() {
    if (!submissionId) {
      setError("No uploaded submission is available to grade.");
      return;
    }

    setError(null);
    setStage("grading");

    try {
      const { gradingResult } = await gradeSubmission(
        submissionId,
        scenario || undefined
      );

      onGraded(gradingResult);
    } catch (err) {
      console.error("Grading failed:", err);

      setError(
        err?.message ||
          "Grading failed. Please try again."
      );

      setStage("uploaded");
    }
  }

  return (
    <div className="panel">
      <h1>New submission</h1>

      <p className="lede">
        Upload the question paper, student's answer, and model
        answer with its rubric. The files are processed first,
        then grading runs as a separate step.
      </p>

      <form
        onSubmit={handleUpload}
        className="upload-grid"
      >
        {FILE_FIELDS.map((field) => (
          <label
            key={field.key}
            className="upload-field"
          >
            <span className="upload-field-label">
              {field.label}
            </span>

            <span className="upload-field-hint">
              {field.hint}
            </span>

            <input
              type="file"
              accept=".pdf,application/pdf"
              disabled={isBusy || stage === "uploaded"}
              onChange={(event) =>
                handleFileChange(
                  field.key,
                  event
                )
              }
            />

            {files[field.key] && (
              <span className="upload-filename">
                ✓ {files[field.key].name}
              </span>
            )}
          </label>
        ))}

        {stage !== "uploaded" &&
          stage !== "grading" && (
            <button
              type="submit"
              className="btn-primary"
              disabled={!canUpload}
            >
              {stage === "uploading"
                ? "Uploading…"
                : "Upload PDFs"}
            </button>
          )}
      </form>

      {error && (
        <div className="error-banner">
          <span className="error-icon">!</span>
          <span>{error}</span>
        </div>
      )}

      {preview &&
        (stage === "uploaded" ||
          stage === "grading") && (
          <div className="preview-block">
            <h2>Extracted text preview</h2>

            <div className="preview-grid">
              <div>
                <h3>Question</h3>
                <p>
                  {preview.questionText || (
                    <em>No text extracted</em>
                  )}
                </p>
              </div>

              <div>
                <h3>Student answer</h3>
                <p>
                  {preview.studentAnswerText || (
                    <em>
                      No text extracted — this may be
                      a blank handwritten answer.
                    </em>
                  )}
                </p>
              </div>

              <div>
                <h3>Model answer</h3>
                <p>
                  {preview.modelAnswerText || (
                    <em>No text extracted</em>
                  )}
                </p>
              </div>
            </div>

            <div className="grade-controls">
              <ScenarioPicker
                value={scenario}
                onChange={setScenario}
              />

              <button
                type="button"
                className="btn-primary"
                onClick={handleGrade}
                disabled={
                  stage === "grading" ||
                  !submissionId
                }
              >
                {stage === "grading"
                  ? "Grading…"
                  : "Run grading"}
              </button>
            </div>
          </div>
        )}
    </div>
  );
}