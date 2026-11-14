const express = require("express");
const {
  createTask,
  getTasks,
  updateTasksStatus,
  updateTaskStatus,
  updateTask,
  updateTasks,
  deleteTask,
  deleteTasks,
} = require("../controllers/taskController");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.get("/", requireAuth, getTasks);
router.post("/", requireAuth, createTask);
router.patch("/bulk", requireAuth, updateTasks);
router.delete("/bulk", requireAuth, deleteTasks);
router.patch("/bulk-status", requireAuth, updateTasksStatus);
router.patch("/:id/status", requireAuth, updateTaskStatus);
router.patch("/:id", requireAuth, updateTask);
router.delete("/:id", requireAuth, deleteTask);

module.exports = router;
