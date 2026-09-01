const mongoose = require("mongoose");
const RubricPointSchema = require("./RubricPointSchema");

const GradingResultSchema = new mongoose.Schema(
  {
    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
    },
    totalMarks: { type: Number, required: true },
    maxMarks: { type: Number, required: true },
    rubricPoints: { type: [RubricPointSchema], required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    needsHumanReview: { type: Boolean, required: true, default: false },
    reviewReason: { type: String, default: "" },
    llmStatus: {
      type: String,
      enum: ["ok", "mock", "repaired", "failed"],
      required: true,
    },
  },
  { timestamps: true } // adds createdAt/updatedAt — doubles as our "history" ordering
);

module.exports = mongoose.model("GradingResult", GradingResultSchema);
