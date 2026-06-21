import test from "node:test";
import assert from "node:assert/strict";
import { answerChiefOfStaffQuery, buildAiChiefOfStaff } from "../services/aiChiefOfStaffService.js";

const user = { id: "chief_user", name: "Jai" };

test("AI Chief of Staff stays empty when the user has no declared goals", () => {
  const snapshot = buildAiChiefOfStaff({ user, memories: [{ id: "m1", title: "Random coding note", createdAt: "2026-06-20T10:00:00.000Z" }] });

  assert.equal(snapshot.empty, true);
  assert.equal(snapshot.overview.activeGoals, 0);
  assert.deepEqual(snapshot.activeGoals, []);
  assert.deepEqual(snapshot.priorityTasks, []);
  assert.deepEqual(snapshot.risks, []);
  assert.match(snapshot.evidencePolicy, /No goals/i);

  const answer = answerChiefOfStaffQuery("What should I work on today?", snapshot);
  assert.equal(answer.matched, true);
  assert.equal(answer.confidence, 0);
  assert.deepEqual(answer.evidence, []);
});

test("AI Chief of Staff creates roadmap, tasks, health, and next actions from a real goal", () => {
  const goals = [
    {
      id: "goal_mobile",
      title: "Launch NeuroNest Mobile App",
      description: "Build mobile app with authentication, memory sync, testing, and release.",
      status: "active",
      progress: 35,
      createdAt: "2026-06-10T09:00:00.000Z",
      updatedAt: "2026-06-20T09:00:00.000Z",
    },
  ];
  const memories = [
    {
      id: "m1",
      type: "memory",
      title: "React Native mobile setup",
      body: "Built mobile app architecture and navigation for NeuroNest.",
      createdAt: "2026-06-19T10:00:00.000Z",
    },
    {
      id: "m2",
      type: "memory",
      title: "Authentication planning",
      body: "Planned Google login, sessions, and profile flow for mobile authentication.",
      createdAt: "2026-06-20T11:00:00.000Z",
    },
  ];

  const snapshot = buildAiChiefOfStaff({ user, goals, memories, records: memories });

  assert.equal(snapshot.empty, false);
  assert.equal(snapshot.overview.activeGoals, 1);
  assert.ok(snapshot.activeGoals[0].roadmap.some((phase) => phase.phase === "Authentication"));
  assert.ok(snapshot.activeGoals[0].estimatedCompletionDate);
  assert.ok(snapshot.activeGoals[0].successProbability > 0);
  assert.ok(snapshot.priorityTasks.length >= 1);
  assert.ok(snapshot.priorityTasks.every((task) => task.evidence.length > 0));
  assert.ok(snapshot.nextActions.length >= 1);
  assert.ok(snapshot.goalHealth[0].relatedSignalCount >= 2);
});

test("AI Chief of Staff detects low activity and missed deadline risk from real goal state", () => {
  const goals = [
    {
      id: "goal_startup",
      title: "Launch Startup",
      description: "Launch AI SaaS startup.",
      status: "active",
      progress: 10,
      targetDate: "2026-01-01",
      createdAt: "2025-12-01T09:00:00.000Z",
      updatedAt: "2025-12-15T09:00:00.000Z",
    },
  ];
  const memories = [
    {
      id: "old1",
      type: "memory",
      title: "Startup planning was blocked",
      body: "Startup launch had a problem and got delayed.",
      createdAt: "2025-12-10T10:00:00.000Z",
    },
  ];

  const snapshot = buildAiChiefOfStaff({ user, goals, memories, records: memories });

  assert.ok(snapshot.risks.some((risk) => risk.title === "Low activity"));
  assert.ok(snapshot.risks.some((risk) => risk.title === "Missed deadline"));
  assert.ok(snapshot.risks.every((risk) => risk.evidence.length > 0));
  assert.ok(snapshot.overview.highRiskCount >= 1);
});

test("AI Chief of Staff answers execution questions with evidence", () => {
  const goals = [
    {
      id: "goal_ai",
      title: "Build AI SaaS",
      description: "Build and launch AI SaaS product.",
      status: "active",
      progress: 50,
      createdAt: "2026-06-10T09:00:00.000Z",
      updatedAt: "2026-06-20T09:00:00.000Z",
    },
  ];
  const memories = [
    {
      id: "m1",
      type: "memory",
      title: "Built AI SaaS MVP",
      body: "Completed API and frontend work for startup MVP.",
      createdAt: "2026-06-20T10:00:00.000Z",
    },
  ];
  const snapshot = buildAiChiefOfStaff({ user, goals, memories, records: memories });
  const answer = answerChiefOfStaffQuery("What is my highest priority task?", snapshot);

  assert.equal(answer.matched, true);
  assert.ok(answer.confidence > 0);
  assert.ok(answer.evidence.length > 0);
  assert.match(answer.answer, /highest-priority task/i);
});
