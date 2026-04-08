const express = require("express");

const runRoutes = require("./runRoutes");
const leaderboardRoutes = require("./leaderboardRoutes");
const aiRoutes = require("./aiRoutes");
const chatRoutes = require("./chatRoutes");

const router = express.Router();

router.use("/runs", runRoutes);
router.use("/leaderboard", leaderboardRoutes);
router.use("/ai-analysis", aiRoutes);
router.use("/chat", chatRoutes);

module.exports = router;
