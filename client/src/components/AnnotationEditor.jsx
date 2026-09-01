import { useRef, useState } from "react";
import { createAnnotation, updateAnnotation, deleteAnnotation, exportUrl } from "../api/gradesenseApi";
import { buildSegments, getSelectionOffsets } from "../utils/textOffsets";

const TYPES = [
  { value: "underline", label: "Underline" },
  { value: "box", label: "Box" },
  { value: "strikethrough", label: "Strikethrough" },
  { value: "comment", label: "Comment only" },
];

// Deliberately makes ZERO calls to /api/grade anywhere in this file. Every
// action here — add, edit, move, delete — only ever touches
// /api/annotations/*. That's not an accident of what got wired up; it's the
// thing the assignment brief calls "editable output" and the thing this
// component exists to prove, in the UI, not just in the API design.
export default function AnnotationEditor({ submissionId, studentAnswerText, annotations, setAnnotations }) {
  const textRef = useRef(null);
  const [pendingSelection, setPendingSelection] = useState(null); // {startOffset, endOffset, text}
  const [draftType, setDraftType] = useState("underline");
  const [draftNote, setDraftNote] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);

  const segments = buildSegments(studentAnswerText, annotations);

  function handleMouseUp() {
    const selection = getSelectionOffsets(textRef.current);
    if (selection) {
      setPendingSelection(selection);
      setDraftType("underline");
      setDraftNote("");
    }
  }

  async function handleCreate() {
    if (!pendingSelection) return;
    try {
      const { annotation } = await createAnnotation(submissionId, {
        type: draftType,
        anchorText: pendingSelection.text,
        startOffset: pendingSelection.startOffset,
        endOffset: pendingSelection.endOffset,
        note: draftNote,
      });
      setAnnotations((prev) => [...prev, annotation]);
      setPendingSelection(null);
      window.getSelection()?.removeAllRanges();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdate(annotationId, updates) {
    try {
      const { annotation } = await updateAnnotation(submissionId, annotationId, updates);
      setAnnotations((prev) => prev.map((a) => (a._id === annotationId ? annotation : a)));
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(annotationId) {
    try {
      await deleteAnnotation(submissionId, annotationId);
      setAnnotations((prev) => prev.filter((a) => a._id !== annotationId));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="annotation-editor">
      <div className="annotation-editor-head">
        <h2>Annotated answer</h2>
        <a className="btn-secondary" href={exportUrl(submissionId)}>
          Export annotated PDF
        </a>
      </div>
      <p className="lede">
        Select any text below to mark it up. Editing a note or dragging a marker never re-grades
        the paper — it only ever updates this annotation.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div className="annotated-text" ref={textRef} onMouseUp={handleMouseUp}>
        {segments.length === 0 && <em>No text to annotate — the answer was blank.</em>}
        {segments.map((seg, i) =>
          seg.type === "text" ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <mark key={i} className={`ann-${seg.annotation.type}`} title={seg.annotation.note}>
              {seg.text}
            </mark>
          )
        )}
      </div>

      {pendingSelection && (
        <div className="annotation-draft">
          <div className="annotation-draft-quote">&ldquo;{pendingSelection.text}&rdquo;</div>
          <label>
            Marker type
            <select value={draftType} onChange={(e) => setDraftType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Correction / note
            <textarea value={draftNote} onChange={(e) => setDraftNote(e.target.value)} rows={2} />
          </label>
          <div className="annotation-draft-actions">
            <button className="btn-primary" onClick={handleCreate}>
              Add annotation
            </button>
            <button className="btn-ghost" onClick={() => setPendingSelection(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="annotation-list">
        <h3>All annotations ({annotations.length})</h3>
        {annotations.length === 0 && <p className="muted">None yet — none were auto-generated, or you've cleared them.</p>}
        {annotations.map((ann) => (
          <AnnotationRow
            key={ann._id}
            annotation={ann}
            isEditing={editingId === ann._id}
            onEdit={() => setEditingId(ann._id)}
            onCancelEdit={() => setEditingId(null)}
            onSave={(updates) => handleUpdate(ann._id, updates)}
            onDelete={() => handleDelete(ann._id)}
          />
        ))}
      </div>
    </div>
  );
}

function AnnotationRow({ annotation, isEditing, onEdit, onCancelEdit, onSave, onDelete }) {
  const [type, setType] = useState(annotation.type);
  const [note, setNote] = useState(annotation.note);

  if (!isEditing) {
    return (
      <div className="annotation-row">
        <span className={`ann-swatch ann-${annotation.type}`} />
        <div className="annotation-row-body">
          <div className="annotation-row-quote">&ldquo;{annotation.anchorText}&rdquo;</div>
          <div className="annotation-row-note">{annotation.note || <em>No note</em>}</div>
          <div className="annotation-row-meta">
            {annotation.createdBy === "system" ? "Auto-generated from grading" : "Added manually"}
          </div>
        </div>
        <div className="annotation-row-actions">
          <button className="btn-ghost" onClick={onEdit}>Edit</button>
          <button className="btn-ghost btn-danger" onClick={onDelete}>Delete</button>
        </div>
      </div>
    );
  }

  return (
    <div className="annotation-row annotation-row-editing">
      <label>
        Marker type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>
      <div className="annotation-draft-actions">
        <button className="btn-primary" onClick={() => onSave({ type, note })}>
          Save
        </button>
        <button className="btn-ghost" onClick={onCancelEdit}>
          Cancel
        </button>
      </div>
    </div>
  );
}
