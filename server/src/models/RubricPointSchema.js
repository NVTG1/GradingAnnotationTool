const mongoose = require("mongoose");

const RubricPointSchema = new mongoose.Schema(
  {
    pointId: { type: String, required: true },
    description: { type: String, required: true },
    maxMarks: { type: Number, required: true, min: 0 },
    awardedMarks: {
      type: Number,
      required: true,
      min: [0, "awardedMarks cannot be negative"],
      // Defense in depth: gradingValidator.validateAndClamp already
      // enforces "never more than maxMarks" in the service layer
      // before this ever reaches the DB, but a schema-level guard
      // means the invariant holds even if some other code path
      // (a migration script, a manual DB edit, a future endpoint)
      // ever writes a GradingResult without going through it.
      validate: {
        validator: function (value) {
          // `this` is the rubric-point subdocument, so maxMarks here
          // is this SAME point's max, not the whole submission's.
          return value <= this.maxMarks;
        },
        message:
          "awardedMarks ({VALUE}) cannot exceed this rubric point's maxMarks",
      },
    },
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