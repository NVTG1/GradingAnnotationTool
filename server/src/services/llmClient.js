// The rest of the app never talks to Groq/OpenAI directly — it only
// calls `gradeWithLLM(prompt)`. That means:
//  1. Swapping providers (mock <-> real) is a one-line env var change.
//  2. Our mock can simulate failures/malformed output on demand,
//     which is REQUIRED by the assignment's test list.

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

// --- Mock provider ---
// `forceScenario` lets our tests deterministically trigger each
// required test case (failure, malformed output, etc.) without
// depending on a real API's behavior.
// `mode` distinguishes a rubric-parsing call from a grading call,
// since the two need differently-shaped mock responses.
async function mockLLM(prompt, forceScenario, mode) {
  if (forceScenario === "api_failure") {
    throw new AppError("Simulated LLM API failure", 502, "LLM_UNAVAILABLE");
  }

  if (forceScenario === "malformed") {
    return "This is not valid JSON at all {{{";
  }

  if (mode === "rubric") {
    return JSON.stringify({ rubricPoints: extractRubricFromDocument(prompt) });
  }

  if (forceScenario === "over_max") {
    // Deliberately return marks that exceed the max, to test our clamp logic
    return JSON.stringify({
      rubricPoints: [
        { pointId: "p1", awardedMarks: 999, status: "correct", evidence: "x", feedback: "y" },
      ],
    });
  }

  // Default: score each rubric point against the student's answer with a
  // small keyword-overlap heuristic, instead of returning one fixed canned
  // response regardless of input. Without this, every submission — a
  // fully correct answer, an off-topic one, anything — scored identically,
  // which silently defeats two of the assignment's required test cases
  // ("fully correct answer" and "an incorrect answer" need to actually
  // differ). This is intentionally simple (word overlap, not real language
  // understanding) — good enough to make results vary meaningfully with
  // input, not a substitute for a real LLM call.
  return JSON.stringify({ rubricPoints: heuristicGrade(prompt) });
}

// --- Rubric-mode heuristic: extract real rubric criteria from the model-
// answer document instead of always returning a fixed 4-point placeholder.
// The model-answer text is embedded in the rubric-parse prompt after a
// "DOCUMENT:" marker (see rubricParser.buildRubricParsePrompt). Many rubric
// documents lay out criteria as "<description> <marks>" lines (e.g. inside a
// "Criterion | Marks" table extracted from a PDF) — we look for that
// pattern directly rather than trying to summarize free text.
function extractRubricFromDocument(prompt) {
  const docMatch = prompt.match(/DOCUMENT:\n([\s\S]*)$/);
  const doc = docMatch ? docMatch[1] : "";

  const points = [];
  let buffer = [];        // accumulates a criterion's wrapped description text
  let pendingMarks = null; // a mark value seen on its own line, awaiting a
                            // possible continuation fragment after it (some
                            // PDF table extractions place the "Marks" column
                            // value BETWEEN the two halves of a wrapped
                            // criterion, e.g. "...the relevant principle/Ohm's" / "1" / "law")

  function flushAsPoint(description, maxMarks) {
    if (maxMarks >= 1 && maxMarks <= 20 && description.length >= 15) {
      points.push({ pointId: `p${points.length + 1}`, description, maxMarks });
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
      buffer = [];
      continue;
    }

    const bareNumber = line.match(/^(\d{1,2})$/);
    if (bareNumber) {
      // Only flush-and-reset if a mark value was ALREADY pending (i.e. two
      // bare-number lines with no continuation text between them) — that
      // means the previous one never got its continuation fragment.
      // Otherwise keep the buffer intact: it holds the description text
      // this number belongs to, and still needs a continuation fragment
      // (or none at all) after it.
      if (pendingMarks !== null) flushPending();
      pendingMarks = Number(bareNumber[1]);
      continue;
    }

    // Note: the text-before-the-number on THIS line can be very short
    // (e.g. "law 1", the tail end of a wrapped criterion) — the minimum
    // length check that filters out noise happens in flushAsPoint, on the
    // full combined description (buffer + this line), not on this line
    // alone.
    const inline = line.match(/^(.*\S)\s+(\d{1,2})$/);
    if (inline) {
      if (pendingMarks !== null) {
        // A dangling pending number (from an earlier bare-number line)
        // never got its continuation before a whole new criterion line
        // showed up — flush it as a best-effort partial point, and treat
        // this line as an unrelated fresh criterion (don't merge buffers).
        flushPending();
        flushAsPoint(inline[1].trim(), Number(inline[2]));
      } else {
        // Normal case: buffer may hold earlier wrapped lines of THIS same
        // criterion, ending here with its mark value.
        flushAsPoint([...buffer, inline[1].trim()].join(" ").trim(), Number(inline[2]));
      }
      buffer = [];
      pendingMarks = null;
      continue;
    }

    // Plain text line: either a wrapped description fragment (before a
    // marks value has appeared) or the trailing continuation fragment
    // that follows a bare-number line (e.g. "law").
    buffer.push(line);
    if (pendingMarks !== null) {
      flushAsPoint(buffer.join(" ").trim(), pendingMarks);
      buffer = [];
      pendingMarks = null;
    } else if (buffer.length > 4) {
      buffer.shift(); // cap runaway buffering on unrelated prose
    }
  }
  flushPending();

  if (points.length > 0) return points;

  // Fallback for documents that don't have a parseable "text + number"
  // rubric layout (e.g. short synthetic strings used in unit tests).
  return [
    { pointId: "p1", description: "Defines the core concept correctly", maxMarks: 3 },
    { pointId: "p2", description: "Explains how/why it works", maxMarks: 3 },
    { pointId: "p3", description: "Gives a correct, relevant example", maxMarks: 2 },
    { pointId: "p4", description: "Clarity and structure of the answer", maxMarks: 2 },
  ];
}

