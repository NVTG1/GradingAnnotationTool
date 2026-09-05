const mongoose = require("mongoose");

const AnnotationSchema =
  new mongoose.Schema(
    {
      submissionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Submission",
        required: true,
      },

      type: {
        type: String,
        enum: [
          "highlight",
          "underline",
          "box",
          "strikethrough",
          "comment",
        ],
        required: true,
      },

      status: {
        type: String,
        enum: ["correct", "partial", "incorrect", "missing", null],
        default: null,
      },

      anchorText: {
        type: String,
        default: "",
      },

      startOffset: {
        type: Number,
        default: 0,
      },

      endOffset: {
        type: Number,
        default: 0,
      },

      pageNumber: {
        type: Number,
        default: null,
      },

      x: {
        type: Number,
        default: null,
      },

      y: {
        type: Number,
        default: null,
      },

      width: {
        type: Number,
        default: null,
      },

      height: {
        type: Number,
        default: null,
      },

      note: {
        type: String,
        default: "",
      },

      createdBy: {
        type: String,
        enum: ["system", "user"],
        default: "system",
      },

      // True once a teacher has directly edited/moved/resized an
      // auto-generated annotation (createdBy stays "system" — it
      // still traces back to the AI's original evidence match).
      // Without this, re-grading always wipes and regenerates every
      // "system" annotation, which would silently discard a
      // teacher's manual correction/reposition the moment anyone
      // re-grades the same submission.
      editedByUser: {
        type: Boolean,
        default: false,
      },
    },
    {
      timestamps: true,
    }
  );

module.exports =
  mongoose.model(
    "Annotation",
    AnnotationSchema
  );