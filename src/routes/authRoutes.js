const express = require("express");
const {
  startGoogleAuth,
  finishGoogleSignIn,
  refreshAccessToken,
  getCurrentUser,
  logout,
} = require("../controllers/authController");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();

router.get("/google", startGoogleAuth);
router.post("/signin", finishGoogleSignIn);
router.post("/refresh", refreshAccessToken);
router.get("/me", requireAuth, getCurrentUser);
router.post("/logout", logout);

module.exports = router;
