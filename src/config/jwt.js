const jwt = require("jsonwebtoken");

const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is missing from the backend .env file.");
}

function createAppToken(userId) {
  return jwt.sign({}, jwtSecret, {
    subject: String(userId),
    issuer: "ai-task-tracker",
    expiresIn: "15m",
  });
}

function verifyAppToken(token) {
  return jwt.verify(token, jwtSecret, {
    issuer: "ai-task-tracker",
  });
}

module.exports = {
  createAppToken,
  verifyAppToken,
};
