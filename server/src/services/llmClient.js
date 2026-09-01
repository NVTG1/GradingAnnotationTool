// The rest of the app never talks to Groq/OpenAI directly — it only
// calls `gradeWithLLM(prompt)`. That means:
//  1. Swapping providers (mock <-> real) is a one-line env var change.
//  2. Our mock can simulate failures/malformed output on demand,
//     which is REQUIRED by the assignment's test list.

const AppError = require("../utils/AppError");

async function gradeWithLLM(prompt, { forceScenario } = {}) {
  const provider = process.env.LLM_PROVIDER || "mock";

  if (provider === "mock") {
    return mockLLM(prompt, forceScenario);
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
async function mockLLM(prompt, forceScenario) {
  if (forceScenario === "api_failure") {
    throw new AppError("Simulated LLM API failure", 502, "LLM_UNAVAILABLE");
  }

  if (forceScenario === "malformed") {
    return "This is not valid JSON at all {{{";
  }

  if (forceScenario === "over_max") {
    // Deliberately return marks that exceed the max, to test our clamp logic
    return JSON.stringify({
      rubricPoints: [
        { pointId: "p1", awardedMarks: 999, status: "correct", evidence: "x", feedback: "y" },
      ],
    });
  }

  // Default: a plausible, well-formed mock response.
  return JSON.stringify({
    rubricPoints: [
      {
        pointId: "p1",
        awardedMarks: 2,
        status: "partial",
        evidence: "Student mentioned the concept but did not justify it.",
        feedback: "Add a brief justification to earn full marks.",
      },
    ],
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
