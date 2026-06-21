import test from "node:test";
import assert from "node:assert/strict";
import {
  answerAutonomousIntelligenceQuery,
  buildAutonomousIntelligenceCoreV3,
  buildMemoryTimeMachine,
} from "../services/autonomousIntelligenceCoreV3Service.js";

const user = { id: "user_v3", name: "Jai" };

test("Autonomous Intelligence Core V3 returns empty intelligence for empty accounts", () => {
  const snapshot = buildAutonomousIntelligenceCoreV3({ user });

  assert.equal(snapshot.empty, true);
  assert.equal(snapshot.understandingScore, 0);
  assert.deepEqual(snapshot.knowledgeGraph.nodes, []);
  assert.deepEqual(snapshot.decisions, []);
  assert.deepEqual(snapshot.opportunities, []);
  assert.match(snapshot.evidencePolicy, /No hallucinations/i);

  const answer = answerAutonomousIntelligenceQuery("Who am I becoming?", snapshot);
  assert.equal(answer.matched, true);
  assert.equal(answer.confidence, 0);
  assert.deepEqual(answer.evidence, []);
});

test("Autonomous Intelligence Core V3 builds graph, decisions, stories, and opportunities from real evidence", () => {
  const memories = [
    {
      id: "m1",
      userId: user.id,
      type: "memory",
      title: "Started NeuroNest launch sprint",
      body: "Decided to build NeuroNest as an AI SaaS startup because I want to launch an AI company.",
      tags: ["ai", "startup", "coding"],
      createdAt: "2026-06-10T10:00:00.000Z",
    },
    {
      id: "m2",
      userId: user.id,
      type: "screenshot",
      title: "Render deployment bug fix",
      body: "Fixed the Render deploy error and tested the API server.",
      tags: ["coding", "deploy"],
      createdAt: "2026-06-11T11:00:00.000Z",
    },
    {
      id: "m3",
      userId: user.id,
      type: "voice",
      title: "AI SaaS idea voice note",
      body: "Voice note about AI, SaaS, pricing, product design, and founder goals.",
      tags: ["ai", "saas", "productivity"],
      createdAt: "2026-06-12T12:00:00.000Z",
    },
  ];
  const goals = [
    {
      id: "g1",
      title: "Launch NeuroNest",
      description: "Ship the AI memory OS and share it with users.",
      status: "active",
      progress: 45,
      createdAt: "2026-06-09T09:00:00.000Z",
      updatedAt: "2026-06-12T09:00:00.000Z",
      tags: ["ai", "startup"],
    },
  ];
  const relationshipIntelligence = {
    relationships: [
      {
        personName: "Sarah",
        relationshipType: "Professional",
        interactionCount: 2,
        relationshipStrength: 66,
        lastSeen: "2026-06-12T12:00:00.000Z",
      },
    ],
    events: [
      {
        id: "r1",
        personName: "Sarah",
        sourceType: "memory",
        sourceTitle: "Discussed startup with Sarah",
        timestamp: "2026-06-12T12:00:00.000Z",
      },
    ],
  };
  const futurePredictions = {
    predictions: [
      {
        id: "p1",
        type: "opportunity",
        title: "AI SaaS is an evidence-backed opportunity",
        summary: "AI SaaS has repeated activity signals.",
        recommendation: "Create an AI SaaS launch mission.",
        predictionScore: 82,
        confidence: 88,
        evidenceCount: 3,
        evidence: memories.map((memory) => ({
          id: memory.id,
          type: memory.type,
          title: memory.title,
          timestamp: memory.createdAt,
          reason: "prediction evidence",
        })),
      },
    ],
    byType: {
      opportunities: [],
    },
    accuracy: { accuracy: 0, evaluatedCount: 0, reliability: "insufficient history" },
    history: [],
  };

  const snapshot = buildAutonomousIntelligenceCoreV3({
    user,
    memories,
    records: memories,
    goals,
    relationshipIntelligence,
    futurePredictions,
    query: "take me back to June 2026",
  });

  assert.equal(snapshot.empty, false);
  assert.ok(snapshot.understandingScore > 0);
  assert.ok(snapshot.knowledgeGraph.nodes.some((node) => node.label === "NeuroNest"));
  assert.ok(snapshot.knowledgeGraph.nodes.some((node) => node.label === "Sarah"));
  assert.ok(snapshot.knowledgeGraph.edges.length > 0);
  assert.ok(snapshot.decisions.length >= 1);
  assert.ok(snapshot.decisions.every((decision) => decision.evidence.length > 0));
  assert.ok(snapshot.lifeStories.monthly.length >= 1);
  assert.ok(snapshot.futureSelf.horizons.length >= 1);
  assert.ok(snapshot.opportunities.length >= 1);
  assert.ok(snapshot.chiefOfStaff.length >= 1);
  assert.equal(snapshot.memoryTimeMachine.reconstruction.label, "2026-06");
});

test("Autonomous Intelligence Core V3 time machine understands natural month queries", () => {
  const snapshot = {
    sourceRecords: [
      { id: "jun", title: "June memory", body: "Built AI SaaS in June", createdAt: "2026-06-21T08:00:00.000Z" },
      { id: "may", title: "May memory", body: "Older work", createdAt: "2026-05-21T08:00:00.000Z" },
    ],
  };

  const result = buildMemoryTimeMachine(snapshot, "Take me back to June 2026");

  assert.equal(result.reconstruction.label, "2026-06");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].id, "jun");
});

test("Autonomous Intelligence Core V3 direct answers include evidence when evidence exists", () => {
  const snapshot = buildAutonomousIntelligenceCoreV3({
    user,
    memories: [
      {
        id: "m1",
        type: "memory",
        title: "Started NeuroNest startup plan",
        body: "Decided to build NeuroNest and focus on AI SaaS launch.",
        createdAt: "2026-06-10T10:00:00.000Z",
      },
      {
        id: "m2",
        type: "memory",
        title: "AI SaaS work session",
        body: "Productive coding session for NeuroNest AI SaaS.",
        createdAt: "2026-06-11T10:00:00.000Z",
      },
      {
        id: "m3",
        type: "memory",
        title: "NeuroNest deploy progress",
        body: "Fixed deployment and improved AI dashboard.",
        createdAt: "2026-06-12T10:00:00.000Z",
      },
    ],
    goals: [{ id: "g1", title: "Launch NeuroNest", progress: 30, status: "active", createdAt: "2026-06-09T10:00:00.000Z" }],
    futurePredictions: {
      predictions: [],
      byType: {},
      accuracy: { accuracy: 0, evaluatedCount: 0, reliability: "insufficient history" },
      history: [],
    },
  });

  const answer = answerAutonomousIntelligenceQuery("Who am I becoming?", snapshot);

  assert.equal(answer.matched, true);
  assert.ok(answer.confidence > 0);
  assert.ok(answer.evidence.length > 0);
  assert.match(answer.answer, /trending toward/i);
});
