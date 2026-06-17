import assert from "node:assert/strict";
import test from "node:test";
import { answerPredictionQuery, buildFuturePredictionEngine } from "../services/futurePredictionEngineService.js";

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

test("empty account generates no predictions", () => {
  const snapshot = buildFuturePredictionEngine({ userId: "user-empty" });
  assert.equal(snapshot.predictions.length, 0);
  assert.equal(snapshot.overview.activePredictions, 0);
  assert.match(snapshot.evidencePolicy, /No predictions/i);
});

test("goal forecast requires real related goal activity evidence", () => {
  const snapshot = buildFuturePredictionEngine({
    userId: "user-goal",
    goals: [{ id: "goal-1", title: "Launch NeuroNest", description: "Build and deploy the AI memory OS", status: "active", progress: 35 }],
    records: [
      { id: "m1", title: "NeuroNest deploy", body: "Fixed Render server and deployed startup app", createdAt: daysAgo(1), type: "memory" },
      { id: "m2", title: "AI dashboard build", body: "Built NeuroNest dashboard features and tested API routes", createdAt: daysAgo(3), type: "memory" },
      { id: "m3", title: "Launch checklist", body: "Reviewed startup launch tasks for NeuroNest", createdAt: daysAgo(7), type: "memory" },
    ],
  });
  const goalPrediction = snapshot.predictions.find((prediction) => prediction.type === "goal");
  assert.ok(goalPrediction);
  assert.ok(goalPrediction.confidence > 0);
  assert.ok(goalPrediction.evidenceCount >= 2);
  assert.equal(goalPrediction.evidence.every((item) => item.id), true);
});

test("single unrelated record does not fabricate predictions", () => {
  const snapshot = buildFuturePredictionEngine({
    userId: "user-random",
    records: [{ id: "m1", title: "Random note", body: "A normal unrelated note without repeated behavior.", createdAt: daysAgo(1), type: "memory" }],
  });
  assert.equal(snapshot.predictions.length, 0);
});

test("burnout detection is generated only from real stress and workload evidence", () => {
  const snapshot = buildFuturePredictionEngine({
    userId: "user-burnout",
    goals: [{ id: "goal-1", title: "Build SaaS", status: "active", progress: 20 }],
    records: [
      { id: "w1", title: "Late night coding", body: "Coding and fixing backend under pressure", createdAt: daysAgo(1), type: "memory" },
      { id: "w2", title: "Stress note", body: "Felt stressed and overwhelmed by launch work", createdAt: daysAgo(2), type: "journal" },
      { id: "w3", title: "Startup build", body: "Built project API and tested deployment", createdAt: daysAgo(4), type: "memory" },
      { id: "w4", title: "Blocked issue", body: "Issue blocked progress and I felt tired", createdAt: daysAgo(5), type: "memory" },
    ],
  });
  const burnout = snapshot.predictions.find((prediction) => prediction.type === "burnout");
  assert.ok(burnout);
  assert.ok(burnout.evidenceCount >= 4);
  assert.ok(["Moderate", "High", "Critical"].includes(burnout.riskLevel));
});

test("prediction chat answer returns confidence and evidence summary", () => {
  const snapshot = buildFuturePredictionEngine({
    userId: "user-chat",
    records: [
      { id: "p1", title: "Focused coding", body: "Productive coding session on API server", createdAt: daysAgo(1), type: "memory" },
      { id: "p2", title: "Focused deploy", body: "Built and deployed project features", createdAt: daysAgo(2), type: "memory" },
      { id: "p3", title: "Deep work", body: "Deep work on startup dashboard", createdAt: daysAgo(3), type: "memory" },
    ],
  });
  const answer = answerPredictionQuery("What is my next productivity window?", snapshot);
  assert.equal(answer.matched, true);
  assert.ok(answer.confidence > 0);
  assert.ok(answer.evidence.length > 0);
  assert.match(answer.answer, /Confidence/i);
});
