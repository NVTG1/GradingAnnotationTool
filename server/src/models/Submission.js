const mongoose = require("mongoose");

const RubricDefinitionPointSchema =
  new mongoose.Schema(
    {
      pointId: {
        type: String,
        required: true,
      },
      description: {
        type: String,
        required: true,
      },
      maxMarks: {
        type: Number,
        required: true,
      },
    },
    { _id: false }
  );

const OCRBlockSchema =
  new mongoose.Schema(
    {
      text: {
        type: String,
        required: true,
      },
      bbox: {
        type: [Number],
        required: true,
      },
    },
    { _id: false }
  );

const OCRPageSchema =
  new mongoose.Schema(
    {
      pageNumber: {
        type: Number,
        required: true,
      },
      text: {
        type: String,
        default: "",
      },
      blocks: {
        type: [OCRBlockSchema],
        default: [],
      },
    },
    { _id: false }
  );

const SubmissionSchema =
  new mongoose.Schema(
    {
      questionPaperPath: {
        type: String,
        required: true,
      },

      studentAnswerPath: {
        type: String,
        required: true,
      },

      modelAnswerPath: {
        type: String,
        required: true,
      },

      questionText: {
        type: String,
        default: "",
      },

      studentAnswerText: {
        type: String,
        default: "",
      },

      modelAnswerText: {
        type: String,
        default: "",
      },

      /*
       * OCR layout of the ORIGINAL student answer.
       *
       * Used to map grading evidence back to the actual
       * handwritten PDF page.
       */
      studentAnswerLayout: {
        type: [OCRPageSchema],
        default: [],
      },

      rubricDefinition: {
        type: [RubricDefinitionPointSchema],
        default: [],
      },
    },
    {
      timestamps: true,
    }
  );

module.exports =
  mongoose.model(
    "Submission",
    SubmissionSchema
  );