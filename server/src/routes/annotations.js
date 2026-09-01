const express = require("express");
const {
  listAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} = require("../controllers/annotationController");

const router = express.Router();

router.get("/:submissionId", listAnnotations);
router.post("/:submissionId", createAnnotation);
router.patch("/:submissionId/:annotationId", updateAnnotation);
router.delete("/:submissionId/:annotationId", deleteAnnotation);

module.exports = router;