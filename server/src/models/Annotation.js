const mongoose = require("mongoose");

// Annotations reference a SUBMISSION, never a GradingResult.
// This is the decoupling the assignment requires: a user can move,
// edit, or delete an annotation without triggering a re-grade,
// because nothing about grading depends on annotation state.
//
// We anchor annotations to TEXT SPANS (line/character offsets into
// the extracted student answer text) rather than PDF pixel
// coordinates — the LLM can reliably point at "this sentence" but
// not at "this exact pixel", and text spans still let us render
// margin-style annotations on the exported PDF.
const AnnotationSchema = new mongoose.Schema(
  {
    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
    },
    type: {
      type: String,
      enum: ["underline", "box", "strikethrough", "comment"],
      required: true,
    },
    // Position anchor: a substring match against the submission's
    // studentAnswerText. Storing the actual matched text (not just
    // offsets) makes annotations resilient to minor re-extraction
    // differences and easy to debug/display.
    anchorText: { type: String, default5: "" },
    startOffset: { type: Number, required: true },
    endOffset: { type: Number, required: true },

    note: { type: String, default: "" }, // the correction/feedback shown alongside
    createdBy: {
      type: String,
      enum: ["system", "user"],
      default: "system", // "system" = auto-generated from grading evidence; "user" = manually added/edited
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Annotation", AnnotationSchema);