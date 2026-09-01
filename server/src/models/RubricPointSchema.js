const mongoose = require("mongoose");

const RubricPointSchema = new mongoose.Schema(
  {
    pointId: { type: String, required: true },
    description: { type: String, required: true },
    maxMarks: { type: Number, required: true },
    awardedMarks: { type: Number, required: true },
    status: {
      type: String,
      enum: ["correct", "partial", "missing", "incorrect"],
      required: true,
    },
    evidence: { type: String, default: "" }, // quoted/paraphrased span from student answer
    feedback: { type: String, required: true },
  },
  { _id: false }
);

module.exports = RubricPointSchema;
