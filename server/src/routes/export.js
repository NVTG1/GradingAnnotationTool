const express = require("express");
const { exportAnnotatedPDF } = require("../controllers/exportController");

const router = express.Router();

router.get("/:submissionId", exportAnnotatedPDF);

module.exports = router;