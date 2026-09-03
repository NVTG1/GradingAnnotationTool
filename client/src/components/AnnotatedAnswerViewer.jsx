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
}) {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const boxRefs = useRef({});

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

              const tooltipText =
                annotation.note ||
                annotation.anchorText ||
                "";

              // Flip the tooltip below the box instead of above it
              // when the box sits near the top of the page image, so
              // it doesn't render off the top edge of the scroll
              // container and get clipped/invisible.
              const tooltipBelow = annotation.y < 120;

              // Anchor the tooltip to the right edge of the box
              // instead of the left when the box sits in the right
              // half of the page — otherwise a wide note on a
              // right-side highlight runs off the page edge and gets
              // clipped/unreadable.
              const tooltipRight = annotation.x > 550;

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
                      : "")
                  }
                  style={boxStyle(annotation)}
                  onMouseEnter={() =>
                    onHoverAnnotation?.(annotation._id)
                  }
                  onMouseLeave={() =>
                    onHoverAnnotation?.(null)
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
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}