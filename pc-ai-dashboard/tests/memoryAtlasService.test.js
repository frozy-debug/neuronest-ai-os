import test from "node:test";
import assert from "node:assert/strict";
import { answerMemoryAtlasQuery, buildMemoryAtlas } from "../services/memoryAtlasService.js";

const user = { id: "atlas_user", name: "Jai" };
const now = new Date("2026-06-22T10:00:00.000Z");

test("Memory Atlas stays empty when no real coordinates exist", () => {
  const atlas = buildMemoryAtlas({
    user,
    memories: [{ id: "m1", title: "Cafe idea", body: "Loved this cafe idea but no coordinates.", createdAt: "2026-06-10T10:00:00.000Z" }],
    places: [{ id: "p1", placeName: "Blue Tokai Coffee", address: "Mumbai, Maharashtra, India", createdAt: "2026-06-10T10:00:00.000Z" }],
    now,
  });

  assert.equal(atlas.empty, true);
  assert.equal(atlas.mapPoints.length, 0);
  assert.equal(atlas.overview.evidenceCount, 0);
});

test("Memory Atlas maps real place memories and creates geographic clusters", () => {
  const atlas = buildMemoryAtlas({
    user,
    query: "show my travel history",
    places: [
      {
        id: "p1",
        placeName: "Blue Tokai Coffee",
        category: "cafe",
        address: "Mumbai, Maharashtra, India",
        latitude: 19.076,
        longitude: 72.8777,
        arrivalTime: "2026-06-10T08:00:00.000Z",
        departureTime: "2026-06-10T09:00:00.000Z",
      },
      {
        id: "p2",
        placeName: "KFC Ambala",
        category: "restaurant",
        address: "Ambala, Haryana, India",
        latitude: 30.3782,
        longitude: 76.7767,
        arrivalTime: "2026-06-12T19:00:00.000Z",
        departureTime: "2026-06-12T19:45:00.000Z",
      },
    ],
    now,
  });

  assert.equal(atlas.empty, false);
  assert.equal(atlas.mapPoints.length, 2);
  assert.equal(atlas.locationClusters.countries[0].label, "India");
  assert.ok(atlas.locationClusters.cities.find((city) => city.label === "Mumbai"));
  assert.ok(atlas.categoryBreakdown.find((category) => category.label === "Cafe"));
});

test("Memory Atlas filters time travel map by month", () => {
  const atlas = buildMemoryAtlas({
    user,
    query: "Show all places visited in June 2026",
    places: [
      {
        id: "june",
        placeName: "June Cafe",
        category: "cafe",
        address: "Mumbai, Maharashtra, India",
        latitude: 19.076,
        longitude: 72.8777,
        departureTime: "2026-06-10T09:00:00.000Z",
      },
      {
        id: "may",
        placeName: "May Gym",
        category: "gym",
        address: "Pune, Maharashtra, India",
        latitude: 18.5204,
        longitude: 73.8567,
        departureTime: "2026-05-10T09:00:00.000Z",
      },
    ],
    now,
  });

  assert.equal(atlas.period.label, "June 2026");
  assert.equal(atlas.mapPoints.length, 1);
  assert.equal(atlas.mapPoints[0].name, "June Cafe");
});

test("Memory Atlas answers happiness and city questions from real mapped evidence", () => {
  const atlas = buildMemoryAtlas({
    user,
    query: "Where was I happiest?",
    places: [
      {
        id: "p1",
        placeName: "Blue Tokai Coffee",
        category: "cafe",
        address: "Mumbai, Maharashtra, India",
        latitude: 19.076,
        longitude: 72.8777,
        departureTime: "2026-06-10T09:00:00.000Z",
      },
    ],
    memories: [
      {
        id: "m1",
        title: "Happy startup cafe sprint",
        body: "I felt happy and inspired at Blue Tokai Coffee while planning NeuroNest.",
        createdAt: "2026-06-10T09:15:00.000Z",
      },
    ],
    now,
  });

  const answer = answerMemoryAtlasQuery("Where was I happiest?", atlas);
  assert.equal(answer.matched, true);
  assert.ok(answer.confidence > 40);
  assert.match(answer.answer, /Blue Tokai Coffee/);
  assert.equal(atlas.locationClusters.cities[0].label, "Mumbai");
});

test("Memory Atlas answers where a known person appeared using linked place evidence", () => {
  const atlas = buildMemoryAtlas({
    user,
    query: "Where did I meet Alex?",
    places: [
      {
        id: "p1",
        placeName: "Blue Tokai Coffee",
        category: "cafe",
        address: "Mumbai, Maharashtra, India",
        latitude: 19.076,
        longitude: 72.8777,
        departureTime: "2026-06-10T09:00:00.000Z",
      },
    ],
    memories: [
      {
        id: "m1",
        title: "Meeting with Alex",
        body: "Met Alex at Blue Tokai Coffee and discussed startup ideas.",
        createdAt: "2026-06-10T10:00:00.000Z",
      },
    ],
    now,
  });

  const answer = answerMemoryAtlasQuery("Where did I meet Alex?", atlas);
  assert.equal(answer.matched, true);
  assert.match(answer.answer, /Alex/);
  assert.match(answer.answer, /Blue Tokai Coffee/);
  assert.ok(answer.evidence.length > 0);
});
