import { useState } from "react";
import {
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  exportUrl,
} from "../api/gradesenseApi";
import AnnotatedAnswerViewer from "./AnnotatedAnswerViewer";

const TYPES = [
  { value: "highlight", label: "Highlight" },
  { value: "underline", label: "Underline" },
  { value: "box", label: "Box" },
  { value: "strikethrough", label: "Strikethrough" },
  { value: "comment", label: "Comment only" },
];

const EMPTY_DRAFT = {
  type: "highlight",
  anchorText: "",
  note: "",
  pageNumber: 1,
  x: 100,
  y: 100,
  width: 200,
  height: 40,
};

export default function AnnotationEditor({
  submissionId,
  studentAnswerText,
  annotations,
  setAnnotations,
}) {
  const [editingAnnotation, setEditingAnnotation] = useState(null);
  const [showAddWindow, setShowAddWindow] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState(null);

  function openAddWindow() {
    setError(null);

    setEditingAnnotation({
      mode: "create",
      ...EMPTY_DRAFT,
    });

    setShowAddWindow(true);
  }

  function openEditWindow(annotation) {
    setError(null);

    setEditingAnnotation({
      mode: "edit",
      _id: annotation._id,
      type: annotation.type || "highlight",
      anchorText: annotation.anchorText || "",
      note: annotation.note || "",
      pageNumber: annotation.pageNumber ?? 1,
      x: annotation.x ?? 100,
      y: annotation.y ?? 100,
      width: annotation.width ?? 200,
      height: annotation.height ?? 40,
    });

    setShowAddWindow(true);
  }

  function closeWindow() {
    if (saving) return;

    setShowAddWindow(false);
    setEditingAnnotation(null);
    setError(null);
  }

  function updateDraft(field, value) {
    setEditingAnnotation((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  async function saveAnnotation() {
    if (!editingAnnotation) return;

    setSaving(true);
    setError(null);

    try {
      const payload = {
        type: editingAnnotation.type,
        anchorText: editingAnnotation.anchorText,
        note: editingAnnotation.note,

        pageNumber: Number(editingAnnotation.pageNumber) || 1,
        x: Number(editingAnnotation.x) || 0,
        y: Number(editingAnnotation.y) || 0,
        width: Number(editingAnnotation.width) || 1,
        height: Number(editingAnnotation.height) || 1,
      };

      if (editingAnnotation.mode === "create") {
        const response = await createAnnotation(submissionId, payload);

        setAnnotations((prev) => [
          ...prev,
          response.annotation,
        ]);
      } else {
        const response = await updateAnnotation(
          submissionId,
          editingAnnotation._id,
          payload
        );

        setAnnotations((prev) =>
          prev.map((annotation) =>
            annotation._id === editingAnnotation._id
              ? response.annotation
              : annotation
          )
        );
      }

      closeWindow();
    } catch (err) {
      setError(err.message || "Could not save annotation.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(annotationId) {
    const confirmed = window.confirm(
      "Delete this annotation? This will not re-grade the answer."
    );

    if (!confirmed) return;

    setError(null);

    try {
      await deleteAnnotation(submissionId, annotationId);

      setAnnotations((prev) =>
        prev.filter((annotation) => annotation._id !== annotationId)
      );

      closeWindow();
    } catch (err) {
      setError(err.message || "Could not delete annotation.");
    }
  }

  return (
    <div className="annotation-editor">
      <div className="annotation-editor-head">
        <div>
          <h2>Annotations</h2>
          <p className="lede">
            Review, edit, move, delete or manually add corrections.
            These actions never re-grade the paper.
          </p>
        </div>

        <div className="annotation-editor-head-actions">
          <button
            className="btn-primary"
            type="button"
            onClick={openAddWindow}
          >
            + Add Annotation
          </button>

          <a
            className="btn-secondary"
            href={exportUrl(submissionId)}
          >
            Export annotated PDF
          </a>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
        </div>
      )}

      <div className="annotation-answer-preview">
        <div className="annotation-answer-preview-head">
          <strong>Student answer</strong>
          <span>
            {annotations.length} annotation
            {annotations.length === 1 ? "" : "s"}
          </span>
        </div>

        <AnnotatedAnswerViewer
          submissionId={submissionId}
          annotations={annotations}
          hoveredAnnotationId={hoveredAnnotationId}
          onHoverAnnotation={setHoveredAnnotationId}
        />

        <details className="annotation-answer-text-toggle">
          <summary>Show extracted text</summary>
          <div className="annotation-answer-text">
            {studentAnswerText ? (
              studentAnswerText
            ) : (
              <em>
                No extracted text available. The answer may be blank
                or handwritten.
              </em>
            )}
          </div>
        </details>
      </div>

      <div className="annotation-list">
        <div className="annotation-list-head">
          <h3>All annotations</h3>

          <button
            className="btn-primary btn-small"
            type="button"
            onClick={openAddWindow}
          >
            + Add
          </button>
        </div>

        {annotations.length === 0 && (
          <div className="annotation-empty">
            <strong>No annotations yet.</strong>
            <p>
              Add one manually or grade the submission to generate
              annotations automatically.
            </p>
          </div>
        )}

        {annotations.map((annotation, index) => (
          <AnnotationRow
            key={annotation._id || index}
            annotation={annotation}
            index={index}
            isHovered={hoveredAnnotationId === annotation._id}
            onHover={setHoveredAnnotationId}
            onEdit={() => openEditWindow(annotation)}
            onDelete={() => handleDelete(annotation._id)}
          />
        ))}
      </div>

      {showAddWindow && editingAnnotation && (
        <AnnotationModal
          draft={editingAnnotation}
          onChange={updateDraft}
          onSave={saveAnnotation}
          onCancel={closeWindow}
          saving={saving}
        />
      )}
    </div>
  );
}

function AnnotationRow({
  annotation,
  index,
  isHovered,
  onHover,
  onEdit,
  onDelete,
}) {
  const typeLabel =
    TYPES.find((type) => type.value === annotation.type)?.label ||
    annotation.type;

  return (
    <div
      className={
        "annotation-row" +
        (isHovered ? " annotation-row-active" : "")
      }
      onMouseEnter={() => onHover?.(annotation._id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div
        className={`ann-swatch ann-${annotation.type}`}
        aria-hidden="true"
      />

      <div className="annotation-row-number">
        #{index + 1}
      </div>

      <div className="annotation-row-body">
        <div className="annotation-row-top">
          <strong>{typeLabel}</strong>

          <span className="annotation-source">
            {annotation.createdBy === "system"
              ? "Auto-generated"
              : "Manual"}
          </span>
        </div>

        {annotation.anchorText ? (
          <div className="annotation-row-quote">
            “{annotation.anchorText}”
          </div>
        ) : (
          <div className="annotation-row-quote muted">
            No text anchor
          </div>
        )}

        <div className="annotation-row-note">
          {annotation.note || (
            <em>No correction note</em>
          )}
        </div>

        {annotation.pageNumber != null && (
          <div className="annotation-row-coordinates">
            Page {annotation.pageNumber}
            {" · "}
            X {Math.round(annotation.x ?? 0)}
            {" · "}
            Y {Math.round(annotation.y ?? 0)}
            {" · "}
            {Math.round(annotation.width ?? 0)} ×{" "}
            {Math.round(annotation.height ?? 0)}
          </div>
        )}
      </div>

      <div className="annotation-row-actions">
        <button
          className="btn-ghost"
          type="button"
          onClick={onEdit}
        >
          Edit
        </button>

        <button
          className="btn-ghost btn-danger"
          type="button"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function AnnotationModal({
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
}) {
  const isCreate = draft.mode === "create";

  return (
    <div
      className="annotation-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) {
          onCancel();
        }
      }}
    >
      <div
        className="annotation-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="annotation-modal-title"
      >
        <div className="annotation-modal-head">
          <div>
            <h2 id="annotation-modal-title">
              {isCreate
                ? "Add annotation"
                : "Edit annotation"}
            </h2>

            <p>
              Change the correction without re-grading.
            </p>
          </div>

          <button
            className="modal-close"
            type="button"
            onClick={onCancel}
            disabled={saving}
          >
            ×
          </button>
        </div>

        <div className="annotation-modal-body">
          <label>
            Marker type
            <select
              value={draft.type}
              onChange={(event) =>
                onChange("type", event.target.value)
              }
            >
              {TYPES.map((type) => (
                <option
                  key={type.value}
                  value={type.value}
                >
                  {type.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Text anchor
            <input
              type="text"
              value={draft.anchorText}
              onChange={(event) =>
                onChange(
                  "anchorText",
                  event.target.value
                )
              }
              placeholder="Text being marked"
            />
          </label>

          <label>
            Correction / note
            <textarea
              rows={4}
              value={draft.note}
              onChange={(event) =>
                onChange("note", event.target.value)
              }
              placeholder="Explain what is wrong or what the student should improve."
            />
          </label>

          <div className="coordinate-section">
            <div className="coordinate-section-title">
              Position on original PDF
            </div>

            <p className="coordinate-help">
              Coordinates use a 0–1000 scale from the top-left
              of the original PDF page.
            </p>

            <div className="coordinate-grid">
              <label>
                Page
                <input
                  type="number"
                  min="1"
                  value={draft.pageNumber}
                  onChange={(event) =>
                    onChange(
                      "pageNumber",
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                X
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={draft.x}
                  onChange={(event) =>
                    onChange(
                      "x",
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Y
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={draft.y}
                  onChange={(event) =>
                    onChange(
                      "y",
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Width
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={draft.width}
                  onChange={(event) =>
                    onChange(
                      "width",
                      event.target.value
                    )
                  }
                />
              </label>

              <label>
                Height
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={draft.height}
                  onChange={(event) =>
                    onChange(
                      "height",
                      event.target.value
                    )
                  }
                />
              </label>
            </div>
          </div>
        </div>

        <div className="annotation-modal-footer">
          <button
            className="btn-ghost"
            type="button"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </button>

          <button
            className="btn-primary"
            type="button"
            onClick={onSave}
            disabled={saving}
          >
            {saving
              ? "Saving..."
              : isCreate
              ? "Add annotation"
              : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}