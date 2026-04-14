// src/middleware/validation.js
// ─────────────────────────────────────────────────────────────────────────────
// Request validation rules using express-validator.
// Each exported array is a middleware chain:  [...rules, handleValidation]
// ─────────────────────────────────────────────────────────────────────────────

const { body, query, param, validationResult } = require("express-validator");

const LOCATION_TYPES = ["residential", "road", "empty_land"];

// ── Shared handler ────────────────────────────────────────────────────────────
/**
 * Must be the LAST item in every validation chain.
 * If any rule failed, returns 422 with a clean error list.
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map(({ path, msg, value }) => ({ field: path, message: msg, received: value })),
    });
  }
  next();
};

// ── Reusable field rules ──────────────────────────────────────────────────────
const latRule = () =>
  body("latitude")
    .isFloat({ min: -90, max: 90 })
    .withMessage("latitude must be a number between -90 and 90");

const lngRule = () =>
  body("longitude")
    .isFloat({ min: -180, max: 180 })
    .withMessage("longitude must be a number between -180 and 180");

const solarRule = (optional = false) => {
  const r = optional
    ? body("solar_radiation").optional()
    : body("solar_radiation");
  return r
    .isFloat({ min: 0, max: 20 })
    .withMessage("solar_radiation must be between 0 and 20 kWh/m²/day");
};

const gridRule = (optional = false) => {
  const r = optional
    ? body("distance_to_grid").optional()
    : body("distance_to_grid");
  return r
    .isFloat({ min: 0 })
    .withMessage("distance_to_grid must be a non-negative number (km)");
};

const typeRule = (optional = false) => {
  const r = optional
    ? body("location_type").optional()
    : body("location_type");
  return r
    .isIn(LOCATION_TYPES)
    .withMessage(`location_type must be one of: ${LOCATION_TYPES.join(", ")}`);
};

const areaRule = (optional = false) => {
  const r = optional
    ? body("available_area").optional()
    : body("available_area");
  return r
    .isFloat({ min: 0 })
    .withMessage("available_area must be a non-negative number (m²)");
};

// ── Exported validation chains ────────────────────────────────────────────────

/** POST /points — all fields required */
const validateCreatePoint = [
  latRule(),
  lngRule(),
  solarRule(),
  gridRule(),
  typeRule(),
  areaRule(),
  body("metadata.label").optional().isString().isLength({ max: 120 }),
  body("metadata.source").optional().isString().isLength({ max: 80 }),
  body("metadata.notes").optional().isString().isLength({ max: 500 }),
  handleValidation,
];

/** PUT /points/:id — all fields optional but validated if present */
const validateUpdatePoint = [
  param("id").isMongoId().withMessage("id must be a valid MongoDB ObjectId"),
  body("latitude").optional().isFloat({ min: -90, max: 90 })
    .withMessage("latitude must be between -90 and 90"),
  body("longitude").optional().isFloat({ min: -180, max: 180 })
    .withMessage("longitude must be between -180 and 180"),
  solarRule(true),
  gridRule(true),
  typeRule(true),
  areaRule(true),
  body("metadata.label").optional().isString().isLength({ max: 120 }),
  handleValidation,
];

/** GET /points — optional query params */
const validateGetPoints = [
  query("type").optional().isIn(LOCATION_TYPES)
    .withMessage(`type must be one of: ${LOCATION_TYPES.join(", ")}`),
  query("minSolar").optional().isFloat({ min: 0 })
    .withMessage("minSolar must be a non-negative number"),
  query("maxGrid").optional().isFloat({ min: 0 })
    .withMessage("maxGrid must be a non-negative number"),
  query("page").optional().isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit").optional().isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("sortBy").optional().isIn(["score", "solar_radiation", "distance_to_grid", "available_area", "createdAt"])
    .withMessage("sortBy must be a valid field name"),
  query("order").optional().isIn(["asc", "desc"])
    .withMessage("order must be asc or desc"),
  handleValidation,
];

/** GET /points/best — optional query params */
const validateGetBest = [
  query("limit").optional().isInt({ min: 1, max: 50 })
    .withMessage("limit must be between 1 and 50"),
  query("type").optional().isIn(LOCATION_TYPES)
    .withMessage(`type must be one of: ${LOCATION_TYPES.join(", ")}`),
  query("minScore").optional().isFloat()
    .withMessage("minScore must be a number"),
  handleValidation,
];

/** DELETE / GET /points/:id */
const validateId = [
  param("id").isMongoId().withMessage("id must be a valid MongoDB ObjectId"),
  handleValidation,
];

/** POST /points/bulk */
const validateBulkCreate = [
  body("points").isArray({ min: 1, max: 500 })
    .withMessage("points must be a non-empty array with at most 500 items"),
  body("points.*.latitude").isFloat({ min: -90, max: 90 })
    .withMessage("Each latitude must be between -90 and 90"),
  body("points.*.longitude").isFloat({ min: -180, max: 180 })
    .withMessage("Each longitude must be between -180 and 180"),
  body("points.*.solar_radiation").isFloat({ min: 0, max: 20 })
    .withMessage("Each solar_radiation must be between 0 and 20"),
  body("points.*.distance_to_grid").isFloat({ min: 0 })
    .withMessage("Each distance_to_grid must be non-negative"),
  body("points.*.location_type").isIn(LOCATION_TYPES)
    .withMessage(`Each location_type must be one of: ${LOCATION_TYPES.join(", ")}`),
  body("points.*.available_area").isFloat({ min: 0 })
    .withMessage("Each available_area must be non-negative"),
  handleValidation,
];

module.exports = {
  validateCreatePoint,
  validateUpdatePoint,
  validateGetPoints,
  validateGetBest,
  validateId,
  validateBulkCreate,
};
