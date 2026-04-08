const Message = require("../models/Message");

async function getConversation(req, res, next) {
  try {
    const userId = req.auth.userId;
    const otherUserId = req.params.userId;
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    if (!otherUserId) {
      return res.status(400).json({ message: "other userId is required." });
    }

    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ],
    })
      .sort({ timestamp: 1 })
      .limit(limit)
      .lean();

    return res.json({ messages });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getConversation,
};
