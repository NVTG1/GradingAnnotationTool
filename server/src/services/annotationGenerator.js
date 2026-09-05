const Annotation = require("../models/Annotation");

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[""'']/g, "'")
    .replace(/[.,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text) {
  return normalize(text)
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

// Common short connective words. Left un-filtered, these inflate
// tokenSimilarity for almost ANY two lines of prose (nearly every
// sentence contains "the", "is", "to", "of" ...), which was letting
// completely unrelated OCR lines score high enough to be accepted as
// the "best" layout match. That's what produced highlight boxes that
// landed on the wrong line/paragraph in the viewer.
const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "to", "of", "in",
  "on", "and", "or", "it", "its", "this", "that", "these", "those",
  "as", "by", "at", "be", "for", "from", "with", "which", "who",
  "when", "then", "than", "so", "such", "not", "no", "do", "does",
  "did", "has", "have", "had",
]);

function significantWords(text) {
  const all = words(text);
  const filtered = all.filter((word) => !STOPWORDS.has(word));
  // If a target is made up entirely of stopwords (rare, but possible
  // for very short evidence strings), fall back to the unfiltered
  // list rather than matching nothing.
  return filtered.length ? filtered : all;
}

function levenshtein(a, b) {
  a = String(a || "");
  b = String(b || "");

  const dp = Array.from(
    { length: a.length + 1 },
    () => new Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : Math.min(
              dp[i - 1][j] + 1,
              dp[i][j - 1] + 1,
              dp[i - 1][j - 1] + 1
            );
    }
  }

  return dp[a.length][b.length];
}

function similarity(a, b) {
  const aa = normalize(a);
  const bb = normalize(b);

  if (!aa || !bb) return 0;

  if (aa === bb) return 1;

  if (aa.includes(bb) || bb.includes(aa)) {
    return 0.95;
  }

  const distance = levenshtein(aa, bb);
  const maxLength = Math.max(aa.length, bb.length);

  return maxLength === 0
    ? 0
    : Math.max(0, 1 - distance / maxLength);
}

function tokenSimilarity(target, candidate) {
  const targetWords = significantWords(target);
  const candidateWords = significantWords(candidate);

  if (!targetWords.length || !candidateWords.length) {
    return 0;
  }

  let matches = 0;

  for (const targetWord of targetWords) {
    let best = 0;

    for (const candidateWord of candidateWords) {
      best = Math.max(
        best,
        similarity(targetWord, candidateWord)
      );
    }

    if (best >= 0.55) {
      matches++;
    }
  }

  return matches / targetWords.length;
}

function unionBBox(blocks) {
  const valid = blocks.filter(
    (block) =>
      Array.isArray(block?.bbox) &&
      block.bbox.length === 4
  );

  if (!valid.length) return null;

  const x1 = Math.min(
    ...valid.map((b) => Number(b.bbox[0]))
  );

  const y1 = Math.min(
    ...valid.map((b) => Number(b.bbox[1]))
  );

  const x2 = Math.max(
    ...valid.map((b) => Number(b.bbox[2]))
  );

  const y2 = Math.max(
    ...valid.map((b) => Number(b.bbox[3]))
  );

  return [x1, y1, x2, y2];
}

function buildCandidates(page) {
  const blocks = Array.isArray(page?.blocks)
    ? page.blocks.filter(
        (block) =>
          typeof block?.text === "string" &&
          block.text.trim() &&
          Array.isArray(block.bbox) &&
          block.bbox.length === 4
      )
    : [];

  const candidates = [];

  // Sliding windows of 1..MAX_WINDOW consecutive physical lines. The
  // old version only ever built windows of 1, 2, or 3 lines, so any
  // rubric evidence spanning 4+ handwritten lines (e.g. a multi-line
  // description of Ammeter/Voltmeter/Resistor) could never get an
  // exact/substring match. It fell straight into the low-confidence
  // fuzzy fallback below and frequently matched the wrong 1-3 line
  // window instead — which is what produced boxes that didn't line
  // up with the highlighted sentence in the UI.
  const MAX_WINDOW = Math.min(6, blocks.length);

  for (
    let windowSize = 1;
    windowSize <= MAX_WINDOW;
    windowSize++
  ) {
    for (
      let i = 0;
      i <= blocks.length - windowSize;
      i++
    ) {
      const windowBlocks = blocks.slice(
        i,
        i + windowSize
      );

      candidates.push({
        text: windowBlocks
          .map((block) => block.text)
          .join(" "),
        blocks: windowBlocks,
      });
    }
  }

  return candidates;
}

