// src/controllers/pointsController.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure business logic — no Express req/res imports here.
// Each function is async and throws structured errors that the route
// layer catches and converts to HTTP responses.
// ─────────────────────────────────────────────────────────────────────────────

const SolarPoint = require("../models/SolarPoint");

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a standardised success envelope.
 */
const ok = (data, meta = {}) => ({ success: true, ...meta, data });

/**
 * Parse pagination query params with safe defaults.
 */
function parsePagination(query) {
  const page  = Math.max(1, parseInt(query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 60));
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * GET /points
 * ──────────────────────────────────────────────────────────────────────────
 * Returns all solar points with optional filtering and pagination.
 *
 * Query params:
 *   type        → filter by location_type (residential | road | empty_land)
 *   minSolar    → minimum solar_radiation value
 *   maxGrid     → maximum distance_to_grid value
 *   page        → page number (default 1)
 *   limit       → results per page (default 60, max 100)
 *   sortBy      → field to sort (default: score)
 *   order       → asc | desc (default: desc)
 */
async function getAllPoints(req, res) {
  const { type, minSolar, maxGrid, sortBy = "score", order = "desc" } = req.query;
  const { page, limit, skip } = parsePagination(req.query);

  // Build filter
  const filter = {};
  if (type)     filter.location_type = type;
  if (minSolar) filter.solar_radiation  = { $gte: parseFloat(minSolar) };
  if (maxGrid)  filter.distance_to_grid = { $lte: parseFloat(maxGrid) };

  // Build sort
  const allowedSort = ["score", "solar_radiation", "distance_to_grid", "available_area", "createdAt"];
  const sortField = allowedSort.includes(sortBy) ? sortBy : "score";
  const sortOrder = order === "asc" ? 1 : -1;

  const [points, total] = await Promise.all([
    SolarPoint.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
    SolarPoint.countDocuments(filter),
  ]);

  return res.status(200).json(
    ok(points, {
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * GET /points/:id
 * ──────────────────────────────────────────────────────────────────────────
 * Returns a single solar point by MongoDB ObjectId.
 */
async function getPointById(req, res) {
  const point = await SolarPoint.findById(req.params.id).lean();

  if (!point) {
    return res.status(404).json({ success: false, message: "Point not found" });
  }

  return res.status(200).json(ok(point));
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * POST /points
 * ──────────────────────────────────────────────────────────────────────────
 * Creates a single new solar point.
 * Score is computed automatically in the pre-save hook.
 *
 * Body (JSON):
 *   {
 *     latitude:         number   (required)
 *     longitude:        number   (required)
 *     solar_radiation:  number   (required)  kWh/m²/day
 *     distance_to_grid: number   (required)  km
 *     location_type:    string   (required)  residential|road|empty_land
 *     available_area:   number   (required)  m²
 *     metadata:         object   (optional)
 *   }
 */
async function createPoint(req, res) {
  const {
    latitude,
    longitude,
    solar_radiation,
    distance_to_grid,
    location_type,
    available_area,
    metadata,
  } = req.body;

  const point = await SolarPoint.create({
    coordinates: {
      type: "Point",
      coordinates: [longitude, latitude],   // GeoJSON: lng first
    },
    solar_radiation,
    distance_to_grid,
    location_type,
    available_area,
    ...(metadata && { metadata }),
  });

  return res.status(201).json(ok(point, { message: "Point created successfully" }));
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * POST /points/bulk
 * ──────────────────────────────────────────────────────────────────────────
 * Inserts multiple points in one request (used by the seed script
 * and by the front-end "import" feature).
 *
 * Body: { points: [...] }   (array of same shape as POST /points)
 */
async function createManyPoints(req, res) {
  const { points } = req.body;

  if (!Array.isArray(points) || points.length === 0) {
    return res.status(400).json({ success: false, message: "points array is required" });
  }

  if (points.length > 500) {
    return res.status(400).json({ success: false, message: "Maximum 500 points per bulk request" });
  }

  // Map to schema shape; score is computed in pre-save
  const docs = points.map(({ latitude, longitude, ...rest }) => ({
    coordinates: { type: "Point", coordinates: [longitude, latitude] },
    ...rest,
  }));

  // insertMany bypasses pre-save hooks — use create() for auto-scoring
  const created = await SolarPoint.create(docs);

  return res.status(201).json(
    ok(created, { message: `${created.length} points created` })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * PUT /points/:id
 * ──────────────────────────────────────────────────────────────────────────
 * Full or partial update of a solar point.
 * Score is recomputed if any scoring field is changed.
 */
async function updatePoint(req, res) {
  const { latitude, longitude, ...rest } = req.body;

  const update = { ...rest };
  if (latitude !== undefined && longitude !== undefined) {
    update.coordinates = { type: "Point", coordinates: [longitude, latitude] };
  }

  // findById → modify → save ensures the pre-save hook runs
  const point = await SolarPoint.findById(req.params.id);
  if (!point) {
    return res.status(404).json({ success: false, message: "Point not found" });
  }

  Object.assign(point, update);
  await point.save();

  return res.status(200).json(ok(point, { message: "Point updated" }));
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * DELETE /points/:id
 * ──────────────────────────────────────────────────────────────────────────
 * Permanently deletes a solar point.
 */
async function deletePoint(req, res) {
  const point = await SolarPoint.findByIdAndDelete(req.params.id);
  if (!point) {
    return res.status(404).json({ success: false, message: "Point not found" });
  }
  return res.status(200).json({ success: true, message: "Point deleted", id: req.params.id });
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * GET /points/best
 * ──────────────────────────────────────────────────────────────────────────
 * Returns the top-scoring solar sites with optional filters.
 *
 * Query params:
 *   limit     → number of results (default 10, max 50)
 *   type      → filter by location_type
 *   minScore  → minimum score threshold
 *
 * Response also includes:
 *   - summary statistics for the result set
 *   - rank field (1-based position)
 */
async function getBestPoints(req, res) {
  const limit    = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const type     = req.query.type;
  const minScore = req.query.minScore ? parseFloat(req.query.minScore) : undefined;

  const points = await SolarPoint.getBestSites({ limit, type, minScore });

  if (points.length === 0) {
    return res.status(200).json(ok([], { message: "No points match the criteria" }));
  }

  // Add rank to each result
  const ranked = points.map((p, i) => ({ ...p, rank: i + 1 }));

  // Compute summary statistics
  const scores   = ranked.map((p) => p.score);
  const solars   = ranked.map((p) => p.solar_radiation);
  const summary  = {
    count:       ranked.length,
    avgScore:    +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
    maxScore:    Math.max(...scores),
    avgSolar:    +(solars.reduce((a, b) => a + b, 0) / solars.length).toFixed(3),
    typeBreakdown: ranked.reduce((acc, p) => {
      acc[p.location_type] = (acc[p.location_type] || 0) + 1;
      return acc;
    }, {}),
  };

  return res.status(200).json(ok(ranked, { summary }));
}

// ─────────────────────────────────────────────────────────────────────────────
/**
 * GET /points/stats
 * ──────────────────────────────────────────────────────────────────────────
 * Returns aggregate statistics across all stored points.
 * Useful for the front-end dashboard header.
 */
async function getStats(req, res) {
  const [agg, typeAgg, total] = await Promise.all([
    SolarPoint.aggregate([
      {
        $group: {
          _id: null,
          avgSolar:    { $avg: "$solar_radiation" },
          maxSolar:    { $max: "$solar_radiation" },
          minSolar:    { $min: "$solar_radiation" },
          avgGrid:     { $avg: "$distance_to_grid" },
          avgArea:     { $avg: "$available_area" },
          avgScore:    { $avg: "$score" },
          maxScore:    { $max: "$score" },
        },
      },
    ]),
    SolarPoint.aggregate([
      { $group: { _id: "$location_type", count: { $sum: 1 }, avgScore: { $avg: "$score" } } },
      { $sort: { count: -1 } },
    ]),
    SolarPoint.countDocuments(),
  ]);

  const stats = agg[0] || {};

  return res.status(200).json(
    ok({
      total_points: total,
      solar_radiation: {
        avg: +stats.avgSolar?.toFixed(3),
        max: +stats.maxSolar?.toFixed(3),
        min: +stats.minSolar?.toFixed(3),
      },
      distance_to_grid: { avg: +stats.avgGrid?.toFixed(3) },
      available_area:   { avg: +stats.avgArea?.toFixed(1) },
      score:            { avg: +stats.avgScore?.toFixed(2), max: +stats.maxScore?.toFixed(2) },
      by_type: typeAgg.map((t) => ({
        type:     t._id,
        count:    t.count,
        avgScore: +t.avgScore.toFixed(2),
      })),
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  getAllPoints,
  getPointById,
  createPoint,
  createManyPoints,
  updatePoint,
  deletePoint,
  getBestPoints,
  getStats,
};
