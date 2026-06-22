import assert from "node:assert/strict";
import test from "node:test";
import {
  answerDecisionQuery,
  buildDecisionIntelligence,
  normalizeDecisionInput,
} from "../services/decisionIntelligenceService.js";

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

test("empty account does not fabricate decision intelligence", () => {
  const snapshot = buildDecisionIntelligence({ userId: "empty-user" });

  assert.equal(snapshot.empty, true);
  assert.equal(snapshot.overview.totalDecisions, 0);
  assert.equal(snapshot.decisions.length, 0);
  assert.equal(snapshot.patterns.length, 0);
  assert.equal(snapshot.insights.length, 0);

  const answer = answerDecisionQuery("How do I make decisions?", snapshot);
  assert.equal(answer.matched, true);
  assert.equal(answer.confidence, 0);
  assert.equal(answer.evidence.length, 0);
});

test("analyzes explicit decisions with real outcome evidence", () => {
  const decisions = [
    normalizeDecisionInput({
      id: "decision-startup",
      decision: "Started NeuroNest startup",
      reason: "Freedom and business opportunity after research",
      expectedOutcome: "Build an AI memory operating system",
      actualOutcome: "Launched NeuroNest and improved the dashboard for real users",
      decidedAt: daysAgo(10),
    }),
    normalizeDecisionInput({
      id: "decision-tool",
      decision: "Bought random productivity tool",
      reason: "Rushed impulse because it looked useful",
      expectedOutcome: "Improve workflow",
      actualOutcome: "Failed and abandoned after one day",
      decidedAt: daysAgo(5),
    }),
  ];

  const snapshot = buildDecisionIntelligence({
    userId: "decision-user",
    decisions,
    records: [
      { id: "m1", type: "memory", title: "NeuroNest launch work", body: "Built NeuroNest dashboard and launched AI memory OS.", createdAt: daysAgo(8) },
      { id: "m2", type: "memory", title: "Tool regret", body: "The productivity tool was abandoned quickly.", createdAt: daysAgo(4) },
    ],
    goals: [
      { id: "g1", title: "Launch NeuroNest", description: "Build an AI memory operating system.", createdAt: daysAgo(12) },
    ],
  });

  assert.equal(snapshot.empty, false);
  assert.equal(snapshot.overview.totalDecisions, 2);
  assert.equal(snapshot.overview.completedDecisions, 2);
  assert.equal(snapshot.overview.successRate, 50);
  assert.equal(snapshot.overview.failureRate, 50);
  assert.ok(snapshot.overview.evidenceCount >= 4);
  assert.ok(snapshot.patterns.some((pattern) => pattern.title === "Successful decisions"));
  assert.ok(snapshot.patterns.some((pattern) => pattern.title === "Failed decisions"));
  assert.ok(snapshot.patterns.some((pattern) => pattern.title === "Rushed decisions"));
  assert.ok(snapshot.digitalTwinFeed.biggestSuccessfulDecision);
  assert.ok(snapshot.digitalTwinFeed.repeatedMistakePattern);
});

test("answers biggest successful decision with confidence and evidence", () => {
  const snapshot = buildDecisionIntelligence({
    userId: "chat-user",
    decisions: [
      normalizeDecisionInput({
        decision: "Started NeuroNest startup",
        reason: "Freedom and business opportunity",
        expectedOutcome: "Build business",
        actualOutcome: "Successful launch and improved users",
      }),
    ],
  });

  const answer = answerDecisionQuery("What is my biggest successful decision?", snapshot);

  assert.equal(answer.matched, true);
  assert.ok(answer.confidence > 0);
  assert.match(answer.answer, /Started NeuroNest startup/i);
  assert.ok(answer.evidence.length > 0);
});

test("answers repeated decision mistakes from stored failures", () => {
  const snapshot = buildDecisionIntelligence({
    userId: "mistake-user",
    decisions: [
      normalizeDecisionInput({
        decision: "Bought random productivity tool",
        reason: "Rushed impulse without thinking",
        expectedOutcome: "Improve workflow",
        actualOutcome: "Failed and abandoned",
      }),
    ],
  });

  const answer = answerDecisionQuery("What mistakes do I repeat?", snapshot);

  assert.equal(answer.matched, true);
  assert.ok(answer.confidence > 0);
  assert.match(answer.answer, /Rushed decisions|Failed decisions/i);
  assert.ok(answer.evidence.length > 0);
});

test("normalization rejects empty decisions", () => {
  assert.throws(() => normalizeDecisionInput({ reason: "No title" }), /Decision is required/i);
});
