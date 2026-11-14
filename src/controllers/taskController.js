const pool = require("../config/db");

async function createTask(req, res) {
  try {
    const { title, description, priority, due_date, status } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ message: "Task title is required." });
    }

    const allowedPriorities = ["low", "medium", "high"];
    const taskPriority = priority || "medium";
    const allowedStatuses = ["todo", "in_progress", "review", "done"];
    const taskStatus = status || "todo";

    if (!allowedPriorities.includes(taskPriority)) {
      return res.status(400).json({ message: "Invalid task priority." });
    }

    if (!allowedStatuses.includes(taskStatus)) {
      return res.status(400).json({ message: "Invalid task status." });
    }

    const [result] = await pool.execute(
      `INSERT INTO tasks
        (user_id, title, description, status, priority, due_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.userId,
        title.trim(),
        description?.trim() || null,
        taskStatus,
        taskPriority,
        due_date || null,
      ],
    );

    const [tasks] = await pool.execute(
      `SELECT id, title, description, status, priority, due_date,
              created_at, updated_at
       FROM tasks
       WHERE id = ? AND user_id = ?`,
      [result.insertId, req.userId],
    );

    return res.status(201).json({
      message: "Task created.",
      task: tasks[0],
    });
  } catch (error) {
    console.error("Could not create task:", error.message);
    return res.status(500).json({ message: "Could not create task." });
  }
}

async function getTasks(req, res) {
  try {
    const [tasks] = await pool.execute(
      `SELECT id, title, description, status, priority, due_date,
              created_at, updated_at
       FROM tasks
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.userId],
    );

    return res.status(200).json({ tasks });
  } catch (error) {
    console.error("Could not get tasks:", error.message);
    return res.status(500).json({ message: "Could not get tasks." });
  }
}

