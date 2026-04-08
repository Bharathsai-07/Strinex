const Run = require("../models/Run");
const UserStats = require("../models/UserStats");
const { startOfCurrentWeekUTC } = require("../utils/date");

async function getLeaderboard(req, res, next) {
  try {
    const period = (req.query.period || "total").toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const match = {};
    if (period === "weekly") {
      match.timestamp = { $gte: startOfCurrentWeekUTC() };
    }

    const aggregated = await Run.aggregate([
      { $match: match },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$userId",
          userName: { $first: "$userName" },
          distance: { $sum: "$distance" },
          runCount: { $sum: 1 },
          latestRun: { $max: "$timestamp" },
        },
      },
      { $sort: { distance: -1, latestRun: 1 } },
      { $limit: limit },
    ]);

    const userIds = aggregated.map((entry) => entry._id);
    const stats = await UserStats.find({ userId: { $in: userIds } }).lean();
    const statsById = new Map(stats.map((entry) => [entry.userId, entry]));

    const leaderboard = aggregated.map((entry, index) => {
      const streak = statsById.get(entry._id);
      return {
        rank: index + 1,
        userId: entry._id,
        userName: entry.userName || "Runner",
        distance: Number(entry.distance.toFixed(2)),
        runCount: entry.runCount,
        currentStreak: streak?.currentStreak || 0,
        longestStreak: streak?.longestStreak || 0,
      };
    });

    return res.json({ period, leaderboard });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getLeaderboard,
};
