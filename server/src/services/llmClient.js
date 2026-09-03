const AppError = require("../utils/AppError");

async function gradeWithLLM(prompt, { forceScenario, mode = "grade" } = {}) {
  const provider = process.env.LLM_PROVIDER || "mock";

  if (provider === "mock") {
    return mockLLM(prompt, forceScenario, mode);
  }

  if (provider === "groq") {
    return callGroq(prompt);
  }

  throw new AppError(`Unknown LLM_PROVIDER: ${provider}`, 500, "BAD_CONFIG");
}

async function mockLLM(prompt, forceScenario, mode) {
  if (forceScenario === "api_failure") {
    throw new AppError("Simulated LLM API failure", 502, "LLM_UNAVAILABLE");
  }

  if (forceScenario === "malformed") {
    return "This is not valid JSON at all {{{";
  }

  if (mode === "rubric") {
    return JSON.stringify({
      rubricPoints: extractRubricFromDocument(prompt),
    });
  }

  if (forceScenario === "over_max") {
    return JSON.stringify({
      rubricPoints: [
        {
          pointId: "p1",
          awardedMarks: 999,
          status: "correct",
          evidence: "x",
          feedback: "y",
        },
      ],
    });
  }

  return JSON.stringify({
    rubricPoints: heuristicGrade(prompt),
  });
}

function extractRubricFromDocument(prompt) {
  const docMatch = prompt.match(/DOCUMENT:\n([\s\S]*)$/);
  const doc = docMatch ? docMatch[1] : "";

  const points = [];
  let buffer = [];
  let pendingMarks = null;

  function flushAsPoint(description, maxMarks) {
    if (
      maxMarks >= 1 &&
      maxMarks <= 20 &&
      description.length >= 15
    ) {
      points.push({
        pointId: `p${points.length + 1}`,
        description,
        maxMarks,
      });
    }
  }

  function flushPending() {
    if (pendingMarks !== null && buffer.length > 0) {
      flushAsPoint(buffer.join(" ").trim(), pendingMarks);
    }

    buffer = [];
    pendingMarks = null;
  }

  for (const rawLine of doc.split("\n")) {
    const line = rawLine.trim();

    if (!line) continue;

    if (/^total\b/i.test(line) || /^criterion\b/i.test(line)) {
      flushPending();
      continue;
    }

    const bareNumber = line.match(/^(\d{1,2})$/);

    if (bareNumber) {
      if (pendingMarks !== null) {
        flushPending();
      }

      pendingMarks = Number(bareNumber[1]);
      continue;
    }

    const inline = line.match(/^(.*\S)\s+(\d{1,2})$/);

    if (inline) {
      if (pendingMarks !== null) {
        flushPending();
      }

      flushAsPoint(
        [...buffer, inline[1].trim()].join(" ").trim(),
        Number(inline[2])
      );

      buffer = [];
      pendingMarks = null;
      continue;
    }

    buffer.push(line);

    if (pendingMarks !== null) {
      flushAsPoint(
        buffer.join(" ").trim(),
        pendingMarks
      );

      buffer = [];
      pendingMarks = null;
    } else if (buffer.length > 4) {
      buffer.shift();
    }
  }

  flushPending();

  if (points.length > 0) {
    return points;
  }

  return [
    {
      pointId: "p1",
      description: "Defines the core concept correctly",
      maxMarks: 3,
    },
    {
      pointId: "p2",
      description: "Explains how or why it works",
      maxMarks: 3,
    },
    {
      pointId: "p3",
      description: "Gives a correct relevant example",
      maxMarks: 2,
    },
    {
      pointId: "p4",
      description: "Clarity and structure of the answer",
      maxMarks: 2,
    },
  ];
}

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "that",
  "with",
  "this",
  "from",
  "have",
  "are",
  "was",
  "were",
  "will",
  "would",
  "could",
  "should",
  "their",
  "there",
  "then",
  "than",
  "into",
  "your",
  "which",
  "when",
  "what",
  "where",
  "does",
  "not",
  "but",
  "also",
  "such",
  "each",
  "been",
  "being",
  "they",
  "them",
  "these",
  "those",
  "about",
  "above",
  "between",
  "through",
  "during",
  "before",
  "after",
  "because",
  "while",
]);

