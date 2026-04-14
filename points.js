// src/routes/points.js
// ─────────────────────────────────────────────────────────────────────────────
// Express router — maps HTTP verbs + paths to controller functions.
// Validation middleware runs before every controller.
//
// Endpoint summary:
//
//   GET    /api/points              → get all points (filterable, paginated)
//   POST   /api/points              → create one point
//   POST   /api/points/bulk         → create many points
//   GET    /api/points/best         → top-scored points
//   GET    /api/points/stats        → aggregate statistics
//   GET    /api/points/:id          → get one point by id
//   PUT    /api/points/:id          → update a point
//   DELETE /api/points/:id          → delete a point
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const router  = express.Router();

const ctrl = require("../controllers/pointsController");
const val  = require("../middleware/validation");
const { asyncHandler } = require("../middleware/errorHandler");

// ─── Static routes first (before :id) ────────────────────────────────────────

// GET /api/points/best
router.get(
  "/best",
  val.validateGetBest,
  asyncHandler(ctrl.getBestPoints)
);

// GET /api/points/stats
router.get(
  "/stats",
  asyncHandler(ctrl.getStats)
);

// POST /api/points/bulk
router.post(
  "/bulk",
  val.validateBulkCreate,
  asyncHandler(ctrl.createManyPoints)
);

// ─── Collection routes ────────────────────────────────────────────────────────

// GET  /api/points
router.get(
  "/",
  val.validateGetPoints,
  asyncHandler(ctrl.getAllPoints)
);

// POST /api/points
router.post(
  "/",
  val.validateCreatePoint,
  asyncHandler(ctrl.createPoint)
);

// ─── Resource routes (:id) ────────────────────────────────────────────────────

// GET /api/points/:id
router.get(
  "/:id",
  val.validateId,
  asyncHandler(ctrl.getPointById)
);

// PUT /api/points/:id
router.put(
  "/:id",
  val.validateUpdatePoint,
  asyncHandler(ctrl.updatePoint)
);

// DELETE /api/points/:id
router.delete(
  "/:id",
  val.validateId,
  asyncHandler(ctrl.deletePoint)
);

module.exports = router;
