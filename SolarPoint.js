// src/models/SolarPoint.js
// ─────────────────────────────────────────────────────────────────────────────
// Mongoose schema and model for a Solar Site Point.
//
// Fields:
//   coordinates     → GeoJSON Point (lng, lat) — enables $near queries later
//   solar_radiation → kWh/m²/day measured or estimated at the site
//   distance_to_grid → km to nearest electricity grid connection
//   location_type   → enum: residential | road | empty_land
//   available_area  → m² of usable surface for panels
//   score           → computed quality score (higher = better candidate)
//   metadata        → optional free-form notes / source label
//
// Virtual:
//   latitude / longitude → friendly accessors on top of GeoJSON coordinates
//
// Pre-save hook:
//   Automatically recalculates `score` whenever the document changes.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

// ── Scoring weights (read from env, fall back to defaults) ────────────────────
const W_SOLAR = parseFloat(process.env.WEIGHT_SOLAR) || 20;   // per kWh unit
const W_GRID  = parseFloat(process.env.WEIGHT_GRID)  || 5;    // penalty per km
const W_AREA  = parseFloat(process.env.WEIGHT_AREA)  || 2;    // per 100 m²

// Bonus points by location type
const TYPE_BONUS = {
  empty_land:  15,
  residential: 5,
  road:        0,
};

/**
 * Compute a numeric score for a solar site.
 *
 * Formula:
 *   score = (solar_radiation × W_SOLAR)
 *         - (distance_to_grid × W_GRID)
 *         + (available_area / 100 × W_AREA)
 *         + TYPE_BONUS[location_type]
 *
 * Range is unbounded but practically 0–200.
 * Higher is better.
 */
function computeScore({ solar_radiation, distance_to_grid, available_area, location_type }) {
  const base =
    solar_radiation * W_SOLAR -
    distance_to_grid * W_GRID +
    (available_area / 100) * W_AREA +
    (TYPE_BONUS[location_type] ?? 0);

  return parseFloat(base.toFixed(2));
}

// ── Schema definition ─────────────────────────────────────────────────────────
const SolarPointSchema = new mongoose.Schema(
  {
    // GeoJSON Point — lng first (GeoJSON spec)
    coordinates: {
      type: {
        type: String,
        enum: ["Point"],
        required: true,
        default: "Point",
      },
      coordinates: {
        type: [Number],   // [longitude, latitude]
        required: true,
        validate: {
          validator: ([lng, lat]) =>
            lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
          message: "Invalid coordinates. Expected [longitude, latitude].",
        },
      },
    },

    solar_radiation: {
      type: Number,
      required: [true, "solar_radiation is required"],
      min: [0, "solar_radiation cannot be negative"],
      max: [20, "solar_radiation exceeds physical maximum"],
      comment: "kWh/m²/day",
    },

    distance_to_grid: {
      type: Number,
      required: [true, "distance_to_grid is required"],
      min: [0, "distance_to_grid cannot be negative"],
      comment: "km to nearest electricity grid",
    },

    location_type: {
      type: String,
      required: [true, "location_type is required"],
      enum: {
        values: ["residential", "road", "empty_land"],
        message: "location_type must be residential | road | empty_land",
      },
    },

    available_area: {
      type: Number,
      required: [true, "available_area is required"],
      min: [0, "available_area cannot be negative"],
      comment: "m² of usable surface for solar panels",
    },

    // Computed automatically — do not set manually
    score: {
      type: Number,
      default: 0,
    },

    // Optional free-form metadata
    metadata: {
      label:      { type: String, maxlength: 120 },
      source:     { type: String, maxlength: 80 },
      notes:      { type: String, maxlength: 500 },
      surveyed_at: { type: Date },
    },
  },
  {
    timestamps: true,   // createdAt + updatedAt
    toJSON:    { virtuals: true },
    toObject:  { virtuals: true },
  }
);

// ── Geospatial index ──────────────────────────────────────────────────────────
SolarPointSchema.index({ coordinates: "2dsphere" });

// ── Compound index for best-sites queries ─────────────────────────────────────
SolarPointSchema.index({ score: -1, location_type: 1 });

// ── Virtuals ──────────────────────────────────────────────────────────────────
SolarPointSchema.virtual("latitude").get(function () {
  return this.coordinates?.coordinates?.[1];
});

SolarPointSchema.virtual("longitude").get(function () {
  return this.coordinates?.coordinates?.[0];
});

// ── Pre-save hook: auto-compute score ────────────────────────────────────────
SolarPointSchema.pre("save", function (next) {
  this.score = computeScore({
    solar_radiation:  this.solar_radiation,
    distance_to_grid: this.distance_to_grid,
    available_area:   this.available_area,
    location_type:    this.location_type,
  });
  next();
});

// Also recompute on findOneAndUpdate / updateOne
SolarPointSchema.pre(["findOneAndUpdate", "updateOne"], function (next) {
  const update = this.getUpdate();
  if (update.$set) {
    const fields = update.$set;
    // Only recompute if any scoring field changed
    const scoringFields = ["solar_radiation", "distance_to_grid", "available_area", "location_type"];
    if (scoringFields.some((f) => fields[f] !== undefined)) {
      // We can't fully recompute here without fetching the doc,
      // so mark score for update if caller provides all required fields.
      if (
        fields.solar_radiation !== undefined &&
        fields.distance_to_grid !== undefined &&
        fields.available_area !== undefined &&
        fields.location_type !== undefined
      ) {
        update.$set.score = computeScore(fields);
      }
    }
  }
  next();
});

// ── Static methods ────────────────────────────────────────────────────────────
/**
 * Return top N sites, optionally filtered by location_type.
 * @param {object} options
 * @param {number} options.limit      - max results (default 10)
 * @param {string} options.type       - filter by location_type (optional)
 * @param {number} options.minScore   - minimum score threshold (optional)
 * @returns {Promise<SolarPoint[]>}
 */
SolarPointSchema.statics.getBestSites = async function ({
  limit = 10,
  type,
  minScore,
} = {}) {
  const query = {};
  if (type)     query.location_type = type;
  if (minScore) query.score = { $gte: minScore };

  return this.find(query)
    .sort({ score: -1 })
    .limit(limit)
    .lean();
};

// ── Export ────────────────────────────────────────────────────────────────────
module.exports = mongoose.model("SolarPoint", SolarPointSchema);
module.exports.computeScore = computeScore;   // exported for tests
