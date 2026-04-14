// src/middleware/errorHandler.js
// ─────────────────────────────────────────────────────────────────────────────
// Central error-handling middleware.
// Must be registered LAST in the Express app (after all routes).
//
// Handles:
//   - Mongoose CastError     → 400 (invalid ObjectId)
//   - Mongoose ValidationError → 422
//   - Mongoose duplicate key  → 409
//   - Generic errors          → 500
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

/**
 * Async wrapper — wraps a controller function so unhandled promise
 * rejections are forwarded to Express error handler instead of crashing.
 *
 * Usage:
 *   router.get("/", asyncHandler(myController))
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 404 middleware — register after all routes.
 */
const notFound = (req, res, _next) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

/**
 * Global error handler — register after notFound.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  // Log for server-side visibility
  if (process.env.NODE_ENV !== "test") {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
    if (process.env.NODE_ENV === "development") console.error(err.stack);
  }

  // ── Mongoose: invalid ObjectId ─────────────────────────────────────────────
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({
      success: false,
      message: `Invalid value for field "${err.path}": ${err.value}`,
    });
  }

  // ── Mongoose: document validation failed ──────────────────────────────────
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map((e) => ({
      field:   e.path,
      message: e.message,
    }));
    return res.status(422).json({
      success: false,
      message: "Data validation failed",
      errors:  messages,
    });
  }

  // ── MongoDB: duplicate key (code 11000) ────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({
      success: false,
      message: `Duplicate value for "${field}"`,
    });
  }

  // ── Generic / unexpected ───────────────────────────────────────────────────
  const status = err.statusCode || err.status || 500;
  return res.status(status).json({
    success: false,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = { asyncHandler, notFound, errorHandler };
