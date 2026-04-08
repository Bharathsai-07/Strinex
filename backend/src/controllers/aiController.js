const UserStats = require("../models/UserStats");
const { generateRunAnalysis } = require("../services/aiService");

async function analyzeRun(req, res, next) {
  try {
    const userId = req.auth.userId;
    const distance = Number(req.body.distance);
    const duration = Number(req.body.duration);
    const pace = Number(req.body.pace);

    if (!Number.isFinite(distance) || !Number.isFinite(duration) || !Number.isFinite(pace)) {
      return res.status(400).json({
        message: "Invalid payload. Expected numeric distance, duration, and pace.",
      });
    }

    const stats = await UserStats.findOne({ userId }).lean();
    const streak = {
      currentStreak: stats?.currentStreak || 0,
      longestStreak: stats?.longestStreak || 0,
    };

    const suggestions = await generateRunAnalysis({
      distance,
      duration,
      pace,
      streak,
    });

    return res.json({ suggestions, streak });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  analyzeRun,
};
