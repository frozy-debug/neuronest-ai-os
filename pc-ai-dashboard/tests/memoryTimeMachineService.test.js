import test from "node:test";
import assert from "node:assert/strict";
import { answerMemoryTimeMachineQuery, buildMemoryTimeMachine } from "../services/memoryTimeMachineService.js";

const user = { id: "time_user", name: "Jai" };
const now = new Date("2026-06-21T12:00:00.000Z");

test("Memory Time Machine returns empty reconstruction when no real events match", () => {
  const snapshot = buildMemoryTimeMachine({
    user,
    query: "Take me back to January 2024",
    memories: [{ id: "m1", title: "June work", body: "Built app", createdAt: "2026-06-10T10:00:00.000Z" }],
    now,
  });

  assert.equal(snapshot.empty, true);
  assert.equal(snapshot.summary.totalEvents, 0);
  assert.equal(snapshot.story, "");

  const answer = answerMemoryTimeMachineQuery("Take me back to January 2024", snapshot);
  assert.equal(answer.matched, true);
  assert.equal(answer.confidence, 0);
  assert.deepEqual(answer.evidence, []);
});

test("Memory Time Machine reconstructs June 2026 from real memories, places, goals, and relationships", () => {
  const memories = [
    {
      id: "m1",
      type: "memory",
      title: "NeuroNest startup sprint",
      body: "Focused coding session for NeuroNest AI SaaS launch.",
      tags: ["startup", "coding"],
      createdAt: "2026-06-10T09:30:00.000Z",
    },
    {
      id: "m2",
      type: "voice",
      title: "Voice note with Alex",
      body: "Voice note after discussing startup roadmap with Alex.",
      tags: ["startup", "voice"],
      createdAt: "2026-06-10T15:00:00.000Z",
    },
    {
      id: "m3",
      type: "screenshot",
      title: "Startup pricing screenshot",
      body: "Screenshot about startup pricing and SaaS plan.",
      tags: ["startup", "screenshot"],
      createdAt: "2026-06-11T18:00:00.000Z",
    },
  ];
  const places = [
    {
      id: "p1",
      placeName: "Blue Tokai Coffee",
      category: "cafe",
      address: "Mumbai",
      arrivalTime: "2026-06-10T08:00:00.000Z",
      departureTime: "2026-06-10T09:00:00.000Z",
      createdAt: "2026-06-10T09:00:00.000Z",
    },
  ];
  const goals = [
    {
      id: "g1",
      title: "Launch NeuroNest",
      description: "Ship the startup memory OS.",
      status: "active",
      progress: 55,
      createdAt: "2026-06-01T08:00:00.000Z",
      updatedAt: "2026-06-11T08:00:00.000Z",
    },
  ];
  const relationships = {
    relationships: [{ personName: "Alex", relationshipType: "Professional", interactionCount: 2, relationshipStrength: 70 }],
    events: [{ id: "r1", personName: "Alex", sourceId: "m2", sourceTitle: "Voice note with Alex", timestamp: "2026-06-10T15:00:00.000Z" }],
  };

  const snapshot = buildMemoryTimeMachine({
    user,
    query: "Take me back to June 2026",
    memories,
    places,
    goals,
    relationships,
    now,
  });

  assert.equal(snapshot.empty, false);
  assert.equal(snapshot.period.label, "June 2026");
  assert.ok(snapshot.summary.totalEvents >= 4);
  assert.ok(snapshot.story.includes("June 2026"));
  assert.ok(snapshot.timelineReplay.find((bucket) => bucket.bucket === "morning").events.length >= 1);
  assert.ok(snapshot.timelineReplay.find((bucket) => bucket.bucket === "afternoon").events.length >= 1);
  assert.ok(snapshot.timelineReplay.find((bucket) => bucket.bucket === "evening").events.length >= 1);
  assert.equal(snapshot.people[0].name, "Alex");
  assert.equal(snapshot.places[0].name, "Blue Tokai Coffee");
  assert.equal(snapshot.goals[0].title, "Launch NeuroNest");
  assert.equal(snapshot.screenshots.length, 1);
  assert.equal(snapshot.voiceNotes.length, 1);
});

test("Memory Time Machine understands last Christmas", () => {
  const snapshot = buildMemoryTimeMachine({
    user,
    query: "Show me last Christmas",
    memories: [
      { id: "xmas", type: "memory", title: "Christmas family dinner", body: "Happy family Christmas dinner.", createdAt: "2025-12-25T19:00:00.000Z" },
      { id: "other", type: "memory", title: "Other day", body: "Not Christmas.", createdAt: "2025-12-20T19:00:00.000Z" },
    ],
    now,
  });

  assert.equal(snapshot.period.label, "Christmas 2025");
  assert.equal(snapshot.summary.totalEvents, 1);
  assert.equal(snapshot.importantEvents[0].id, "xmas");
});

test("Memory Time Machine understands relative month queries", () => {
  const snapshot = buildMemoryTimeMachine({
    user,
    query: "What was I doing 3 months ago?",
    memories: [
      { id: "march", type: "memory", title: "March coding sprint", body: "Coding and AI work.", createdAt: "2026-03-15T10:00:00.000Z" },
      { id: "june", type: "memory", title: "June sprint", body: "Later work.", createdAt: "2026-06-15T10:00:00.000Z" },
    ],
    now,
  });

  assert.equal(snapshot.period.label, "March 2026");
  assert.equal(snapshot.summary.totalEvents, 1);
  assert.equal(snapshot.importantEvents[0].id, "march");
});

test("Memory Time Machine filters screenshots from startup phase", () => {
  const snapshot = buildMemoryTimeMachine({
    user,
    query: "Show screenshots from startup phase",
    memories: [
      { id: "s1", type: "screenshot", title: "Startup pricing screenshot", body: "SaaS startup pricing.", createdAt: "2026-05-10T10:00:00.000Z" },
      { id: "s2", type: "screenshot", title: "Gym screenshot", body: "Workout plan.", createdAt: "2026-05-11T10:00:00.000Z" },
      { id: "m1", type: "memory", title: "Startup note", body: "Startup plan.", createdAt: "2026-05-12T10:00:00.000Z" },
    ],
    now,
  });

  assert.equal(snapshot.summary.totalEvents, 1);
  assert.equal(snapshot.screenshots.length, 1);
  assert.equal(snapshot.screenshots[0].id, "s1");
});

test("Memory Time Machine chat answer summarizes only evidence-backed results", () => {
  const snapshot = buildMemoryTimeMachine({
    user,
    query: "Show memories related to coding in May 2026",
    memories: [
      { id: "coding", type: "memory", title: "Coding API", body: "Fixed backend API code.", createdAt: "2026-05-05T10:00:00.000Z" },
      { id: "travel", type: "memory", title: "Travel day", body: "Trip outside.", createdAt: "2026-05-06T10:00:00.000Z" },
    ],
    now,
  });
  const answer = answerMemoryTimeMachineQuery("Show memories related to coding in May 2026", snapshot);

  assert.equal(answer.matched, true);
  assert.ok(answer.confidence > 0);
  assert.ok(answer.evidence.length > 0);
  assert.match(answer.answer, /1 real event/);
});
