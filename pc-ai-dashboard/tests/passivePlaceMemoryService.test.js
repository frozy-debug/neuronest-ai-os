import assert from "node:assert/strict";
import test from "node:test";
import {
  finalizePassivePlaceState,
  processPassiveLocationSample,
} from "../services/passivePlaceMemoryService.js";

function createDb() {
  return { warehouse: { locationSamples: [], passivePlaceStates: {}, placeMetadataQueue: [] } };
}

const settings = {
  enabled: true,
  minimumStayMinutes: 10,
  movementRadiusMeters: 100,
  maximumAccuracyMeters: 250,
  excludedLocations: [],
};

test("confirms a visit only after the dwell threshold and departure", () => {
  const db = createDb();
  const userId = "test-user";
  assert.equal(
    processPassiveLocationSample(db, userId, {
      latitude: 30.1,
      longitude: 76.8,
      accuracy: 20,
      recordedAt: "2026-06-15T10:00:00.000Z",
    }, settings).status,
    "arrival-candidate",
  );
  assert.equal(
    processPassiveLocationSample(db, userId, {
      latitude: 30.10005,
      longitude: 76.80005,
      accuracy: 20,
      recordedAt: "2026-06-15T10:11:00.000Z",
    }, settings).status,
    "visit-confirmed-awaiting-departure",
  );
  const completed = processPassiveLocationSample(db, userId, {
    latitude: 30.102,
    longitude: 76.802,
    accuracy: 20,
    recordedAt: "2026-06-15T10:12:00.000Z",
  }, settings);
  assert.equal(completed.status, "visit-completed");
  assert.equal(completed.visit.durationMinutes, 11);
  assert.equal(db.warehouse.placeMetadataQueue.length, 1);
});

test("does not store excluded private locations", () => {
  const db = createDb();
  const result = processPassiveLocationSample(db, "test-user", {
    latitude: 30.2,
    longitude: 76.9,
    accuracy: 15,
    recordedAt: "2026-06-15T10:00:00.000Z",
  }, {
    ...settings,
    excludedLocations: [{ id: "home", label: "Home", kind: "home", latitude: 30.2, longitude: 76.9, radiusMeters: 150 }],
  });
  assert.equal(result.status, "excluded");
  assert.equal(db.warehouse.locationSamples.length, 0);
});

test("rejects inaccurate GPS samples and discards short stops", () => {
  const db = createDb();
  assert.equal(
    processPassiveLocationSample(db, "test-user", {
      latitude: 30.1,
      longitude: 76.8,
      accuracy: 900,
    }, settings).status,
    "accuracy-rejected",
  );
  processPassiveLocationSample(db, "test-user", {
    latitude: 30.1,
    longitude: 76.8,
    accuracy: 20,
    recordedAt: "2026-06-15T10:00:00.000Z",
  }, settings);
  assert.equal(
    finalizePassivePlaceState(db, "test-user", settings, "2026-06-15T10:04:00.000Z").status,
    "short-stop-discarded",
  );
});
