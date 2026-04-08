const express = require("express");
const { getConversation } = require("../controllers/chatController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/messages/:userId", requireAuth, getConversation);

module.exports = router;
