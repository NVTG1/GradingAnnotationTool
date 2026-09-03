const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Annotation = require("../models/Annotation");

const listAnnotations =
  asyncHandler(async (req, res) => {
    const annotations =
      await Annotation.find({
        submissionId:
          req.params.submissionId,
      }).sort({
        pageNumber: 1,
        y: 1,
        startOffset: 1,
      });

    res.json({
      annotations,
    });
  });

const createAnnotation =
  asyncHandler(async (req, res) => {
    const {
      type,
      anchorText,
      startOffset,
      endOffset,
      note,
      pageNumber,
      x,
      y,
      width,
      height,
    } = req.body;

    if (!type) {
      throw new AppError(
        "type is required",
        400,
        "INVALID_ANNOTATION"
      );
    }

    const annotation =
      await Annotation.create({
        submissionId:
          req.params.submissionId,

        type,

        anchorText:
          anchorText || "",

        startOffset:
          startOffset ?? 0,

        endOffset:
          endOffset ?? 0,

        pageNumber:
          pageNumber ?? null,

        x: x ?? null,
        y: y ?? null,
        width: width ?? null,
        height: height ?? null,

        note: note || "",

        createdBy: "user",
      });

    res.status(201).json({
      annotation,
    });
  });

const updateAnnotation =
  asyncHandler(async (req, res) => {
    const {
      annotationId,
    } = req.params;

    const allowedFields = [
      "type",
      "anchorText",
      "startOffset",
      "endOffset",
      "note",
      "pageNumber",
      "x",
      "y",
      "width",
      "height",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (
        req.body[field] !==
        undefined
      ) {
        updates[field] =
          req.body[field];
      }
    }

    const annotation =
      await Annotation.findByIdAndUpdate(
        annotationId,
        updates,
        {
          new: true,
          runValidators: true,
        }
      );

    if (!annotation) {
      throw new AppError(
        "Annotation not found",
        404,
        "ANNOTATION_NOT_FOUND"
      );
    }

    res.json({
      annotation,
    });
  });

const deleteAnnotation =
  asyncHandler(async (req, res) => {
    const result =
      await Annotation.findByIdAndDelete(
        req.params.annotationId
      );

    if (!result) {
      throw new AppError(
        "Annotation not found",
        404,
        "ANNOTATION_NOT_FOUND"
      );
    }

    res.json({
      message:
        "Annotation deleted",
    });
  });

module.exports = {
  listAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
};