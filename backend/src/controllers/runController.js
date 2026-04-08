const Run = require("../models/Run");
const { updateUserStreak, recalculateUserStreak } = require("../services/streakService");

function parsePaceToMinPerKm(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;

  const mmss = value.match(/^(\d+):(\d{1,2})$/);
  if (!mmss) return Number(value);

  const min = Number(mmss[1]);
  const sec = Number(mmss[2]);
  return min + sec / 60;
}

function normalizeCoordinates(coords) {
  if (!Array.isArray(coords)) return [];

  return coords
    .map((point) => {
      if (Array.isArray(point) && point.length >= 2) {
        return { lat: Number(point[0]), lng: Number(point[1]) };
      }
      return {
        lat: Number(point.lat),
        lng: Number(point.lng),
      };
    })
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

async function createRun(req, res, next) {
  try {
    const userId = req.auth.userId;
    const userName = String(req.body.userName || "Runner").trim().slice(0, 80) || "Runner";
    const distance = Number(req.body.distance);
    const duration = Number(req.body.duration);
    const pace = parsePaceToMinPerKm(req.body.pace);
    const routeCoordinates = normalizeCoordinates(req.body.routeCoordinates || req.body.route || []);
    const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

    const hasValidData =
      Number.isFinite(distance) &&
      Number.isFinite(duration) &&
      Number.isFinite(pace) &&
      distance > 0 &&
      duration > 0 &&
      pace > 0 &&
      routeCoordinates.length >= 2 &&
      !Number.isNaN(timestamp.getTime());

    if (!hasValidData) {
      return res.status(400).json({
        message:
          "Invalid run payload. Required: distance, duration, pace, and routeCoordinates with at least two GPS points.",
      });
    }

    const run = await Run.create({
      userId,
      userName,
      distance,
      duration,
      pace,
      routeCoordinates,
      timestamp,
      isValidated: true,
    });

    const streak = await updateUserStreak(userId, timestamp);

    return res.status(201).json({
      run,
      streak: {
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getRuns(req, res, next) {
  try {
    const userId = req.auth.userId;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const runs = await Run.find({ userId }).sort({ timestamp: -1 }).limit(limit).lean();

    return res.json({ runs });
  } catch (error) {
    return next(error);
  }
}

async function deleteRun(req, res, next) {
  try {
    const userId = req.auth.userId;
    const runId = req.params.id;

    const deleted = await Run.deleteOne({ _id: runId, userId });
    if (!deleted.deletedCount) {
      return res.status(404).json({ message: "Run not found." });
    }

    const streak = await recalculateUserStreak(userId);

    return res.json({
      message: "Run deleted.",
      streak: {
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function clearRuns(req, res, next) {
  try {
    const userId = req.auth.userId;

    await Run.deleteMany({ userId });
    const streak = await recalculateUserStreak(userId);

    return res.json({
      message: "All runs cleared.",
      streak: {
        currentStreak: streak.currentStreak,
        longestStreak: streak.longestStreak,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createRun,
  getRuns,
  deleteRun,
  clearRuns,
};
