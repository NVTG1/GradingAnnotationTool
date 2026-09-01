const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Annotation = require("../models/Annotation");

// GET /api/annotations/:submissionId
const listAnnotations = asyncHandler(async (req, res) => {
  const annotations = await Annotation.find({ submissionId: req.params.submissionId }).sort({
    startOffset: 1,
  });
  res.json({ annotations });
});

// POST /api/annotations/:submissionId
// Manually add a new annotation. createdBy is forced to "user" here —
// only the auto-generation step is allowed to create "system" ones.
const createAnnotation = asyncHandler(async (req, res) => {
  const { type, anchorText, startOffset, endOffset, note } = req.body;

  if (!type || startOffset === undefined || endOffset === undefined) {
    throw new AppError(
      "type, startOffset, and endOffset are required",
      400,
      "INVALID_ANNOTATION"
    );
  }

  const annotation = await Annotation.create({
    submissionId: req.params.submissionId,
    type,
    anchorText: anchorText || "",
    startOffset,
    endOffset,
    note: note || "",
    createdBy: "user",
  });

  res.status(201).json({ annotation });
});

// PATCH /api/annotations/:submissionId/:annotationId
// Move, retype, or edit the note of an existing annotation.
// Crucially: this never touches GradingResult or triggers re-grading.
const updateAnnotation = asyncHandler(async (req, res) => {
  const { annotationId } = req.params;
  const allowedFields = ["type", "anchorText", "startOffset", "endOffset", "note"];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  const annotation = await Annotation.findByIdAndUpdate(annotationId, updates, {
    new: true,
    runValidators: true,
  });

  if (!annotation) {
    throw new AppError("Annotation not found", 404, "ANNOTATION_NOT_FOUND");
  }

  res.json({ annotation });
});

// DELETE /api/annotations/:submissionId/:annotationId
const deleteAnnotation = asyncHandler(async (req, res) => {
  const result = await Annotation.findByIdAndDelete(req.params.annotationId);
  if (!result) {
    throw new AppError("Annotation not found", 404, "ANNOTATION_NOT_FOUND");
  }
  res.json({ message: "Annotation deleted" });
});

module.exports = { listAnnotations, createAnnotation, updateAnnotation, deleteAnnotation };