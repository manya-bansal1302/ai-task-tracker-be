const pool = require("../config/db");
const { generateTaskReport } = require("../services/aiReportService");

async function createTaskReport(req, res) {
  try {
    const [tasks] = await pool.execute(
      `SELECT title, description, status, priority,
              DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date
       FROM tasks
       WHERE user_id = ?
       ORDER BY due_date IS NULL, due_date ASC`,
      [req.userId],
    );

    const report = await generateTaskReport(tasks);

    return res.status(200).json({ report });
  } catch (error) {
    console.error("Could not generate AI task report:", error.message);
    return res.status(500).json({
      message: "Could not generate the task report.",
    });
  }
}

module.exports = { createTaskReport };