function significantWords(text) {
  return (text.toLowerCase().match(/[a-z]+/g) || []).filter(
    (w) => w.length > 3 && !STOPWORDS.has(w)
  );
}

function splitIntoSections(text) {
  const headerRe = /^Q\d+\b.*$/gim;
  const matches = [...text.matchAll(headerRe)];

  if (matches.length < 2) {
    return null;
  }

  const sections = [];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end =
      i + 1 < matches.length
        ? matches[i + 1].index
        : text.length;

    sections.push(text.slice(start, end));
  }

  return sections;
}

function heuristicGrade(prompt) {
  const modelMatch = prompt.match(
    /MODEL ANSWER:\n([\s\S]*?)\n\nRUBRIC POINTS/
  );

  const rubricMatch = prompt.match(
    /RUBRIC POINTS \(award marks only up to maxMarks for each\):\n([\s\S]*?)\n\nSTUDENT ANSWER:/
  );

  const studentMatch = prompt.match(
    /STUDENT ANSWER:\n([\s\S]*?)\n\nFor each rubric point/
  );

  let rubricDefinition = [];

  try {
    rubricDefinition = rubricMatch
      ? JSON.parse(rubricMatch[1])
      : [];
  } catch {
    rubricDefinition = [];
  }

  const modelAnswerText = modelMatch
    ? modelMatch[1]
    : "";

  const studentAnswerText = studentMatch
    ? studentMatch[1]
    : "";

  const modelSections = splitIntoSections(modelAnswerText);
  const studentSections = splitIntoSections(studentAnswerText);

  return rubricDefinition.map((point) => {
    const keywords = significantWords(point.description);

    let scopedStudent = studentAnswerText;

    if (
      modelSections &&
      studentSections &&
      modelSections.length === studentSections.length
    ) {
      const index = rubricDefinition.indexOf(point);

      if (index < studentSections.length) {
        scopedStudent = studentSections[index];
      }
    }

    const lowerStudent = scopedStudent.toLowerCase();

    const matchedKeywords = keywords.filter((keyword) =>
      lowerStudent.includes(keyword)
    );

    const ratio = keywords.length
      ? matchedKeywords.length / keywords.length
      : 0;

    let status;
    let awardedMarks;

    if (ratio >= 0.6) {
      status = "correct";
      awardedMarks = point.maxMarks;
    } else if (ratio >= 0.25) {
      status = "partial";
      awardedMarks = Math.max(
        1,
        Math.floor(point.maxMarks / 2)
      );
    } else if (
      matchedKeywords.length > 0 &&
      lowerStudent.length > 20
    ) {
      status = "incorrect";
      awardedMarks = 0;
    } else {
      status = "missing";
      awardedMarks = 0;
    }

    let evidence = "";

    if (
      status !== "missing" &&
      matchedKeywords.length > 0
    ) {
      const sentences = scopedStudent
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter(Boolean);

      let bestSentence = "";
      let bestCount = 0;

      for (const sentence of sentences) {
        const lower = sentence.toLowerCase();

        const count = matchedKeywords.filter((k) =>
          lower.includes(k)
        ).length;

        if (count > bestCount) {
          bestCount = count;
          bestSentence = sentence;
        }
      }

      evidence = bestSentence;
    }

    const feedback =
      status === "correct"
        ? "Covers this point adequately."
        : status === "partial"
        ? `Partially addresses "${point.description}" — expand with more detail.`
        : status === "incorrect"
        ? `The answer doesn't correctly address "${point.description}" — review and correct this point.`
        : `No clear evidence of "${point.description}" in the answer.`;

    return {
      pointId: point.pointId,
      awardedMarks,
      status,
      evidence,
      feedback,
    };
  });
}

/*
 * Handwritten/scanned PDF OCR
 *
 * OCR_PROVIDER is separate from LLM_PROVIDER so that:
 *
 * OCR_PROVIDER=groq
 * LLM_PROVIDER=mock
 *
 * can be used while debugging OCR independently.
 */
