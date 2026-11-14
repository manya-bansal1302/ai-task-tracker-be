const crypto = require("node:crypto");
const googleOAuthClient = require("../config/googleOAuth");
const pool = require("../config/db");
const { createAppToken } = require("../config/jwt");
const {
  createRefreshToken,
  hashRefreshToken,
} = require("../utils/refreshToken");

function startGoogleAuth(req, res) {
  const state = crypto.randomBytes(32).toString("hex");
  req.session.oauthState = state;

  const googleUrl = googleOAuthClient.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
  });

  res.redirect(googleUrl);
}

async function finishGoogleSignIn(req, res) {
  try {
    const { code, state } = req.body;

    if (!code || !state) {
      return res.status(400).json({ message: "Missing code or state." });
    }

    if (!req.session.oauthState || state !== req.session.oauthState) {
      return res.status(400).json({ message: "Invalid OAuth state." });
    }

    // The state is one-time use.
    delete req.session.oauthState;

    // Exchange Google's temporary code for tokens.
    const { tokens } = await googleOAuthClient.getToken(code);

    if (!tokens.id_token) {
      return res
        .status(401)
        .json({ message: "Google did not return an ID token." });
    }

    // Verify the ID token and read the Google account profile.
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const googleUser = ticket.getPayload();

    if (
      !googleUser?.sub ||
      !googleUser.email ||
      googleUser.email_verified !== true
    ) {
      return res
        .status(401)
        .json({ message: "Could not verify your Google account." });
    }

    // Insert a new Google user or update the existing user's profile.
    await pool.execute(
      `INSERT INTO users (google_id, email, name, picture_url)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         email = ?, name = ?, picture_url = ?`,
      [
        googleUser.sub,
        googleUser.email,
        googleUser.name || null,
        googleUser.picture || null,
        googleUser.email,
        googleUser.name || null,
        googleUser.picture || null,
      ],
    );

    // Get your app's internal MySQL user ID.
    const [users] = await pool.execute(
      "SELECT id, email, name, picture_url FROM users WHERE google_id = ?",
      [googleUser.sub],
    );

    const user = users[0];

    if (!user) {
      return res
        .status(500)
        .json({ message: "Could not load your user account." });
    }

    // Create your app's JWT using the internal MySQL user ID.
    const { token: refreshToken, tokenHash, expiresAt } = createRefreshToken();

    await pool.execute(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
   VALUES (?, ?, ?)`,
      [user.id, tokenHash, expiresAt],
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expiresAt.getTime() - Date.now(),
      path: "/",
    });
    const token = createAppToken(user.id);

    // Send the JWT in a cookie the frontend JavaScript cannot read.
    res.cookie("accessToken", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });

    return res.status(200).json({
      message: "Sign-in successful.",
      user,
    });
  } catch (error) {
    console.error("Google sign-in failed:", error.message);
    return res.status(500).json({ message: "Google sign-in failed." });
  }
}
async function refreshAccessToken(req, res) {
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token is missing." });
  }

  let connection;
  let transactionStarted = false;

  try {
    const tokenHash = hashRefreshToken(refreshToken);

    connection = await pool.getConnection();
    await connection.beginTransaction();
    transactionStarted = true;

    // Find an active, unexpired token. FOR UPDATE locks this record
    // while we replace it, preventing two refreshes from using it at once.
    const [tokens] = await connection.execute(
      `SELECT id, user_id
       FROM refresh_tokens
       WHERE token_hash = ?
         AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [tokenHash],
    );

    if (tokens.length === 0) {
      await connection.rollback();
      transactionStarted = false;

      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      return res
        .status(401)
        .json({ message: "Refresh token is invalid or expired." });
    }

    const storedToken = tokens[0];

    const [users] = await connection.execute(
      "SELECT id, email, name, picture_url FROM users WHERE id = ?",
      [storedToken.user_id],
    );

    if (users.length === 0) {
      await connection.rollback();
      transactionStarted = false;
      return res.status(401).json({ message: "User account not found." });
    }

    // Revoke the old token and store a replacement.
    await connection.execute(
      `UPDATE refresh_tokens
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [storedToken.id],
    );

    const {
      token: newRefreshToken,
      tokenHash: newTokenHash,
      expiresAt,
    } = createRefreshToken();

    await connection.execute(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
      [storedToken.user_id, newTokenHash, expiresAt],
    );

    const newAccessToken = createAppToken(storedToken.user_id);

    await connection.commit();
    transactionStarted = false;

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: expiresAt.getTime() - Date.now(),
      path: "/",
    });

    return res.status(200).json({
      message: "Session renewed.",
      user: users[0],
    });
  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error("Token refresh failed:", error.message);
    return res.status(500).json({ message: "Could not renew the session." });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function getCurrentUser(req, res) {
  try {
    const [users] = await pool.execute(
      "SELECT id, email, name, picture_url FROM users WHERE id = ?",
      [req.userId],
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "User account not found." });
    }

    return res.status(200).json({ user: users[0] });
  } catch (error) {
    console.error("Could not get current user:", error.message);
    return res.status(500).json({ message: "Could not get current user." });
  }
}

async function logout(req, res) {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);

      await pool.execute(
        `UPDATE refresh_tokens
         SET revoked_at = CURRENT_TIMESTAMP
         WHERE token_hash = ? AND revoked_at IS NULL`,
        [tokenHash],
      );
    }

    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return res.status(200).json({ message: "Signed out successfully." });
  } catch (error) {
    console.error("Sign-out failed:", error.message);
    return res.status(500).json({ message: "Sign-out failed." });
  }
}
module.exports = {
  startGoogleAuth,
  finishGoogleSignIn,
  refreshAccessToken,
  getCurrentUser,
  logout,
};