async function updateTasksStatus(req, res) {
  const { taskIds, status } = req.body;
  const allowedStatuses = ["todo", "in_progress", "review", "done"];

  if (!Array.isArray(taskIds) || taskIds.length === 0 || taskIds.length > 50) {
    return res.status(400).json({
      message: "Provide between 1 and 50 task IDs.",
    });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({ message: "Invalid task status." });
  }

  const uniqueTaskIds = [...new Set(taskIds.map(String))];

  if (uniqueTaskIds.some((id) => !/^[1-9][0-9]*$/.test(id))) {
    return res
      .status(400)
      .json({ message: "Task IDs must be positive integers." });
  }

  let connection;
  let transactionStarted = false;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    const placeholders = uniqueTaskIds.map(() => "?").join(", ");
    const [existingTasks] = await connection.execute(
      `SELECT id FROM tasks
       WHERE user_id = ? AND id IN (${placeholders})
       FOR UPDATE`,
      [req.userId, ...uniqueTaskIds],
    );

    if (existingTasks.length !== uniqueTaskIds.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({
        message: "One or more tasks were not found.",
      });
    }

    await connection.execute(
      `UPDATE tasks SET status = ?
       WHERE user_id = ? AND id IN (${placeholders})`,
      [status, req.userId, ...uniqueTaskIds],
    );

    await connection.commit();
    transactionStarted = false;

    return res.status(200).json({
      message: "Task statuses updated.",
      taskIds: uniqueTaskIds,
      status,
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("Could not update task statuses:", error.message);
    return res.status(500).json({ message: "Could not update task statuses." });
  } finally {
    connection?.release();
  }
}

async function updateTaskStatus(req, res) {
  try {
    const { status } = req.body;
    const allowedStatuses = ["todo", "in_progress", "review", "done"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid task status." });
    }

    const [existingTasks] = await pool.execute(
      "SELECT id FROM tasks WHERE id = ? AND user_id = ?",
      [req.params.id, req.userId],
    );

    if (existingTasks.length === 0) {
      return res.status(404).json({ message: "Task not found." });
    }

    await pool.execute(
      "UPDATE tasks SET status = ? WHERE id = ? AND user_id = ?",
      [status, req.params.id, req.userId],
    );

    return res.status(200).json({
      message: "Task status updated.",
      task: {
        id: req.params.id,
        status,
      },
    });
  } catch (error) {
    console.error("Could not update task status:", error.message);
    return res.status(500).json({ message: "Could not update task status." });
  }
}

function getValidTaskIds(taskIds) {
  if (!Array.isArray(taskIds) || taskIds.length === 0 || taskIds.length > 50) {
    return null;
  }

  const ids = [...new Set(taskIds.map(String))];
  if (ids.some((id) => !/^[1-9][0-9]*$/.test(id))) return null;
  return ids;
}

async function updateTask(req, res) {
  try {
    const { title, description, priority, due_date, status } = req.body;
    const updates = [];
    const values = [];
    const allowedStatuses = ["todo", "in_progress", "review", "done"];
    const allowedPriorities = ["low", "medium", "high"];

    if (title !== undefined) {
      if (typeof title !== "string" || !title.trim() || title.trim().length > 150) {
        return res.status(400).json({ message: "Enter a task name up to 150 characters." });
      }
      updates.push("title = ?");
      values.push(title.trim());
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return res.status(400).json({ message: "Description must be text." });
      }
      updates.push("description = ?");
      values.push(typeof description === "string" ? description.trim() || null : null);
    }

    if (priority !== undefined) {
      if (!allowedPriorities.includes(priority)) {
        return res.status(400).json({ message: "Invalid task priority." });
      }
      updates.push("priority = ?");
      values.push(priority);
    }

    if (status !== undefined) {
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid task status." });
      }
      updates.push("status = ?");
      values.push(status);
    }

    if (due_date !== undefined) {
      updates.push("due_date = ?");
      values.push(due_date || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "No task changes were provided." });
    }

    await pool.execute(
      `UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
      [...values, req.params.id, req.userId],
    );

    const [tasks] = await pool.execute(
      `SELECT id, title, description, status, priority, due_date,
              created_at, updated_at
       FROM tasks WHERE id = ? AND user_id = ?`,
      [req.params.id, req.userId],
    );

    if (tasks.length === 0) {
      return res.status(404).json({ message: "Task not found." });
    }

    return res.status(200).json({ message: "Task updated.", task: tasks[0] });
  } catch (error) {
    console.error("Could not update task:", error.message);
    return res.status(500).json({ message: "Could not update task." });
  }
}

async function updateTasks(req, res) {
  const taskIds = getValidTaskIds(req.body.taskIds);
  const { priority, status } = req.body;
  const allowedPriorities = ["low", "medium", "high"];
  const allowedStatuses = ["todo", "in_progress", "review", "done"];
  const updates = [];
  const values = [];

  if (!taskIds) {
    return res.status(400).json({ message: "Provide between 1 and 50 valid task IDs." });
  }
  if (priority !== undefined) {
    if (!allowedPriorities.includes(priority)) {
      return res.status(400).json({ message: "Invalid task priority." });
    }
    updates.push("priority = ?");
    values.push(priority);
  }
  if (status !== undefined) {
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid task status." });
    }
    updates.push("status = ?");
    values.push(status);
  }
  if (updates.length === 0) {
    return res.status(400).json({ message: "Choose a priority or status to update." });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const placeholders = taskIds.map(() => "?").join(", ");
    const [existingTasks] = await connection.execute(
      `SELECT id FROM tasks WHERE user_id = ? AND id IN (${placeholders}) FOR UPDATE`,
      [req.userId, ...taskIds],
    );
    if (existingTasks.length !== taskIds.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "One or more tasks were not found." });
    }

    await connection.execute(
      `UPDATE tasks SET ${updates.join(", ")} WHERE user_id = ? AND id IN (${placeholders})`,
      [...values, req.userId, ...taskIds],
    );
    const [tasks] = await connection.execute(
      `SELECT id, title, description, status, priority, due_date,
              created_at, updated_at
       FROM tasks WHERE user_id = ? AND id IN (${placeholders})`,
      [req.userId, ...taskIds],
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(200).json({ message: "Selected tasks updated.", tasks });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    console.error("Could not update selected tasks:", error.message);
    return res.status(500).json({ message: "Could not update selected tasks." });
  } finally {
    connection?.release();
  }
}

async function deleteTasks(req, res) {
  const taskIds = getValidTaskIds(req.body.taskIds);
  if (!taskIds) {
    return res.status(400).json({ message: "Provide between 1 and 50 valid task IDs." });
  }

  let connection;
  let transactionStarted = false;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;
    const placeholders = taskIds.map(() => "?").join(", ");
    const [existingTasks] = await connection.execute(
      `SELECT id FROM tasks WHERE user_id = ? AND id IN (${placeholders}) FOR UPDATE`,
      [req.userId, ...taskIds],
    );
    if (existingTasks.length !== taskIds.length) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(404).json({ message: "One or more tasks were not found." });
    }

    await connection.execute(
      `DELETE FROM tasks WHERE user_id = ? AND id IN (${placeholders})`,
      [req.userId, ...taskIds],
    );
    await connection.commit();
    transactionStarted = false;
    return res.status(200).json({ message: "Selected tasks deleted.", taskIds });
  } catch (error) {
    if (connection && transactionStarted) await connection.rollback();
    console.error("Could not delete selected tasks:", error.message);
    return res.status(500).json({ message: "Could not delete selected tasks." });
  } finally {
    connection?.release();
  }
}

async function deleteTask(req, res) {
  try {
    const [result] = await pool.execute(
      "DELETE FROM tasks WHERE id = ? AND user_id = ?",
      [req.params.id, req.userId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Task not found." });
    }

    return res.status(200).json({ message: "Task deleted." });
  } catch (error) {
    console.error("Could not delete task:", error.message);
    return res.status(500).json({ message: "Could not delete task." });
  }
}
module.exports = {
  createTask,
  getTasks,
  updateTasksStatus,
  updateTaskStatus,
  updateTask,
  updateTasks,
  deleteTask,
  deleteTasks,
};