async function transcribeHandwrittenImages(
  imageBuffers,
  { forceScenario, withLayout = false } = {}
) {
  const provider =
    process.env.OCR_PROVIDER ||
    process.env.LLM_PROVIDER ||
    "mock";

  console.log("OCR provider:", provider);

  const pages = [];

  for (const buffer of imageBuffers) {
    if (provider === "mock") {
      const text = mockTranscribeImage(
        buffer,
        forceScenario
      );

      if (withLayout) {
        pages.push({
          pageNumber: pages.length + 1,
          text,
          blocks: [],
        });
      } else {
        pages.push(text);
      }

      continue;
    }

    if (provider === "groq") {
      const result = await callGroqVision(
        buffer,
        { withLayout }
      );

      if (withLayout) {
        pages.push({
          pageNumber: pages.length + 1,
          text: result.text,
          blocks: result.blocks || [],
        });
      } else {
        pages.push(result.text);
      }

      continue;
    }

    throw new AppError(
      `Unknown OCR_PROVIDER: ${provider}`,
      500,
      "BAD_CONFIG"
    );
  }

  if (withLayout) {
    return pages;
  }

  return pages.join("\n\n").trim();
}

function mockTranscribeImage(buffer, forceScenario) {
  if (forceScenario === "vision_failure") {
    throw new AppError(
      "Simulated vision API failure",
      502,
      "LLM_UNAVAILABLE"
    );
  }

  return `[MOCK OCR TRANSCRIPTION of a ${buffer.length}-byte page image]`;
}

