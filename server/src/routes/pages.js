const express = require("express");
const { getPageImages } = require("../controllers/pageImageController");

const router = express.Router();

router.get("/:submissionId", getPageImages);

module.exports = router;