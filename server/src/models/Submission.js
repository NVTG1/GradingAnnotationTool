const mongoose = require("mongoose");

const SubmissionSchema = new mongoose.Schema(
  {
    questionPaperPath: { type: String, required: true },
    studentAnswerPath: { type: String, required: true },
    modelAnswerPath: { type: String, required: true },
    studentAnswerText: { type: String, default: "" }, // extracted text, filled in after parsing
  },
  { timestamps: true }
);

module.exports = mongoose.model("Submission", SubmissionSchema);
