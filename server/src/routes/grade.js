const express = require("express");
const { gradeBySubmissionId } = require("../controllers/gradeController");

const router = express.Router();

// POST /api/grade/:submissionId
router.post("/:submissionId", gradeBySubmissionId);

module.exports = router;