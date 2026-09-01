const express = require("express");
const multer = require("multer");
const { uploadSubmission } = require("../controllers/uploadController");

const router = express.Router();

// multer config: store files temporarily on disk in src/uploads/
// (we'll move/reference them properly once we build the Submission model)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "src/uploads/"),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

// POST /api/upload
// Expects three files: questionPaper, studentAnswer, modelAnswer
router.post(
  "/",
  upload.fields([
    { name: "questionPaper", maxCount: 1 },
    { name: "studentAnswer", maxCount: 1 },
    { name: "modelAnswer", maxCount: 1 },
  ]),
  uploadSubmission
);

module.exports = router;
