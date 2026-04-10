const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const runRoutes = require("./routes/runRoutes");
const leaderboardRoutes = require("./routes/leaderboardRoutes");
const aiRoutes = require("./routes/aiRoutes");
const chatRoutes = require("./routes/chatRoutes");
const { notFound, errorHandler } = require("./middleware/errorMiddleware");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "https://strinex.onrender.com,http://localhost:3000,http://127.0.0.1:3000")
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

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || isLoopbackOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS blocked for this origin."));
    },
    credentials: true,
  })
);

app.use(helmet());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "strinex-backend" });
});

app.use("/runs", runRoutes);
app.use("/leaderboard", leaderboardRoutes);
app.use("/ai-analysis", aiRoutes);
app.use("/chat", chatRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
