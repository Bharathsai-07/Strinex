const UserStats = require("../models/UserStats");
const Run = require("../models/Run");
const { dayKeyUTC, subtractDaysUTC } = require("../utils/date");

async function updateUserStreak(userId, timestamp = new Date()) {
  const runDay = dayKeyUTC(timestamp);
  const yesterday = subtractDaysUTC(runDay, 1);

  let stats = await UserStats.findOne({ userId });
  if (!stats) {
    stats = await UserStats.create({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastRunDay: runDay,
    });
    return stats;
  }

  if (stats.lastRunDay === runDay) {
    return stats;
  }

  if (stats.lastRunDay === yesterday) {
    stats.currentStreak += 1;
  } else {
    stats.currentStreak = 1;
  }

  if (stats.currentStreak > stats.longestStreak) {
    stats.longestStreak = stats.currentStreak;
  }

  stats.lastRunDay = runDay;
  await stats.save();

  return stats;
}

async function recalculateUserStreak(userId) {
  const runs = await Run.find({ userId }).sort({ timestamp: 1 }).lean();
  const daySet = new Set(runs.map((run) => dayKeyUTC(run.timestamp || run.createdAt || new Date())));

  const sortedDays = [...daySet].sort();

  let longestStreak = 0;
  let currentChain = 0;
  let previousDay = null;

  sortedDays.forEach((day) => {
    if (!previousDay || subtractDaysUTC(day, 1) === previousDay) {
      currentChain += 1;
    } else {
      currentChain = 1;
    }

    if (currentChain > longestStreak) {
      longestStreak = currentChain;
    }

    previousDay = day;
  });

  let currentStreak = 0;
  let cursor = dayKeyUTC(new Date());
  while (daySet.has(cursor)) {
    currentStreak += 1;
    cursor = subtractDaysUTC(cursor, 1);
  }

  let stats = await UserStats.findOne({ userId });
  if (!stats) {
    stats = await UserStats.create({
      userId,
      currentStreak,
      longestStreak,
      lastRunDay: currentStreak > 0 ? dayKeyUTC(new Date()) : null,
    });
    return stats;
  }

  stats.currentStreak = currentStreak;
  stats.longestStreak = Math.max(stats.longestStreak || 0, longestStreak);
  stats.lastRunDay = currentStreak > 0 ? dayKeyUTC(new Date()) : stats.lastRunDay;
  await stats.save();
  return stats;
}

module.exports = {
  updateUserStreak,
  recalculateUserStreak,
};
