const gemini = require("../config/gemini");

async function generateTaskReport(tasks) {
  const reportTasks = tasks.map((task) => ({
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.due_date,
  }));
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `
Create a concise Weekly Focus Plan using the user's task data.

Today's date is ${today}. Treat due dates as YYYY-MM-DD.
Use plain, simple language. Do not use Markdown, bullets, numbering, or decorative symbols.
Keep the complete plan under 100 words. Do not repeat a task in multiple sections.

Use exactly these section headings:

WEEKLY FOCUS
Name the single most important unfinished task and explain briefly why it should come first. Consider priority, status, and due date.

UPCOMING DEADLINES
Mention unfinished tasks due today or within the next 7 days, with their due dates. If none are due soon, say "No tasks are due in the next 7 days."

PROGRESS
State how many tasks are completed and how many are unfinished.

NEXT STEP
Give one small, practical action the user can take now.

Use only the task data below. Never invent task details or dates. Never recommend a completed task. If there are no tasks, reply exactly: "No tasks yet. Add a task to create your Weekly Focus Plan."

Task data:
${JSON.stringify(reportTasks, null, 2)}
`;
  const response = await gemini.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: prompt,
  });

  return response.text;
}

module.exports = { generateTaskReport };
