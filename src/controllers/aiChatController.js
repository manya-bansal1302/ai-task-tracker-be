const pool = require("../config/db");
const { answerTaskPilotChat } = require("../services/aiChatService");

const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 1200;

async function chatWithTasks(req, res) {
  const { messages } = req.body;

  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES ||
    messages.some(
      (message) =>
        !message ||
        !["user", "model"].includes(message.role) ||
        typeof message.text !== "string" ||
        !message.text.trim() ||
        message.text.length > MAX_MESSAGE_LENGTH,
    ) ||
    messages[messages.length - 1]?.role !== "user"
  ) {
    return res.status(400).json({ message: "Please send a valid chat message." });
  }

  try {
    const [tasks] = await pool.execute(
      `SELECT title, description, status, priority,
              DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date
       FROM tasks
       WHERE user_id = ?
       ORDER BY due_date IS NULL, due_date ASC
       LIMIT 100`,
      [req.userId],
    );

    const reply = await answerTaskPilotChat(messages, tasks);
    return res.status(200).json({ reply });
  } catch (error) {
    console.error("Could not answer TaskPilot chat:", error.message);
    return res.status(500).json({ message: "Could not get an AI response. Please try again." });
  }
}

module.exports = { chatWithTasks };
