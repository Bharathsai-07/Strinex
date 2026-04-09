require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const connectDB = require("./config/db");
const registerChatSocket = require("./socket/chatSocket");

const port = Number(process.env.PORT) || 5000;

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isLoopbackOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

async function startServer() {
  await connectDB();

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || isLoopbackOrigin(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("CORS blocked for this origin."));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  registerChatSocket(io);

  server.listen(port, () => {
    console.log(`[server] Strinex backend running on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error("[server] Failed to start:", error.message);
  process.exit(1);
});
