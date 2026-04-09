const UserStats = require("../models/UserStats");
const ChatMessage = require("../models/ChatMessage");
const { generateRunAnalysis } = require("../services/aiService");

/**
 * POST /ai-analysis
 * Accepts user prompt + run data, calls Gemini, saves both messages to MongoDB,
 * and returns the AI response.
 */
async function analyzeRun(req, res, next) {
  try {
    const userId = req.auth.userId;
    console.log(`[ai-analysis] ✅ POST /ai-analysis received from user: ${userId}`);

    const distance = Number(req.body.distance);
    const duration = Number(req.body.duration);
    const pace = Number(req.body.pace);
    const userPrompt = typeof req.body.userPrompt === "string" ? req.body.userPrompt.trim() : "";
    const systemInstruction = typeof req.body.systemInstruction === "string"
      ? req.body.systemInstruction.trim()
      : "";
    const runContext = req.body.runContext && typeof req.body.runContext === "object"
      ? req.body.runContext
      : {};
    const sessionId = typeof req.body.sessionId === "string"
      ? req.body.sessionId.trim()
      : `session_${Date.now()}`;

    console.log(`[ai-analysis]   → distance=${distance}, duration=${duration}, pace=${pace}`);
    console.log(`[ai-analysis]   → prompt: "${userPrompt.substring(0, 80)}..."`);
    console.log(`[ai-analysis]   → sessionId: ${sessionId}`);

    if (!Number.isFinite(distance) || !Number.isFinite(duration) || !Number.isFinite(pace)) {
      console.log(`[ai-analysis] ❌ Invalid payload — returning 400`);
      return res.status(400).json({
        message: "Invalid payload. Expected numeric distance, duration, and pace.",
      });
    }

    // Save user message to MongoDB
    const userMessage = await ChatMessage.create({
      userId,
      role: "user",
      content: userPrompt || "Run analysis request",
      runData: {
        distance,
        duration,
        pace,
        calories: runContext.calories != null ? Number(runContext.calories) : null,
      },
      sessionId,
    });
    console.log(`[ai-analysis]   → User message saved to MongoDB: ${userMessage._id}`);

    const stats = await UserStats.findOne({ userId }).lean();
    const streak = {
      currentStreak: stats?.currentStreak || 0,
      longestStreak: stats?.longestStreak || 0,
    };

    console.log(`[ai-analysis]   → Calling Gemini AI...`);
    const suggestions = await generateRunAnalysis({
      distance,
      duration,
      pace,
      streak,
      userPrompt,
      systemInstruction,
      runContext,
    });
    console.log(`[ai-analysis]   → Gemini response received (${suggestions.length} chars)`);
    console.log(`[ai-analysis]   → Response preview: "${suggestions.substring(0, 100)}..."`);

    // Save AI response to MongoDB
    const aiMessage = await ChatMessage.create({
      userId,
      role: "ai",
      content: suggestions,
      runData: {
        distance,
        duration,
        pace,
        calories: runContext.calories != null ? Number(runContext.calories) : null,
      },
      sessionId,
    });
    console.log(`[ai-analysis]   → AI response saved to MongoDB: ${aiMessage._id}`);
    console.log(`[ai-analysis] ✅ Sending response back to frontend`);

    return res.json({
      suggestions,
      streak,
      userMessageId: userMessage._id,
      aiMessageId: aiMessage._id,
      sessionId,
    });
  } catch (error) {
    console.error(`[ai-analysis] ❌ Error:`, error.message);
    return next(error);
  }
}

/**
 * GET /ai-analysis/history
 * Returns the chat history for the authenticated user.
 * Query params: ?limit=50&sessionId=xxx
 */
async function getChatHistory(req, res, next) {
  try {
    const userId = req.auth.userId;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const sessionId = req.query.sessionId;

    const query = { userId };
    if (sessionId) {
      query.sessionId = sessionId;
    }

    const messages = await ChatMessage.find(query)
      .sort({ createdAt: 1 })
      .limit(limit)
      .lean();

    return res.json({ messages });
  } catch (error) {
    return next(error);
  }
}

/**
 * DELETE /ai-analysis/history
 * Clears all AI chat history for the authenticated user.
 */
async function clearChatHistory(req, res, next) {
  try {
    const userId = req.auth.userId;
    const result = await ChatMessage.deleteMany({ userId });
    return res.json({ deleted: result.deletedCount });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  analyzeRun,
  getChatHistory,
  clearChatHistory,
};
