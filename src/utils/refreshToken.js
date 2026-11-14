const crypto = require("node:crypto");

const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function createRefreshToken() {
  // The original token will be sent to the browser in a cookie.
  const token = crypto.randomBytes(64).toString("hex");

  // MySQL will store this hash, not the original token.
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS);

  return { token, tokenHash, expiresAt };
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  createRefreshToken,
  hashRefreshToken,
};
