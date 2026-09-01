// Renders a NEW annotated PDF from (studentAnswerText + current
// annotation state). The original uploaded PDF is never opened or
// modified here — this satisfies the brief's rule that the original
// answer paper must stay untouched, and since this reads whatever
// annotations exist RIGHT NOW, editing an annotation and re-exporting
// requires no re-grading at all.
//
// Because annotations are anchored to TEXT OFFSETS (see Annotation.js
// for why), we re-flow the student text into a simple word-wrapped
// layout ourselves, tracking each word's character-offset range so we
// know exactly which words each annotation covers, then draw a
// colored underline/box/strikethrough beneath those words plus a
// small numbered marker. A legend at the end lists each note in full.

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// pdf-lib's standard fonts only support WinAnsi encoding — a fairly
// small character set. Real-world documents (academic reports, OCR
// output, copy-pasted text) commonly contain Greek letters, math
// symbols, smart quotes, em-dashes, etc. that AREN'T in that set.
// Rather than crashing the whole export over one unsupported
// character, we replace common ones with safe ASCII equivalents and
// fall back to "?" for anything else — a legible degraded PDF beats
// a 500 error.
//
// IMPORTANT: every replacement below is exactly ONE character, never
// a multi-character string. Annotation startOffset/endOffset were
// computed against the ORIGINAL text — if a replacement changed the
// character count, every offset after it would drift and annotations
// would end up highlighting the wrong words. Keeping this 1:1 keeps
// sanitized-text offsets identical to original-text offsets.
const CHAR_REPLACEMENTS = {
  "\u2018": "'", "\u2019": "'", // smart single quotes
  "\u201C": '"', "\u201D": '"', // smart double quotes
  "\u2013": "-", "\u2014": "-", // en/em dash
  "\u2026": ".", // ellipsis (single char, not "...")
  "\u00A0": " ", // non-breaking space
  "\u2022": "*", // bullet
  "\u00B1": "+", "\u2248": "~", "\u2260": "=", "\u2264": "<", "\u2265": ">",
  "\u03B1": "a", "\u03B2": "b", "\u03BC": "u", "\u03C3": "s",
  "\u03C0": "p", "\u0394": "D", "\u03BB": "l",
};

