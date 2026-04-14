// src/server.js
// ─────────────────────────────────────────────────────────────────────────────
// Entry point — connects to MongoDB then starts the HTTP server.
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();

const app       = require("./app");
const connectDB = require("./config/database");

const PORT = parseInt(process.env.PORT) || 5000;

(async () => {
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log("─────────────────────────────────────────────");
    console.log(`🚀  Solar API running on http://localhost:${PORT}`);
    console.log(`📋  Environment : ${process.env.NODE_ENV || "development"}`);
    console.log(`📖  API info    : GET http://localhost:${PORT}/`);
    console.log(`❤️   Health      : GET http://localhost:${PORT}/health`);
    console.log("─────────────────────────────────────────────");
  });

  // Handle unhandled promise rejections
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err.message);
    server.close(() => process.exit(1));
  });
})();
