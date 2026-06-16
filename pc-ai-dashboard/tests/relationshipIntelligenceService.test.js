import assert from "node:assert/strict";
import test from "node:test";
import {
  answerRelationshipQuery,
  buildRelationshipIntelligence,
} from "../services/relationshipIntelligenceService.js";

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

test("empty account produces an empty evidence-backed relationship graph", () => {
  const snapshot = buildRelationshipIntelligence({ userId: "empty-user", memories: [], chats: [], places: [] });
  assert.equal(snapshot.relationships.length, 0);
  assert.equal(snapshot.events.length, 0);
  assert.equal(snapshot.insights.length, 0);
  assert.equal(snapshot.overview.totalRelationships, 0);
});

test("extracts repeated real person evidence and scores relationship strength", () => {
  const snapshot = buildRelationshipIntelligence({
    userId: "test-user",
    memories: [
      {
        id: "m1",
        title: "Amazing dinner with Alex",
        content: "Had an amazing dinner with Alex and discussed startup ideas.",
        createdAt: daysAgo(2),
      },
      {
        id: "m2",
        title: "Worked with Alex",
        content: "Worked with Alex on the launch project and felt productive.",
        createdAt: daysAgo(1),
      },
    ],
  });

  const alex = snapshot.relationships.find((item) => item.personName === "Alex");
  assert.ok(alex);
  assert.equal(alex.interactionCount, 2);
  assert.ok(alex.relationshipStrength > 30);
  assert.ok(alex.positiveScore > 0);
  assert.ok(snapshot.insights.some((insight) => insight.relationshipId === alex.id));
});

test("does not turn apps, days, or unsupported mentions into synthetic people", () => {
  const snapshot = buildRelationshipIntelligence({
    userId: "test-user",
    memories: [
      {
        id: "m1",
        title: "Google Maps issue",
        content: "Google denied Places API on Tuesday while WhatsApp screenshot upload was pending.",
        createdAt: daysAgo(1),
      },
    ],
  });

  assert.equal(snapshot.relationships.length, 0);
  assert.equal(snapshot.events.length, 0);
});

test("detects reconnect candidates only from strong stale relationships", () => {
  const snapshot = buildRelationshipIntelligence({
    userId: "test-user",
    memories: [
      { id: "m1", title: "Coffee with Sarah", content: "Coffee with Sarah and discussed startup strategy.", createdAt: daysAgo(130) },
      { id: "m2", title: "Worked with Sarah", content: "Worked with Sarah on product launch project.", createdAt: daysAgo(125) },
      { id: "m3", title: "Sarah helped", content: "Sarah helped me during an important milestone.", createdAt: daysAgo(120) },
    ],
  });

  const sarah = snapshot.relationships.find((item) => item.personName === "Sarah");
  assert.ok(sarah);
  assert.ok(sarah.reconnectScore >= 45);
  assert.ok(snapshot.reconnect.some((item) => item.personName === "Sarah"));
});

test("answers relationship questions with evidence and confidence", () => {
  const snapshot = buildRelationshipIntelligence({
    userId: "test-user",
    memories: [
      { id: "m1", title: "Lunch with Priya", content: "Lunch with Priya was calm and productive.", createdAt: daysAgo(3) },
      { id: "m2", title: "Startup planning with Priya", content: "Worked with Priya on startup planning.", createdAt: daysAgo(2) },
    ],
  });

  const answer = answerRelationshipQuery("Who do I spend the most time with?", snapshot);
  assert.equal(answer.matched, true);
  assert.ok(answer.answer.includes("Priya"));
  assert.ok(answer.confidence >= 50);
});
