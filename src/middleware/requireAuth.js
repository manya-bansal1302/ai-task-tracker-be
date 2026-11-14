const { verifyAppToken } = require("../config/jwt");

function requireAuth(req, res, next) {
  const token = req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({ message: "Please sign in first." });
  }

  try {
    const decoded = verifyAppToken(token);

    if (typeof decoded === "string" || !decoded.sub) {
      return res.status(401).json({ message: "Invalid token." });
    }

    req.userId = decoded.sub;
    next();
  } catch {
    return res.status(401).json({
      message: "Your sign-in has expired or is invalid. Please sign in again.",
    });
  }
}

module.exports = requireAuth;