function wordSimilarity(a, b) {
  const aa = normalize(a);
  const bb = normalize(b);

  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  if (aa.length < 3 || bb.length < 3) return 0;

  const distance = levenshtein(aa, bb);

  return Math.max(
    0,
    1 - distance / Math.max(aa.length, bb.length)
  );
}

function orderedTokenScore(target, candidate) {
  const targetWords = significantWords(target);
  const candidateWords = significantWords(candidate);

  if (!targetWords.length || !candidateWords.length) {
    return 0;
  }

  let targetIndex = 0;
  let matched = 0;

  for (const candidateWord of candidateWords) {
    if (targetIndex >= targetWords.length) break;

    const score = wordSimilarity(
      targetWords[targetIndex],
      candidateWord
    );

    if (score >= 0.62) {
      matched++;
      targetIndex++;
    }
  }

  return matched / targetWords.length;
}

function candidateScore(target, candidate) {
  const targetWords = significantWords(target);
  const candidateWords = significantWords(candidate);

  if (!targetWords.length || !candidateWords.length) {
    return {
      score: 0,
      coverage: 0,
      ordered: 0,
    };
  }

  const coverage = tokenSimilarity(
    target,
    candidate
  );

  const ordered = orderedTokenScore(
    target,
    candidate
  );

  const char = similarity(
    target,
    candidate
  );

  const score =
    coverage * 0.55 +
    ordered * 0.3 +
    char * 0.15;

  return {
    score,
    coverage,
    ordered,
  };
}

function findLayoutMatch(evidence, pages) {
  const target = normalize(evidence);

  if (!target || !Array.isArray(pages)) {
    return null;
  }

  let bestExact = null;
  let best = null;

  for (const page of pages) {
    const blocks = Array.isArray(page?.blocks)
      ? page.blocks.filter(
          (block) =>
            typeof block?.text === "string" &&
            block.text.trim() &&
            Array.isArray(block.bbox) &&
            block.bbox.length === 4
        )
      : [];

    if (!blocks.length) continue;

    /*
     * Evidence can span multiple physical handwriting
     * lines. We therefore compare consecutive OCR lines
     * rather than randomly comparing unrelated text.
     */
    const maxWindow = Math.min(
      8,
      blocks.length
    );

    for (
      let windowSize = 1;
      windowSize <= maxWindow;
      windowSize++
    ) {
      for (
        let i = 0;
        i <= blocks.length - windowSize;
        i++
      ) {
        const windowBlocks =
          blocks.slice(
            i,
            i + windowSize
          );

        const candidateText =
          normalize(
            windowBlocks
              .map(
                (block) => block.text
              )
              .join(" ")
          );

        if (!candidateText) continue;

        /*
         * EXACT MATCH
         *
         * This is the preferred path. If the evidence
         * exists inside the OCR lines, use those exact
         * physical lines rather than fuzzy matching another
         * part of the page.
         */
        if (
          candidateText === target ||
          candidateText.includes(target)
        ) {
          const bbox =
            unionBBox(windowBlocks);

          if (bbox) {
            const exact = {
              pageNumber:
                page.pageNumber,

              bbox,

              text:
                windowBlocks
                  .map(
                    (block) =>
                      block.text
                  )
                  .join(" "),

              score: 1,

              blockCount:
                windowBlocks.length,
            };

            /*
             * Don't immediately return. A smaller window
             * may contain the same evidence and give us a
             * much tighter highlight.
             */
            if (
              !bestExact ||
              exact.blockCount <
                bestExact.blockCount
            ) {
              bestExact = exact;
            }
          }

          continue;
        }

        /*
         * FUZZY MATCH
         *
         * Only accept it when:
         * 1. Enough meaningful words match.
         * 2. The words occur in approximately the same order.
         * 3. Overall similarity is strong.
         *
         * This prevents generic words from causing a
         * highlight to jump to an unrelated line.
         */
        const metrics =
          candidateScore(
            target,
            candidateText
          );

        const targetWordCount =
          significantWords(target).length;

        const minCoverage =
          targetWordCount >= 8
            ? 0.58
            : 0.68;

        const minOrdered =
          targetWordCount >= 8
            ? 0.35
            : 0.45;

        if (
          metrics.coverage <
            minCoverage ||
          metrics.ordered <
            minOrdered ||
          metrics.score < 0.62
        ) {
          continue;
        }

        const bbox =
          unionBBox(windowBlocks);

        if (!bbox) continue;

        const candidate = {
          pageNumber:
            page.pageNumber,

          bbox,

          text:
            windowBlocks
              .map(
                (block) =>
                  block.text
              )
              .join(" "),

          score: metrics.score,
          coverage:
            metrics.coverage,
          ordered:
            metrics.ordered,

          blockCount:
            windowBlocks.length,
        };

        const isBetter =
          !best ||
          candidate.score >
            best.score + 0.015 ||
          (
            Math.abs(
              candidate.score -
                best.score
            ) <= 0.015 &&
            candidate.coverage >
              best.coverage
          ) ||
          (
            Math.abs(
              candidate.score -
                best.score
            ) <= 0.015 &&
            Math.abs(
              candidate.coverage -
                best.coverage
            ) <= 0.02 &&
            candidate.blockCount <
              best.blockCount
          );

        if (isBetter) {
          best = candidate;
        }
      }
    }
  }

  /*
   * Exact OCR evidence is always safer than fuzzy evidence.
   */
  if (bestExact) {
    return bestExact;
  }

  /*
   * If we cannot confidently locate the evidence,
   * DO NOT draw a highlight somewhere random.
   *
   * The feedback can still be shown as a comment and
   * the teacher can manually annotate it.
   */
  if (
    best &&
    best.score >= 0.62
  ) {
    return best;
  }

  return null;
}