// --- Grade-mode heuristic ---
// The app only ever calls gradeWithLLM(prompt) — the mock has no separate
// entry point for rubric/student data, so we pull both back out of the
// prompt string via regex. This mirrors gradingService.buildPrompt's fixed
// format exactly; if that format changes, update these regexes too.
const STOPWORDS = new Set([
  "the","and","for","that","with","this","from","have","are","was","were",
  "will","would","could","should","their","there","then","than","into",
  "your","which","when","what","where","does","not","but","also","such",
  "each","been","being","they","them","these","those","about","above",
  "between","through","during","before","after","because","while",
]);

function significantWords(text) {
  return (text.toLowerCase().match(/[a-z]+/g) || [])
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

// Splits a document into per-question sections when it's laid out with
// "Q1 ...", "Q2 ..." style headers (as GradeSense's question paper, model
// answer, and multi-question student answers all are). Returns null when
// fewer than 2 such headers are found, so callers can fall back to
// treating the whole document as one section.
function splitIntoSections(text) {
  const headerRe = /^Q\d+\b.*$/gim;
  const matches = [...text.matchAll(headerRe)];
  if (matches.length < 2) return null;

  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    sections.push(text.slice(start, end));
  }
  return sections;
}

function heuristicGrade(prompt) {
  const modelMatch = prompt.match(/MODEL ANSWER:\n([\s\S]*?)\n\nRUBRIC POINTS/);
  const rubricMatch = prompt.match(
    /RUBRIC POINTS \(award marks only up to maxMarks for each\):\n([\s\S]*?)\n\nSTUDENT ANSWER:/
  );
  const studentMatch = prompt.match(/STUDENT ANSWER:\n([\s\S]*?)\n\nFor each rubric point/);

  let rubricDefinition = [];
  try {
    rubricDefinition = rubricMatch ? JSON.parse(rubricMatch[1]) : [];
  } catch {
    rubricDefinition = [];
  }
  const modelAnswerText = modelMatch ? modelMatch[1] : "";
  const studentAnswerText = studentMatch ? studentMatch[1] : "";

  // Guard against cross-question false positives: on a multi-question
  // answer (e.g. a Science + English + Economics paper in one submission),
  // matching a rubric point's keywords against the ENTIRE student answer
  // means a Q1 rubric point can pick up "evidence" from the student's Q3
  // answer just because they share generic vocabulary. When both the
  // model answer and the student answer have parseable "Q1/Q2/Q3" section
  // headers (in the same count/order), scope each rubric point's matching
  // to only the student's answer for the same question its description
  // came from. Falls back to whole-text matching otherwise (e.g. the
  // single-question synthetic prompts used in unit tests).
  const modelSections = splitIntoSections(modelAnswerText);
  const studentSections = splitIntoSections(studentAnswerText);
  const sectionsUsable =
    modelSections && studentSections && modelSections.length === studentSections.length;

  // Split into sentences once so we can quote a real one back as evidence
  // (annotationGenerator anchors annotations by locating evidence as a
  // literal substring in the student's answer, so evidence must never be
  // invented text).
  const allSentences = studentAnswerText
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return rubricDefinition.map((point) => {
    const keywords = significantWords(point.description || "");

    let scopedStudentText = studentAnswerText;
    let scopedSentences = allSentences;
    if (sectionsUsable) {
      const sectionIndex = modelSections.findIndex((sec) => sec.includes(point.description));
      if (sectionIndex !== -1) {
        scopedStudentText = studentSections[sectionIndex];
        scopedSentences = scopedStudentText
          .split(/(?<=[.?!])\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    const lowerStudent = scopedStudentText.toLowerCase();
    const matchedKeywords = keywords.filter((k) => lowerStudent.includes(k));
    const overlap = keywords.length > 0 ? matchedKeywords.length / keywords.length : 0;

    let status, awardedMarks;
    if (overlap >= 0.6) {
      status = "correct";
      awardedMarks = point.maxMarks;
    } else if (overlap >= 0.25) {
      status = "partial";
      awardedMarks = Math.round(point.maxMarks / 2);
    } else if (scopedStudentText.trim().length > 0) {
      // The student wrote something for this question, but none of the
      // rubric point's keywords show up in it — that's a wrong-reasoning
      // ("incorrect") answer, not an absent ("missing") one. The
      // rubric-point status enum and annotationGenerator (which maps
      // "incorrect" -> a strikethrough annotation, vs. "missing" -> an
      // unanchored comment) were already built to distinguish these two
      // cases; this heuristic previously collapsed them both into
      // "missing", which meant the assignment's "incorrect answer" test
      // case couldn't actually be exercised through the mock.
      status = "incorrect";
      awardedMarks = 0;
    } else {
      status = "missing";
      awardedMarks = 0;
    }

    // Evidence must be a real substring of the student's answer — pick the
    // first sentence containing a matched keyword, if any.
    // Pick the sentence containing the MOST matched keywords (not just the
    // first one that contains any) so distinct rubric points on the same
    // question tend to cite different, more specific sentences instead of
    // all pointing at the same generic opening line.
    let evidence = "";
    if (status !== "missing" && matchedKeywords.length > 0) {
      let bestSentence = "";
      let bestCount = 0;
      for (const s of scopedSentences) {
        const lowerS = s.toLowerCase();
        const count = matchedKeywords.filter((k) => lowerS.includes(k)).length;
        if (count > bestCount) {
          bestCount = count;
          bestSentence = s;
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

// --- Real provider (Groq) ---
async function callGroq(prompt) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AppError("GROQ_API_KEY not set", 500, "BAD_CONFIG");
  }

  let response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
    });
  } catch (networkErr) {
    // Network-level failure (DNS, timeout, connection refused)
    throw new AppError("LLM API unreachable", 502, "LLM_UNAVAILABLE");
  }

  if (!response.ok) {
    throw new AppError(`LLM API returned ${response.status}`, 502, "LLM_UNAVAILABLE");
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

module.exports = { gradeWithLLM };