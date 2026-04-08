const { verifyToken } = require("@clerk/backend");
const Message = require("../models/Message");

function extractSocketToken(socket) {
  const authHeader = socket.handshake.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === "string" && authToken.trim()) {
    return authToken.trim();
  }

  return null;
}

function registerChatSocket(io) {
  io.use(async (socket, next) => {
    try {
      const token = extractSocketToken(socket);
      if (!token) {
        return next(new Error("Unauthorized: missing token"));
      }

      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      if (!payload?.sub) {
        return next(new Error("Unauthorized: invalid token"));
      }

      socket.userId = payload.sub;
      return next();
    } catch (error) {
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(socket.userId);

    socket.on("chat:send", async (payload, ack) => {
      try {
        const receiverId = String(payload?.receiverId || "").trim();
        const content = String(payload?.content || "").trim();

        if (!receiverId || !content) {
          if (typeof ack === "function") ack({ ok: false, message: "receiverId and content are required." });
          return;
        }

        const message = await Message.create({
          senderId: socket.userId,
          receiverId,
          content,
          timestamp: new Date(),
        });

        const eventPayload = {
          _id: message._id,
          senderId: message.senderId,
          receiverId: message.receiverId,
          content: message.content,
          timestamp: message.timestamp,
        };

        io.to(receiverId).emit("chat:message", eventPayload);
        io.to(socket.userId).emit("chat:message", eventPayload);

        if (typeof ack === "function") ack({ ok: true, message: eventPayload });
      } catch (error) {
        if (typeof ack === "function") ack({ ok: false, message: "Failed to send message." });
      }
    });
  });
}

module.exports = registerChatSocket;
