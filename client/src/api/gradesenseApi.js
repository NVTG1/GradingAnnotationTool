const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

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

export async function uploadSubmission({ questionPaper, studentAnswer, modelAnswer }) {
  const formData = new FormData();
  formData.append("questionPaper", questionPaper);
  formData.append("studentAnswer", studentAnswer);
  formData.append("modelAnswer", modelAnswer);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(res);
}

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

export async function fetchPageImages(submissionId) {
  const res = await fetch(`${API_BASE}/api/pages/${submissionId}`);
  return handleResponse(res);
}

export async function fetchHistoryItem(gradingResultId) {
  const res = await fetch(`${API_BASE}/api/history/${gradingResultId}`);
  return handleResponse(res);
}

export function exportUrl(submissionId) {
  return `${API_BASE}/api/export/${submissionId}`;
}

export { API_BASE };