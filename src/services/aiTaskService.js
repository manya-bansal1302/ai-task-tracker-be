const gemini = require("../config/gemini");

const allowedPriorities = ["low", "medium", "high"];
const allowedStatuses = ["todo", "in_progress", "review", "done"];

function isValidDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function createTaskDraftFromSpeech(transcript) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });

  const response = await gemini.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: `Convert the user's spoken task into task form fields.

Today's date is ${today}. Interpret relative dates such as "tomorrow" or "Friday" relative to today. If the user does not mention a due date, return an empty string for due_date. Use YYYY-MM-DD for dates.

Create a concise title and do not include priority, status, or due-date phrases in it. Put any extra useful details into description, or use an empty string if there are none. Use the spoken priority when present; otherwise use medium. Priority must be low, medium, or high. Extract the requested board column/status if the user says one: To do means todo, In progress means in_progress, Review means review, and Completed/Done means done. If no status is mentioned, use todo. Do not invent information.

Spoken task: ${transcript}`,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "A concise task title of at most 150 characters.",
          },
          description: {
            type: "string",
            description: "Extra task details, or an empty string.",
          },
          priority: {
            type: "string",
            enum: allowedPriorities,
          },
          status: { type: "string", enum: allowedStatuses },
          due_date: {
            type: "string",
            description: "Due date in YYYY-MM-DD format, or an empty string.",
          },
        },
        required: ["title", "description", "priority", "status", "due_date"],
        additionalProperties: false,
      },
    },
  });

  const draft = JSON.parse(response.text);

  if (typeof draft.title !== "string" || !draft.title.trim()) {
    throw new Error("Gemini did not return a valid task title.");
  }

  return {
    title: draft.title.trim().slice(0, 150),
    description:
      typeof draft.description === "string" ? draft.description.trim() : "",
    priority: allowedPriorities.includes(draft.priority)
      ? draft.priority
      : "medium",
    status: allowedStatuses.includes(draft.status) ? draft.status : "todo",
    due_date: isValidDateOnly(draft.due_date) ? draft.due_date : "",
  };
}

async function createTaskDraftFromAudio(audioBase64, mimeType) {
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });

  const response = await gemini.models.generateContent({
    model: "gemini-3.5-flash-lite",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Listen to the user's spoken task and create a task draft from the audio.

Today's date is ${today}. The speaker uses Indian English. First transcribe what they said as accurately as possible, preserving task names and terms such as DSA. Interpret relative due dates like "tomorrow" or "Friday" relative to today's date. If no due date is spoken, return an empty due_date. Dates must use YYYY-MM-DD.

Create a concise title and keep priority, status, and due-date phrases out of the title. Put any other task details in description, or use an empty string if there are none. Use the spoken priority; if the speaker does not mention one, use medium. Priority must be low, medium, or high. Extract the requested board column/status if the speaker says one: To do means todo, In progress means in_progress, Review means review, and Completed/Done means done. If no status is mentioned, use todo. Do not invent information.

Return the transcript and task fields only.`,
          },
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          transcript: { type: "string" },
          title: {
            type: "string",
            description: "A concise task title of at most 150 characters.",
          },
          description: {
            type: "string",
            description: "Extra task details, or an empty string.",
          },
          priority: { type: "string", enum: allowedPriorities },
          status: { type: "string", enum: allowedStatuses },
          due_date: {
            type: "string",
            description: "Due date in YYYY-MM-DD format, or an empty string.",
          },
        },
        required: ["transcript", "title", "description", "priority", "status", "due_date"],
        additionalProperties: false,
      },
    },
  });

  const draft = JSON.parse(response.text);

  if (typeof draft.title !== "string" || !draft.title.trim()) {
    throw new Error("Gemini did not return a valid task title.");
  }

  return {
    transcript: typeof draft.transcript === "string" ? draft.transcript.trim() : "",
    title: draft.title.trim().slice(0, 150),
    description:
      typeof draft.description === "string" ? draft.description.trim() : "",
    priority: allowedPriorities.includes(draft.priority)
      ? draft.priority
      : "medium",
    status: allowedStatuses.includes(draft.status) ? draft.status : "todo",
    due_date: isValidDateOnly(draft.due_date) ? draft.due_date : "",
  };
}

module.exports = { createTaskDraftFromSpeech, createTaskDraftFromAudio };
