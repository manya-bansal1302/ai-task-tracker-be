const express = require("express");
const requireAuth = require("../middleware/requireAuth");
const { createTaskReport } = require("../controllers/aiReportController");
const {
  parseSpokenTask,
  parseRecordedTask,
} = require("../controllers/aiTaskController");

const router = express.Router();

router.post("/task-report", requireAuth, createTaskReport);
router.post("/parse-task", requireAuth, parseSpokenTask);
router.post("/parse-audio-task", requireAuth, parseRecordedTask);

module.exports = router;
