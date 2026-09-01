// Two small, pure helpers that make text-offset annotations work in the DOM.
//
// Annotations are anchored to startOffset/endOffset into the RAW
// studentAnswerText string (see server/src/models/Annotation.js) — not
// pixel coordinates. That means the frontend needs to do two conversions:
//   1. raw text + annotation list  ->  renderable segments (for display)
//   2. a user's mouse selection    ->  raw text offsets (for creating one)

/**
 * Splits `text` into an ordered list of segments, each either plain text
 * or covered by exactly one annotation. Assumes annotations don't overlap
 * (true for auto-generated ones; if a user manually creates an overlapping
 * span, we simply skip it here rather than rendering broken nested spans —
 * the annotation still exists and is still editable/deletable, it just
 * won't get its own highlight until the overlap is resolved).
 */
export function buildSegments(text, annotations) {
  if (!text) return [];

  const sorted = [...annotations]
    .filter((a) => a.startOffset >= 0 && a.endOffset <= text.length && a.startOffset < a.endOffset)
    .sort((a, b) => a.startOffset - b.startOffset);

  const segments = [];
  let cursor = 0;

  for (const ann of sorted) {
    if (ann.startOffset < cursor) continue; // overlaps the previous one — skip highlighting it

    if (ann.startOffset > cursor) {
      segments.push({ type: "text", text: text.slice(cursor, ann.startOffset) });
    }
    segments.push({
      type: "annotation",
      text: text.slice(ann.startOffset, ann.endOffset),
      annotation: ann,
    });
    cursor = ann.endOffset;
  }

  if (cursor < text.length) {
    segments.push({ type: "text", text: text.slice(cursor) });
  }

  return segments;
}

/**
 * Converts the browser's current text selection (assumed to be entirely
 * within `containerEl`) into { startOffset, endOffset, text } relative to
 * the plain-text content of that container.
 *
 * Why a TreeWalker: our rendered text is split across many <span> nodes
 * (one per segment from buildSegments), so a selection's anchorOffset is
 * only relative to whichever single text node it landed in. We need the
 * offset relative to the WHOLE concatenated text, so we walk every text
 * node in document order and accumulate lengths until we reach the one
 * the selection points at.
 */
export function getSelectionOffsets(containerEl) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (!containerEl.contains(range.commonAncestorContainer)) return null;

  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, null);

  let charCount = 0;
  let startOffset = null;
  let endOffset = null;
  let node = walker.nextNode();

  while (node) {
    const nodeLength = node.textContent.length;

    if (node === range.startContainer) {
      startOffset = charCount + range.startOffset;
    }
    if (node === range.endContainer) {
      endOffset = charCount + range.endOffset;
    }

    charCount += nodeLength;
    node = walker.nextNode();
  }

  if (startOffset === null || endOffset === null) return null;
  if (startOffset > endOffset) [startOffset, endOffset] = [endOffset, startOffset]; // reversed (right-to-left) selection

  const text = selection.toString();
  if (!text.trim()) return null;

  return { startOffset, endOffset, text };
}
