// src/seed/seedDatabase.js
// ─────────────────────────────────────────────────────────────────────────────
// Seeder script — generates and inserts 60 mock solar points for Hebron city.
//
// Run:  npm run seed
//       (or: node src/seed/seedDatabase.js)
//
// Behaviour:
//   - Drops the existing points collection before inserting
//   - Uses a deterministic pseudo-random generator (seed = 42)
//     so the same 60 points are always produced
//   - Prints a summary table after insertion
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();

const mongoose   = require("mongoose");
const connectDB  = require("../config/database");
const SolarPoint = require("../models/SolarPoint");

// ── Hebron bounding box ───────────────────────────────────────────────────────
const BOUNDS = {
  latMin: 31.500, latMax: 31.560,
  lngMin: 35.070, lngMax: 35.130,
};

const TYPES   = ["residential", "road", "empty_land"];
const LABELS  = { residential: "حي سكني", road: "شارع رئيسي", empty_land: "أرض فارغة" };

// ── Deterministic PRNG (LCG) ──────────────────────────────────────────────────
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223;
    return (s >>> 0) / 0xffffffff;
  };
}

// ── Point generator ───────────────────────────────────────────────────────────
function generatePoints(count = 60) {
  const rand = makePRNG(42);

  return Array.from({ length: count }, (_, i) => {
    const lat          = BOUNDS.latMin + rand() * (BOUNDS.latMax - BOUNDS.latMin);
    const lng          = BOUNDS.lngMin + rand() * (BOUNDS.lngMax - BOUNDS.lngMin);
    const type         = TYPES[Math.floor(rand() * TYPES.length)];
    const solar        = parseFloat((3.5 + rand() * 4.0).toFixed(3));   // 3.5–7.5 kWh/m²/day
    const gridDist     = parseFloat((0.1 + rand() * 5.9).toFixed(3));   // 0.1–6.0 km
    const area         = parseFloat((50  + rand() * 950).toFixed(1));   // 50–1000 m²

    return {
      coordinates: { type: "Point", coordinates: [lng, lat] },
      solar_radiation:  solar,
      distance_to_grid: gridDist,
      location_type:    type,
      available_area:   area,
      metadata: {
        label:       `${LABELS[type]} #${i + 1}`,
        source:      "mock-seed-v1",
        surveyed_at: new Date(Date.now() - Math.floor(rand() * 365 * 24 * 3600 * 1000)),
      },
    };
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function seed() {
  try {
    await connectDB();
    console.log("\n🌱  Starting database seed...\n");

    // Drop existing data
    const deleted = await SolarPoint.deleteMany({});
    console.log(`🗑️   Cleared ${deleted.deletedCount} existing points`);

    // Generate and insert (pre-save hook computes score for each)
    const raw    = generatePoints(60);
    const points = await SolarPoint.create(raw);

    // Print summary
    const scores  = points.map((p) => p.score);
    const avgScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2);
    const topPoint = points.reduce((a, b) => a.score > b.score ? a : b);

    const byType = points.reduce((acc, p) => {
      acc[p.location_type] = (acc[p.location_type] || 0) + 1;
      return acc;
    }, {});

    console.log("\n✅  Seeded 60 solar points successfully");
    console.log("─────────────────────────────────────────────");
    console.log(`   Average score : ${avgScore}`);
    console.log(`   Top point     : #${topPoint._id} | score ${topPoint.score} | solar ${topPoint.solar_radiation} kWh`);
    console.log(`   By type       : residential=${byType.residential || 0}, road=${byType.road || 0}, empty_land=${byType.empty_land || 0}`);
    console.log("─────────────────────────────────────────────\n");

  } catch (err) {
    console.error("❌  Seed failed:", err.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("🔌  MongoDB connection closed");
    process.exit(0);
  }
}

seed();