function annotationType(status) {
  switch (status) {
    case "incorrect":
    case "partial":
    case "correct":
      return "highlight";

    case "missing":
    default:
      return "comment";
  }
}

function findTextOffset(studentAnswerText, evidence) {
  const source = String(studentAnswerText || "");
  const target = String(evidence || "");

  if (!source || !target) {
    return null;
  }

  const index = source.indexOf(target);

  if (index >= 0) {
    return {
      startOffset: index,
      endOffset: index + target.length,
    };
  }

  return null;
}

async function generateAnnotationsFromGrading(
  submissionId,
  studentAnswerText,
  rubricPoints,
  studentAnswerLayout = []
) {
  const annotations = [];

  for (const point of rubricPoints || []) {
    const evidence = String(
      point.evidence || ""
    ).trim();

    if (
      point.status === "missing" ||
      !evidence
    ) {
      annotations.push({
        submissionId,
        type: "comment",
        status: point.status || null,

        anchorText: "",
        startOffset: 0,
        endOffset: 0,

        pageNumber: null,
        x: null,
        y: null,
        width: null,
        height: null,

        note:
          point.feedback ||
          `Missing: ${point.description}`,

        createdBy: "system",
      });

      continue;
    }

    if (words(evidence).length < 4) {
      annotations.push({
        submissionId,
        type: "comment",
        status: point.status || null,

        anchorText: evidence,
        startOffset: 0,
        endOffset: 0,

        pageNumber: null,
        x: null,
        y: null,
        width: null,
        height: null,

        note:
          point.feedback ||
          point.description,

        createdBy: "system",
      });

      continue;
    }

    const textOffset =
      findTextOffset(
        studentAnswerText,
        evidence
      );

    const layoutMatch =
      findLayoutMatch(
        evidence,
        studentAnswerLayout
      );

    let pageNumber = null;
    let x = null;
    let y = null;
    let width = null;
    let height = null;

    if (layoutMatch?.bbox) {
      const [
        x1,
        y1,
        x2,
        y2,
      ] = layoutMatch.bbox;

      pageNumber =
        Number(layoutMatch.pageNumber) || 1;

      x = Math.max(
        0,
        Math.min(1000, Number(x1))
      );

      y = Math.max(
        0,
        Math.min(1000, Number(y1))
      );

      width = Math.max(
        5,
        Math.min(
          1000 - x,
          Number(x2) - Number(x1)
        )
      );

      height = Math.max(
        5,
        Math.min(
          1000 - y,
          Number(y2) - Number(y1)
        )
      );
    }

    const annotation = {
      submissionId,

      type: annotationType(point.status),
      status: point.status || null,

      anchorText:
        layoutMatch?.text ||
        evidence,

      startOffset:
        textOffset?.startOffset || 0,

      endOffset:
        textOffset?.endOffset || 0,

      pageNumber,
      x,
      y,
      width,
      height,

      note:
        point.feedback ||
        point.description,

      createdBy: "system",
    };

    console.log(
      "[ANNOTATION]",
      JSON.stringify(
        {
          description: point.description,
          evidence,
          pageNumber,
          x,
          y,
          width,
          height,
          matchedOCR:
            layoutMatch?.text || null,
          score:
            layoutMatch?.score ?? null,
        },
        null,
        2
      )
    );

    annotations.push(annotation);
  }

  if (!annotations.length) {
    return [];
  }

  return Annotation.insertMany(
    annotations
  );
}

module.exports = {
  generateAnnotationsFromGrading,
  findLayoutMatch,
  normalize,
  tokenSimilarity,
  similarity,
};