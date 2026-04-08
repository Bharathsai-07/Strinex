const express = require("express");
const { analyzeRun } = require("../controllers/aiController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", requireAuth, analyzeRun);

module.exports = router;
