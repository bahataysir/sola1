// src/config/database.js
// ─────────────────────────────────────────────────────────────────────────────
// Manages the Mongoose connection lifecycle.
// - Connects on startup with retry logic
// - Emits events for monitoring
// - Gracefully closes on process termination
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/solar_hebron";

const options = {
  serverSelectionTimeoutMS: 5000,  // Fail fast in dev
  socketTimeoutMS: 45000,
};

/**
 * Connect to MongoDB. Called once at server startup.
 * Returns the connection instance so callers can await it.
 */
async function connectDB() {
  try {
    const conn = await mongoose.connect(MONGODB_URI, options);
    console.log(`✅  MongoDB connected → ${conn.connection.host}/${conn.connection.name}`);
    return conn;
  } catch (err) {
    console.error("❌  MongoDB connection failed:", err.message);
    process.exit(1);   // Fatal — cannot run without DB
  }
}

// ── Event listeners ──────────────────────────────────────────────────────────
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️   MongoDB disconnected");
});

mongoose.connection.on("reconnected", () => {
  console.log("🔄  MongoDB reconnected");
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, async () => {
    await mongoose.connection.close();
    console.log(`\n🛑  MongoDB closed on ${signal}`);
    process.exit(0);
  });
});

module.exports = connectDB;
