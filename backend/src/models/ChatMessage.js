const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    role: { type: String, required: true, enum: ["user", "ai"] },
    content: { type: String, required: true, trim: true, maxlength: 10000 },
    runData: {
      distance: { type: Number, default: null },
      duration: { type: Number, default: null },
      pace: { type: Number, default: null },
      calories: { type: Number, default: null },
    },
    sessionId: { type: String, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

chatMessageSchema.index({ userId: 1, createdAt: -1 });
chatMessageSchema.index({ userId: 1, sessionId: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
