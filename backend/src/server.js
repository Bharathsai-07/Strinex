require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const app = require("./app");
const connectDB = require("./config/db");
const registerChatSocket = require("./socket/chatSocket");

const port = Number(process.env.PORT) || 5000;

function normalizeOrigin(origin) {
  return String(origin || "").trim().replace(/\/+$/, "");
}

const allowedOrigins = (process.env.CORS_ORIGINS || "https://strinex.onrender.com,https://strinex-07.onrender.com,http://localhost:3000,http://127.0.0.1:3000")
  .split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const fallbackOrigins = [
  "https://strinex.onrender.com",
  "https://strinex-07.onrender.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].map((origin) => normalizeOrigin(origin));

const allowOriginSet = new Set([...allowedOrigins, ...fallbackOrigins]);

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
        const normalizedOrigin = normalizeOrigin(origin);
        if (!origin || allowOriginSet.has(normalizedOrigin) || isLoopbackOrigin(normalizedOrigin)) {
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
