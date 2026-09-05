import { useEffect, useRef, useState } from "react";
import { fetchPageImages } from "../api/gradesenseApi";

const STATUS_COLORS = {
  correct: "#3f6b4a",
  partial: "#a8791f",
  incorrect: "#a8362b",
};

const DEFAULT_COLOR = "#2f5aa8";

function colorFor(annotation) {
  if (
    annotation.type === "highlight" &&
    STATUS_COLORS[annotation.status]
  ) {
    return STATUS_COLORS[annotation.status];
  }

  return DEFAULT_COLOR;
}

function boxStyle(annotation) {
  return {
    left: `${(annotation.x / 1000) * 100}%`,
    top: `${(annotation.y / 1000) * 100}%`,
    width: `${(annotation.width / 1000) * 100}%`,
    height: `${(annotation.height / 1000) * 100}%`,
    borderColor: colorFor(annotation),
    backgroundColor: colorFor(annotation),
  };
}

const STATUS_LABELS = {
  correct: "Correct",
  partial: "Partial",
  incorrect: "Incorrect",
};

const STATUS_ICONS = {
  correct: "✓",
  partial: "~",
  incorrect: "✕",
};

export default function AnnotatedAnswerViewer({
  submissionId,
  annotations,
  hoveredAnnotationId,
  onHoverAnnotation,
  editable = false,
  selectedAnnotationId,
  onSelectAnnotation,
  onAnnotationUpdate,
}) {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const boxRefs = useRef({});

  // Live preview while dragging/resizing — only ever holds the ONE
  // annotation currently being manipulated, keyed by id, so the box
  // moves smoothly under the cursor before anything is persisted.
  // The actual save only happens once, on mouseup.
  const [dragPreview, setDragPreview] = useState(null);
  const dragStateRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchPageImages(submissionId)
      .then((data) => {
        if (!cancelled) setPages(data.pages || []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err.message ||
              "Could not load the original answer page."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  useEffect(() => {
    if (!hoveredAnnotationId) return;

    const node = boxRefs.current[hoveredAnnotationId];

    if (node) {
      node.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [hoveredAnnotationId]);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function beginDrag(event, annotation, mode) {
    if (!editable) return;
    // Only the left button starts a drag; keep native right-click etc.
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    const pageEl = event.currentTarget.closest(
      ".answer-viewer-page"
    );
    const pageRect = pageEl.getBoundingClientRect();

    dragStateRef.current = {
      id: annotation._id,
      mode, // 'move' | 'resize'
      moved: false,
      startClientX: event.clientX,
      startClientY: event.clientY,
      origX: annotation.x,
      origY: annotation.y,
      origWidth: annotation.width,
      origHeight: annotation.height,
      pageWidth: pageRect.width,
      pageHeight: pageRect.height,
    };

    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  }

  function onDragMove(event) {
    const state = dragStateRef.current;
    if (!state) return;

    const dxClient = event.clientX - state.startClientX;
    const dyClient = event.clientY - state.startClientY;

    // A drag under ~4px is treated as a click, not a move — this is
    // what lets clicking a box still select it without nudging its
    // position by a pixel every time.
    if (
      !state.moved &&
      Math.abs(dxClient) < 4 &&
      Math.abs(dyClient) < 4
    ) {
      return;
    }

    state.moved = true;

    const dx = (dxClient / state.pageWidth) * 1000;
    const dy = (dyClient / state.pageHeight) * 1000;

    let next;

    if (state.mode === "move") {
      next = {
        id: state.id,
        x: clamp(
          state.origX + dx,
          0,
          1000 - state.origWidth
        ),
        y: clamp(
          state.origY + dy,
          0,
          1000 - state.origHeight
        ),
        width: state.origWidth,
        height: state.origHeight,
      };
    } else {
      next = {
        id: state.id,
        x: state.origX,
        y: state.origY,
        width: clamp(
          state.origWidth + dx,
          15,
          1000 - state.origX
        ),
        height: clamp(
          state.origHeight + dy,
          15,
          1000 - state.origY
        ),
      };
    }

    setDragPreview(next);
  }

  function onDragEnd() {
    const state = dragStateRef.current;

    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);

    if (!state) return;

    if (!state.moved) {
      // A plain click: select this annotation instead of moving it.
      onSelectAnnotation?.(state.id);
    } else {
      setDragPreview((current) => {
        if (current && current.id === state.id) {
          onAnnotationUpdate?.(state.id, {
            x: Math.round(current.x),
            y: Math.round(current.y),
            width: Math.round(current.width),
            height: Math.round(current.height),
          });
        }
        return null;
      });
    }

    dragStateRef.current = null;
  }

  const positioned = (annotations || []).filter(
    (annotation) =>
      annotation.pageNumber != null &&
      annotation.x != null &&
      annotation.y != null &&
      annotation.width != null &&
      annotation.height != null
  );

  if (loading) {
    return (
      <div className="answer-viewer answer-viewer-status">
        Loading the original answer page…
      </div>
    );
  }

  if (error) {
    return (
      <div className="answer-viewer answer-viewer-status">
        {error}
      </div>
    );
  }

  if (!pages || pages.length === 0) {
    return (
      <div className="answer-viewer answer-viewer-status">
        No page image available for this submission.
      </div>
    );
  }

  return (
    <div className="answer-viewer">
      {pages.map((page) => (
        <div
          className="answer-viewer-page"
          key={page.pageNumber}
          onClick={(event) => {
            // Deselect when clicking empty page space (not a box) —
            // checked by ancestry rather than stopPropagation timing,
            // so it can't race with the box's own click-to-select.
            if (
              editable &&
              !event.target.closest(
                ".answer-viewer-box"
              )
            ) {
              onSelectAnnotation?.(null);
            }
          }}
        >
          <img
            className="answer-viewer-image"
            src={page.image}
            alt={`Student answer, page ${page.pageNumber}`}
            draggable={false}
          />

          {positioned
            .filter(
              (annotation) =>
                Number(annotation.pageNumber) ===
                page.pageNumber
            )
            .map((annotation) => {
              const isHovered =
                hoveredAnnotationId === annotation._id;

              const isSelected =
                editable &&
                selectedAnnotationId === annotation._id;

              // While this annotation is being dragged/resized, show
              // the live preview position instead of the last-saved
              // one — otherwise the box would visually snap back
              // until the PATCH request round-trips.
              const displayAnnotation =
                dragPreview &&
                dragPreview.id === annotation._id
                  ? { ...annotation, ...dragPreview }
                  : annotation;

              const tooltipText =
                annotation.note ||
                annotation.anchorText ||
                "";

              // Flip the tooltip below the box instead of above it
              // when the box sits near the top of the page image, so
              // it doesn't render off the top edge of the scroll
              // container and get clipped/invisible.
              const tooltipBelow =
                displayAnnotation.y < 120;

              // Anchor the tooltip to the right edge of the box
              // instead of the left when the box sits in the right
              // half of the page — otherwise a wide note on a
              // right-side highlight runs off the page edge and gets
              // clipped/unreadable.
              const tooltipRight =
                displayAnnotation.x > 550;

              return (
                <div
                  key={annotation._id}
                  ref={(node) => {
                    boxRefs.current[annotation._id] = node;
                  }}
                  className={
                    "answer-viewer-box" +
                    (isHovered
                      ? " answer-viewer-box-active"
                      : "") +
                    (isSelected
                      ? " answer-viewer-box-selected"
                      : "") +
                    (editable
                      ? " answer-viewer-box-editable"
                      : "")
                  }
                  style={boxStyle(displayAnnotation)}
                  onMouseEnter={() =>
                    onHoverAnnotation?.(annotation._id)
                  }
                  onMouseLeave={() =>
                    onHoverAnnotation?.(null)
                  }
                  onMouseDown={(event) =>
                    beginDrag(event, annotation, "move")
                  }
                  title={tooltipText}
                >
                  {isHovered && tooltipText && (
                    <div
                      className={
                        "answer-viewer-tooltip" +
                        (tooltipBelow
                          ? " answer-viewer-tooltip-below"
                          : "") +
                        (tooltipRight
                          ? " answer-viewer-tooltip-right"
                          : "") +
                        (annotation.status
                          ? ` status-${annotation.status}`
                          : "")
                      }
                    >
                      <div className="answer-viewer-tooltip-head">
                        {annotation.status ? (
                          <span
                            className={`answer-viewer-tooltip-status status-${annotation.status}`}
                          >
                            <span className="answer-viewer-tooltip-icon">
                              {STATUS_ICONS[annotation.status] || ""}
                            </span>
                            {STATUS_LABELS[annotation.status] ||
                              annotation.status}
                          </span>
                        ) : (
                          <span className="answer-viewer-tooltip-status status-note">
                            Note
                          </span>
                        )}
                      </div>

                      <div className="answer-viewer-tooltip-text">
                        {tooltipText}
                      </div>
                    </div>
                  )}

                  {isSelected && (
                    <div
                      className="answer-viewer-resize-handle"
                      title="Drag to resize"
                      onMouseDown={(event) =>
                        beginDrag(
                          event,
                          annotation,
                          "resize"
                        )
                      }
                    />
                  )}
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}