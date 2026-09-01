const express = require("express");
const { listHistory, getHistoryItem } = require("../controllers/historyController");

const router = express.Router();

router.get("/", listHistory);
router.get("/:id", getHistoryItem);

module.exports = router;