function sanitizeForPDF(text) {
  if (!text) return "";
  let out = "";
  for (const ch of text) {
    if (CHAR_REPLACEMENTS[ch]) {
      out += CHAR_REPLACEMENTS[ch];
    } else if (ch.codePointAt(0) <= 0xff) {
      // WinAnsi covers most of Latin-1 — anything beyond that we
      // haven't explicitly mapped gets a visible placeholder instead
      // of crashing the export.
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}

const PAGE_WIDTH = 595.28; // A4 in points
const PAGE_HEIGHT = 841.89;
const MARGIN = 50;
const FONT_SIZE = 11;
const LINE_HEIGHT = 16;

const TYPE_COLORS = {
  underline: rgb(0.13, 0.55, 0.13), // green — correct/partial
  strikethrough: rgb(0.8, 0.1, 0.1), // red — incorrect
  box: rgb(0.85, 0.55, 0), // amber — flagged
  comment: rgb(0.2, 0.4, 0.8), // blue — unanchored note
};

// Tokenizes text into words while preserving exact character offsets,
// so each word can be matched against an annotation's [startOffset,
// endOffset) range later.
function tokenize(text) {
  const words = [];
  const re = /\S+/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    words.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return words;
}

function findAnnotationsForWord(word, annotations) {
  return annotations.filter(
    (a) => a.startOffset < word.end && a.endOffset > word.start && a.anchorText
  );
}

async function buildAnnotatedPDF(studentAnswerText, annotations) {
  const cleanText = sanitizeForPDF(studentAnswerText);
  const cleanAnnotations = annotations.map((a) => ({
    _id: a._id,
    id: a.id,
    type: a.type,
    anchorText: sanitizeForPDF(a.anchorText),
    startOffset: a.startOffset,
    endOffset: a.endOffset,
    note: sanitizeForPDF(a.note),
  }));

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let cursorY = PAGE_HEIGHT - MARGIN;
  let cursorX = MARGIN;
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  page.drawText("GradeSense — Annotated Answer", {
    x: MARGIN,
    y: cursorY,
    size: 14,
    font: boldFont,
  });
  cursorY -= 30;

  const words = tokenize(cleanText || "");
  const markers = []; // { number, note, type }
  let markerCounter = 0;
  const seenAnnotationIds = new Set();

  function newPage() {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cursorY = PAGE_HEIGHT - MARGIN;
    cursorX = MARGIN;
  }

  for (const word of words) {
    const displayText = word.text;
    const wordWidth = font.widthOfTextAtSize(displayText, FONT_SIZE);

    if (cursorX + wordWidth > MARGIN + maxWidth) {
      cursorX = MARGIN;
      cursorY -= LINE_HEIGHT;
    }
    if (cursorY < MARGIN + 100) {
      newPage();
    }

    const matches = findAnnotationsForWord(word, cleanAnnotations);

    page.drawText(displayText, {
      x: cursorX,
      y: cursorY,
      size: FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
    });

    if (matches.length > 0) {
      const primary = matches[0];
      const color = TYPE_COLORS[primary.type] || rgb(0, 0, 0);

      if (primary.type === "strikethrough") {
        page.drawLine({
          start: { x: cursorX, y: cursorY + FONT_SIZE / 3 },
          end: { x: cursorX + wordWidth, y: cursorY + FONT_SIZE / 3 },
          thickness: 1.2,
          color,
        });
      } else if (primary.type === "box") {
        page.drawRectangle({
          x: cursorX - 2,
          y: cursorY - 2,
          width: wordWidth + 4,
          height: FONT_SIZE + 4,
          borderColor: color,
          borderWidth: 1,
        });
      } else {
        // underline (default)
        page.drawLine({
          start: { x: cursorX, y: cursorY - 2 },
          end: { x: cursorX + wordWidth, y: cursorY - 2 },
          thickness: 1.2,
          color,
        });
      }

      // Register a marker the first time we see this annotation
      const annId = String(primary._id || primary.id);
      if (!seenAnnotationIds.has(annId)) {
        seenAnnotationIds.add(annId);
        markerCounter += 1;
        markers.push({ number: markerCounter, note: primary.note, type: primary.type });
        page.drawText(String(markerCounter), {
          x: cursorX + wordWidth + 2,
          y: cursorY + 6,
          size: 7,
          font: boldFont,
          color,
        });
      }
    }

    cursorX += wordWidth + font.widthOfTextAtSize(" ", FONT_SIZE);
  }

  // --- Unanchored comments (evidence didn't match a text span) ---
  const unanchored = cleanAnnotations.filter((a) => !a.anchorText);
  for (const a of unanchored) {
    markerCounter += 1;
    // Note: annotationGenerator already prefixes unanchored notes with the
    // rubric point description (e.g. "[Correct placement of ammeter...] ...").
    // Don't add a second, redundant "[General]" label on top of that here.
    markers.push({ number: markerCounter, note: a.note, type: "comment" });
  }

  // --- Legend page ---
  newPage();
  page.drawText("Corrections & Feedback", { x: MARGIN, y: cursorY, size: 14, font: boldFont });
  cursorY -= 26;

  for (const marker of markers) {
    if (cursorY < MARGIN) newPage();
    const color = TYPE_COLORS[marker.type] || rgb(0, 0, 0);
    const label = `${marker.number}. ${marker.note}`;
    page.drawText(label, {
      x: MARGIN,
      y: cursorY,
      size: 10,
      font,
      color,
      maxWidth: PAGE_WIDTH - MARGIN * 2,
      lineHeight: 12,
    });
    cursorY -= 24;
  }

  return pdfDoc.save();
}

module.exports = { buildAnnotatedPDF };