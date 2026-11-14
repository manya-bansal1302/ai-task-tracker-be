const {
  createTaskDraftFromSpeech,
  createTaskDraftFromAudio,
} = require("../services/aiTaskService");

const allowedAudioTypes = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/m4a",
  "audio/aac",
  "audio/opus",
];

async function parseSpokenTask(req, res) {
  const { transcript } = req.body;

  if (typeof transcript !== "string" || !transcript.trim()) {
    return res.status(400).json({ message: "Please speak or enter a task first." });
  }

  if (transcript.trim().length > 1000) {
    return res.status(400).json({ message: "The spoken task is too long." });
  }

  try {
    const task = await createTaskDraftFromSpeech(transcript.trim());
    return res.status(200).json({ task });
  } catch (error) {
    console.error("Could not create task draft from speech:", error.message);
    return res.status(500).json({
      message: "Could not understand that task. Please try again or enter it manually.",
    });
  }
}

async function parseRecordedTask(req, res) {
  const { audioBase64, mimeType } = req.body;

  if (
    typeof audioBase64 !== "string" ||
    !audioBase64 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)
  ) {
    return res.status(400).json({ message: "Please record your task first." });
  }

  if (audioBase64.length > 6_500_000) {
    return res.status(413).json({ message: "That recording is too large. Please record a shorter task." });
  }

  if (!allowedAudioTypes.includes(mimeType)) {
    return res.status(415).json({ message: "This audio format is not supported by the task assistant." });
  }

  try {
    const task = await createTaskDraftFromAudio(audioBase64, mimeType);
    return res.status(200).json({ task });
  } catch (error) {
    console.error("Could not create task draft from audio:", error.message);
    return res.status(500).json({
      message: "Could not understand that recording. Please try again or enter the task manually.",
    });
  }
}

module.exports = { parseSpokenTask, parseRecordedTask };
