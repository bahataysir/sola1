// src/app.js
// ─────────────────────────────────────────────────────────────────────────────
// Express application factory.
// Separated from server.js so it can be imported cleanly in tests
// without binding to a port.
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");
const morgan  = require("morgan");

const pointsRouter          = require("./routes/points");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── CORS ──────────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin "${origin}" not allowed`));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ── HTTP request logging ──────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.status(200).json({
    status:      "ok",
    environment: process.env.NODE_ENV,
    timestamp:   new Date().toISOString(),
    uptime:      `${Math.floor(process.uptime())}s`,
  });
});

// ── API info ──────────────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.status(200).json({
    name:    "Solar Sites API",
    version: "1.0.0",
    docs:    "See README.md for endpoint documentation",
    endpoints: {
      "GET  /api/points":         "List all points (filterable, paginated)",
      "POST /api/points":         "Create a point",
      "POST /api/points/bulk":    "Create multiple points",
      "GET  /api/points/best":    "Top-scored points",
      "GET  /api/points/stats":   "Aggregate statistics",
      "GET  /api/points/:id":     "Get a single point",
      "PUT  /api/points/:id":     "Update a point",
      "DELETE /api/points/:id":   "Delete a point",
    },
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/points", pointsRouter);

// ── 404 + Error handlers (must be last) ──────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
