// tests/points.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Integration tests using supertest + in-memory MongoDB.
// Run: npm test
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");
const request  = require("supertest");

// Use a real app instance pointing to a test DB
process.env.NODE_ENV      = "test";
process.env.MONGODB_URI   = "mongodb://localhost:27017/solar_hebron_test";

const app        = require("../src/app");
const SolarPoint = require("../src/models/SolarPoint");
const { computeScore } = require("../src/models/SolarPoint");

// ── Setup / Teardown ──────────────────────────────────────────────────────────
beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
});

afterEach(async () => {
  await SolarPoint.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

// ── Helper ────────────────────────────────────────────────────────────────────
const samplePayload = (overrides = {}) => ({
  latitude:         31.530,
  longitude:        35.095,
  solar_radiation:  6.5,
  distance_to_grid: 1.2,
  location_type:    "empty_land",
  available_area:   300,
  ...overrides,
});

// ── computeScore unit tests ───────────────────────────────────────────────────
describe("computeScore()", () => {
  test("returns a number", () => {
    const s = computeScore({ solar_radiation: 6, distance_to_grid: 1, available_area: 200, location_type: "empty_land" });
    expect(typeof s).toBe("number");
  });

  test("empty_land scores higher than road for same inputs", () => {
    const base = { solar_radiation: 6, distance_to_grid: 1, available_area: 200 };
    expect(computeScore({ ...base, location_type: "empty_land" }))
      .toBeGreaterThan(computeScore({ ...base, location_type: "road" }));
  });

  test("higher solar increases score", () => {
    const base = { distance_to_grid: 1, available_area: 200, location_type: "residential" };
    expect(computeScore({ ...base, solar_radiation: 7 }))
      .toBeGreaterThan(computeScore({ ...base, solar_radiation: 5 }));
  });

  test("closer grid increases score", () => {
    const base = { solar_radiation: 6, available_area: 200, location_type: "residential" };
    expect(computeScore({ ...base, distance_to_grid: 0.5 }))
      .toBeGreaterThan(computeScore({ ...base, distance_to_grid: 3.0 }));
  });
});

// ── POST /api/points ──────────────────────────────────────────────────────────
describe("POST /api/points", () => {
  test("creates a point and returns 201", async () => {
    const res = await request(app).post("/api/points").send(samplePayload());
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty("_id");
    expect(res.body.data.score).toBeGreaterThan(0);
  });

  test("returns 422 for missing required fields", async () => {
    const res = await request(app).post("/api/points").send({ latitude: 31.5 });
    expect(res.statusCode).toBe(422);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test("returns 422 for invalid location_type", async () => {
    const res = await request(app)
      .post("/api/points")
      .send(samplePayload({ location_type: "factory" }));
    expect(res.statusCode).toBe(422);
  });

  test("returns 422 for solar_radiation > 20", async () => {
    const res = await request(app)
      .post("/api/points")
      .send(samplePayload({ solar_radiation: 25 }));
    expect(res.statusCode).toBe(422);
  });
});

// ── GET /api/points ───────────────────────────────────────────────────────────
describe("GET /api/points", () => {
  beforeEach(async () => {
    await SolarPoint.create([
      { coordinates: { type: "Point", coordinates: [35.095, 31.530] }, solar_radiation: 6.5, distance_to_grid: 1.2, location_type: "empty_land",   available_area: 300 },
      { coordinates: { type: "Point", coordinates: [35.100, 31.535] }, solar_radiation: 5.0, distance_to_grid: 2.5, location_type: "residential",  available_area: 150 },
      { coordinates: { type: "Point", coordinates: [35.085, 31.520] }, solar_radiation: 4.2, distance_to_grid: 3.8, location_type: "road",         available_area: 80 },
    ]);
  });

  test("returns all 3 points", async () => {
    const res = await request(app).get("/api/points");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(3);
    expect(res.body.pagination.total).toBe(3);
  });

  test("filters by type", async () => {
    const res = await request(app).get("/api/points?type=residential");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].location_type).toBe("residential");
  });

  test("filters by minSolar", async () => {
    const res = await request(app).get("/api/points?minSolar=5.5");
    expect(res.body.data.every((p) => p.solar_radiation >= 5.5)).toBe(true);
  });

  test("returns 422 for invalid type filter", async () => {
    const res = await request(app).get("/api/points?type=unknown");
    expect(res.statusCode).toBe(422);
  });
});

// ── GET /api/points/best ──────────────────────────────────────────────────────
describe("GET /api/points/best", () => {
  beforeEach(async () => {
    await SolarPoint.create(
      Array.from({ length: 10 }, (_, i) => ({
        coordinates: { type: "Point", coordinates: [35.095 + i * 0.001, 31.530] },
        solar_radiation:  4 + i * 0.3,
        distance_to_grid: 5 - i * 0.4,
        location_type:    i % 3 === 0 ? "empty_land" : i % 3 === 1 ? "residential" : "road",
        available_area:   100 + i * 50,
      }))
    );
  });

  test("returns top 5 by default limit=5", async () => {
    const res = await request(app).get("/api/points/best?limit=5");
    expect(res.statusCode).toBe(200);
    expect(res.body.data.length).toBe(5);
  });

  test("results are sorted descending by score", async () => {
    const res = await request(app).get("/api/points/best?limit=10");
    const scores = res.body.data.map((p) => p.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  test("includes rank field starting at 1", async () => {
    const res = await request(app).get("/api/points/best?limit=3");
    expect(res.body.data[0].rank).toBe(1);
    expect(res.body.data[2].rank).toBe(3);
  });

  test("includes summary statistics", async () => {
    const res = await request(app).get("/api/points/best");
    expect(res.body.summary).toHaveProperty("avgScore");
    expect(res.body.summary).toHaveProperty("typeBreakdown");
  });
});

// ── GET /api/points/:id ───────────────────────────────────────────────────────
describe("GET /api/points/:id", () => {
  test("returns 404 for non-existent id", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res    = await request(app).get(`/api/points/${fakeId}`);
    expect(res.statusCode).toBe(404);
  });

  test("returns 400 for invalid id format", async () => {
    const res = await request(app).get("/api/points/not-an-id");
    expect(res.statusCode).toBe(422);
  });

  test("returns the correct point", async () => {
    const point = await SolarPoint.create({
      coordinates: { type: "Point", coordinates: [35.095, 31.530] },
      solar_radiation: 6.0, distance_to_grid: 1.0,
      location_type: "empty_land", available_area: 200,
    });
    const res = await request(app).get(`/api/points/${point._id}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.data._id).toBe(point._id.toString());
  });
});

// ── GET /api/points/stats ─────────────────────────────────────────────────────
describe("GET /api/points/stats", () => {
  test("returns stats object", async () => {
    await SolarPoint.create({
      coordinates: { type: "Point", coordinates: [35.095, 31.530] },
      solar_radiation: 6.0, distance_to_grid: 1.0,
      location_type: "empty_land", available_area: 200,
    });
    const res = await request(app).get("/api/points/stats");
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveProperty("total_points");
    expect(res.body.data).toHaveProperty("solar_radiation");
    expect(res.body.data).toHaveProperty("by_type");
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
describe("GET /health", () => {
  test("returns 200 ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
