// One file, one job: every HTTP call to the backend lives here.
// Nothing else in the app should call fetch() directly — that keeps the
// API contract (routes, request/response shapes) in exactly one place,
// so if a route ever changes shape, this is the only file that moves.

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

// The backend's errorHandler always replies with { error: { message, code } }
// (see server/src/middleware/errorHandler.js) — both for AppErrors we threw
// on purpose (400/404s) and for unexpected 500s. We normalize both into a
// single JS Error so every caller can just `catch (err) { err.message }`
// without caring whether the failure was a validation error, a 404, or the
// server falling over.
async function handleResponse(res) {
  if (res.ok) {
    return res.json();
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Request failed with status ${res.status}`);
  }
  const err = new Error(body?.error?.message || `Request failed with status ${res.status}`);
  err.code = body?.error?.code;
  err.status = res.status;
  throw err;
}

// POST /api/upload — multipart/form-data with three PDF files.
// Field names must match server/src/routes/upload.js's multer config exactly.
export async function uploadSubmission({ questionPaper, studentAnswer, modelAnswer }) {
  const formData = new FormData();
  formData.append("questionPaper", questionPaper);
  formData.append("studentAnswer", studentAnswer);
  formData.append("modelAnswer", modelAnswer);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData, // never set Content-Type manually — the browser sets
                     // the multipart boundary itself; overriding it breaks parsing
  });
  return handleResponse(res);
}

// POST /api/grade/:submissionId
// forceScenario is the test/demo-only hook gradingService.js accepts:
// "blank" (handled client-side, see ScenarioPicker), "malformed",
// "api_failure", "over_max", or undefined for a normal grade.
export async function gradeSubmission(submissionId, forceScenario) {
  const res = await fetch(`${API_BASE}/api/grade/${submissionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(forceScenario ? { forceScenario } : {}),
  });
  return handleResponse(res);
}

export async function fetchAnnotations(submissionId) {
  const res = await fetch(`${API_BASE}/api/annotations/${submissionId}`);
  return handleResponse(res);
}

export async function createAnnotation(submissionId, annotation) {
  const res = await fetch(`${API_BASE}/api/annotations/${submissionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(annotation),
  });
  return handleResponse(res);
}

// Partial update — only send fields that changed. The backend
// (annotationController.updateAnnotation) whitelists these same fields
// and never touches GradingResult, so this never triggers a re-grade.
export async function updateAnnotation(submissionId, annotationId, updates) {
  const res = await fetch(`${API_BASE}/api/annotations/${submissionId}/${annotationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return handleResponse(res);
}

export async function deleteAnnotation(submissionId, annotationId) {
  const res = await fetch(`${API_BASE}/api/annotations/${submissionId}/${annotationId}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}

export async function fetchHistory() {
  const res = await fetch(`${API_BASE}/api/history`);
  return handleResponse(res);
}

// Returns { gradingResult, submission } — this is how we get the FULL
// studentAnswerText after grading (the /api/grade response only returns
// the gradingResult, not the submission), and how history detail works.
export async function fetchHistoryItem(gradingResultId) {
  const res = await fetch(`${API_BASE}/api/history/${gradingResultId}`);
  return handleResponse(res);
}

// Export is a plain GET that streams back a PDF with a
// Content-Disposition: attachment header — the browser handles the
// download itself, so components just need this URL for an <a href>,
// not a fetch() + blob dance.
export function exportUrl(submissionId) {
  return `${API_BASE}/api/export/${submissionId}`;
}

export { API_BASE };
