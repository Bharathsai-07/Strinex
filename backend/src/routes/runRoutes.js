const express = require("express");
const { createRun, getRuns, deleteRun, clearRuns } = require("../controllers/runController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/", requireAuth, createRun);
router.get("/", requireAuth, getRuns);
router.delete("/", requireAuth, clearRuns);
router.delete("/:id", requireAuth, deleteRun);

module.exports = router;
