const express = require("express");
const { analyzeRun, getChatHistory, clearChatHistory } = require("../controllers/aiController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// POST /ai-analysis — send prompt, get AI response (saved to MongoDB)
router.post("/", requireAuth, analyzeRun);

// GET /ai-analysis/history — fetch chat history for the authenticated user
router.get("/history", requireAuth, getChatHistory);

// DELETE /ai-analysis/history — clear all chat history for the authenticated user
router.delete("/history", requireAuth, clearChatHistory);

module.exports = router;
