import assert from "node:assert/strict";
import test from "node:test";
import { answerOpportunityQuery, buildOpportunityEngine } from "../services/opportunityEngineService.js";

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

test("empty account generates no opportunities", () => {
  const snapshot = buildOpportunityEngine({ userId: "empty-user" });
  assert.equal(snapshot.opportunities.length, 0);
  assert.equal(snapshot.empty, true);
  assert.match(snapshot.evidencePolicy, /No opportunities/i);
});

test("single weak signal does not fabricate an opportunity", () => {
  const snapshot = buildOpportunityEngine({
    userId: "single-signal",
    records: [{ id: "m1", title: "Random note", body: "I read one article about AI.", createdAt: daysAgo(1), type: "memory" }],
  });
  assert.equal(snapshot.opportunities.length, 0);
});

test("AI and SaaS activity creates evidence-backed opportunities", () => {
  const snapshot = buildOpportunityEngine({
    userId: "builder-user",
    goals: [{ id: "g1", title: "Launch NeuroNest AI SaaS", description: "Build and deploy AI memory OS", status: "active", createdAt: daysAgo(10) }],
    records: [
      { id: "m1", title: "NeuroNest AI chat", body: "Built AI chat memory retrieval and embeddings", createdAt: daysAgo(1), type: "memory" },
      { id: "m2", title: "SaaS deployment", body: "Configured Render deploy and GitHub for the startup SaaS", createdAt: daysAgo(2), type: "memory" },
      { id: "m3", title: "Coding session", body: "Fixed backend API routes for NeuroNest", createdAt: daysAgo(3), type: "memory" },
      { id: "m4", title: "Product UI", body: "Improved dashboard UI animation and product design", createdAt: daysAgo(4), type: "memory" },
      { id: "m5", title: "AI SaaS plan", body: "Planned pricing, customer launch, and AI product roadmap", createdAt: daysAgo(5), type: "memory" },
    ],
  });

  assert.ok(snapshot.opportunities.length > 0);
  assert.ok(snapshot.overview.evidenceCount > 0);
  assert.equal(snapshot.opportunities.every((item) => item.evidenceCount > 0), true);
  assert.ok(snapshot.byType["high-potential-project"]?.length || snapshot.byType["career-opportunity"]?.length);
});

test("skills question returns the strongest growing skill with evidence", () => {
  const snapshot = buildOpportunityEngine({
    userId: "skill-user",
    records: [
      { id: "s1", title: "AI embedding work", body: "Implemented semantic vector search", createdAt: daysAgo(1), type: "memory" },
      { id: "s2", title: "OpenAI agent work", body: "Debugged LLM assistant and prompt routing", createdAt: daysAgo(2), type: "memory" },
      { id: "s3", title: "AI backend", body: "Built AI API server and model integration", createdAt: daysAgo(3), type: "memory" },
    ],
  });
  const answer = answerOpportunityQuery("What skills are growing fastest?", snapshot);
  assert.equal(answer.matched, true);
  assert.ok(answer.confidence > 0);
  assert.ok(answer.evidence.length > 0);
  assert.match(answer.answer, /Evidence/i);
});

test("highest potential project query uses project evidence", () => {
  const snapshot = buildOpportunityEngine({
    userId: "project-user",
    goals: [{ id: "g1", title: "Launch NeuroNest mobile app", status: "active", createdAt: daysAgo(8) }],
    records: [
      { id: "p1", title: "NeuroNest mobile", body: "Worked on mobile dashboard for NeuroNest", createdAt: daysAgo(1), type: "memory" },
      { id: "p2", title: "Mobile app auth", body: "Planned mobile app Google login and memory sync", createdAt: daysAgo(2), type: "memory" },
      { id: "p3", title: "React mobile UI", body: "Designed responsive mobile app screens", createdAt: daysAgo(3), type: "memory" },
    ],
  });
  const answer = answerOpportunityQuery("What project has the highest potential?", snapshot);
  assert.equal(answer.matched, true);
  assert.ok(answer.opportunity.category === "high-potential-project");
  assert.ok(answer.evidence.length >= 2);
});