async function callGroqVision(
  imageBuffer,
  { withLayout = false } = {}
) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new AppError(
      "GROQ_API_KEY not set",
      500,
      "BAD_CONFIG"
    );
  }

  const prompt = withLayout
    ? `
You are doing OCR on a handwritten student answer.

Return ONLY valid JSON.

Required format:

{
  "text": "complete transcription",
  "blocks": [
    {
      "text": "exact text from this region",
      "bbox": [x1, y1, x2, y2]
    }
  ]
}

VERY IMPORTANT:

1. Preserve the student's spelling exactly.
2. Preserve grammar mistakes.
3. Do not correct spelling.
4. Do not solve the question.
5. Do not paraphrase.
6. Include question numbers.
7. Include readable text inside diagrams.
8. Create one block per PHYSICAL LINE of handwriting — one row on the page, top to bottom. NEVER combine two or more lines into a single block, even if they are the same sentence. If a sentence wraps across 3 lines, that is 3 separate blocks.
9. Bounding boxes MUST tightly surround just that one line's handwriting — top of the box at the top of that line's letters, bottom of the box at the bottom of that line's letters. Do not let the box extend down into the next line or up into the previous line.
10. Coordinates must be normalized from 0 to 1000.
11. (0,0) is the TOP LEFT corner.
12. x1,y1 = top-left.
13. x2,y2 = bottom-right.
14. Do not put commentary outside JSON.
15. If handwriting is difficult to read, make your best OCR attempt rather than omitting the block.
16. Sanity check before answering: if a page has about N visible lines of handwriting, you should return roughly N blocks (plus a few more if some lines contain two distinct sentences). A block whose bbox height is much taller than the others is almost always wrong — it means you merged lines. Split it.

Example of WRONG output (do not do this):
{ "text": "The switch is used to open and close the circuit. When the switch is closed current flows...", "bbox": [30, 200, 780, 280] }
This is wrong because it spans multiple lines in one box.

Example of RIGHT output:
{ "text": "The switch is used to open and close the circuit.", "bbox": [30, 200, 780, 235] }
{ "text": "When the switch is closed current flows from the positive terminal", "bbox": [30, 236, 780, 270] }

The blocks are REQUIRED because another program will draw correction marks directly over the original handwritten page. A box that covers the wrong line, or several lines at once, makes the correction marks land on the wrong part of the student's work.
`
    : `
Transcribe the handwritten answer.

Preserve:
- spelling mistakes
- grammar mistakes
- wording
- question numbers
- diagram labels

Do not correct the student.
Do not solve the question.

Return only the transcription.
`;

  let response;

  try {
    response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },

        body: JSON.stringify({
          model: "qwen/qwen3.6-27b",

          temperature: 0,

          max_completion_tokens: withLayout ? 8000 : 4096,

          ...(withLayout
            ? { response_format: { type: "json_object" } }
            : {}),

          reasoning_effort: "none",

          messages: [
            {
              role: "user",

              content: [
                {
                  type: "text",
                  text: prompt,
                },

                {
                  type: "image_url",

                  image_url: {
                    url:
                      `data:image/png;base64,` +
                      imageBuffer.toString(
                        "base64"
                      ),
                  },
                },
              ],
            },
          ],
        }),
      }
    );
  } catch (err) {
    throw new AppError(
      "Vision API unreachable",
      502,
      "LLM_UNAVAILABLE"
    );
  }

  if (!response.ok) {
    const detail =
      await response.text().catch(() => "");

    console.error(
      "Groq vision error:",
      response.status,
      detail
    );

    throw new AppError(
      `Vision API returned ${response.status}`,
      502,
      "LLM_UNAVAILABLE"
    );
  }

  const data =
    await response.json();

  let content =
    data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new AppError(
      "Vision API returned empty transcription",
      502,
      "LLM_UNAVAILABLE"
    );
  }

  content = content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();

  if (!content) {
    throw new AppError(
      "Vision API returned empty transcription",
      502,
      "LLM_UNAVAILABLE"
    );
  }

  if (!withLayout) {
    return {
      text: content,
      blocks: [],
    };
  }

  let jsonText = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (err2) {
        parsed = null;
      }
    }
  }

  if (!parsed) {
    console.error(
      "[OCR LAYOUT] Invalid JSON from vision model:",
      content
    );

    return {
      text: content,
      blocks: [],
    };
  }

  try {
    const text =
      typeof parsed.text === "string"
        ? parsed.text.trim()
        : "";

    const rawBlocks =
      Array.isArray(parsed.blocks)
        ? parsed.blocks
            .filter((block) => {
              if (
                typeof block?.text !==
                "string"
              ) {
                return false;
              }

              if (
                !Array.isArray(
                  block.bbox
                )
              ) {
                return false;
              }

              if (
                block.bbox.length !== 4
              ) {
                return false;
              }

              return block.bbox.every(
                (n) =>
                  Number.isFinite(
                    Number(n)
                  )
              );
            })
            .map((block) => ({
              text: block.text,
              bbox: block.bbox.map(
                Number
              ),
            }))
        : [];

    const heights = rawBlocks
      .map(
        (block) =>
          Number(block.bbox[3]) -
          Number(block.bbox[1])
      )
      .filter(
        (h) => Number.isFinite(h) && h > 0
      )
      .sort((a, b) => a - b);

    const medianHeight = heights.length
      ? heights[
          Math.floor(heights.length / 2)
        ]
      : 0;

    const MAX_HEIGHT_MULTIPLIER = 1.6;

    const blocks = rawBlocks.map((block) => {
      const [x1, y1, x2, y2] = block.bbox;
      const height = y2 - y1;

      if (
        medianHeight > 0 &&
        height >
          medianHeight *
            MAX_HEIGHT_MULTIPLIER
      ) {
        return {
          ...block,
          bbox: [
            x1,
            y1,
            x2,
            y1 + medianHeight,
          ],
        };
      }

      return block;
    });

    console.log(
      `[OCR LAYOUT] ${blocks.length} blocks detected` +
        (medianHeight
          ? ` (median line height ${medianHeight.toFixed(
              1
            )}/1000)`
          : "")
    );

    return {
      text,
      blocks,
    };
  } catch (err) {
    console.error(
      "[OCR LAYOUT] Invalid JSON from vision model:",
      content
    );

    return {
      text: content,
      blocks: [],
    };
  }
}

module.exports = {
  gradeWithLLM,
  transcribeHandwrittenImages,
};