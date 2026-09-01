const mongoose = require("mongoose");

const RubricDefinitionPointSchema = new mongoose.Schema(
  {
    pointId: { type: String, required: true },
    description: { type: String, required: true },
    maxMarks: { type: Number, required: true },
  },
  { _id: false }
);

const SubmissionSchema = new mongoose.Schema(
  {
    questionPaperPath: { type: String, required: true },
    studentAnswerPath: { type: String, required: true },
    modelAnswerPath: { type: String, required: true },

    // Extracted text — filled in right after upload
    questionText: { type: String, default: "" },
    studentAnswerText: { type: String, default: "" },
    modelAnswerText: { type: String, default: "" },

    // Structured rubric points parsed from modelAnswerText.
    // Parsed once (lazily, on first grade request) and cached here
    // so re-grading doesn't re-parse the rubric every time.
    rubricDefinition: { type: [RubricDefinitionPointSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Submission", SubmissionSchema);