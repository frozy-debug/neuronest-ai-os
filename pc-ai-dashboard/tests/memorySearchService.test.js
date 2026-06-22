import assert from "node:assert/strict";
import test from "node:test";
import { searchMemoriesByKeyword } from "../services/memorySearchService.js";
import { searchMemoryVectorsWithFallback } from "../services/vectorSearchService.js";

const memories = [
  {
    id: "m1",
    userId: "user-1",
    type: "memory",
    title: "Talked to Emily about NeuroNest.",
    content: "Talked to Emily about NeuroNest and startup ideas.",
    summary: "Emily startup discussion",
    tags: ["startup", "Emily"],
    createdAt: "2026-06-20T10:00:00.000Z",
    metadata: {},
  },
  {
    id: "m2",
    userId: "user-1",
    type: "screenshot",
    title: "Pricing screenshot",
    content: "Saved product pricing.",
    summary: "Screenshot memory",
    tags: ["pricing"],
    createdAt: "2026-06-21T10:00:00.000Z",
    metadata: {
      ocrText: "Chat with Sarah about startup pricing",
      imageCaption: "Pricing dashboard",
    },
  },
  {
    id: "m3",
    userId: "user-1",
    type: "voice",
    title: "Voice note",
    content: "Quick voice memory",
    summary: "Voice note",
    tags: ["voice"],
    createdAt: "2026-06-22T10:00:00.000Z",
    metadata: {
      transcript: "Called John after gym",
    },
  },
];

test("keyword memory search finds person names case-insensitively across title, content, summary, and tags", () => {
  const matches = searchMemoriesByKeyword({ query: "what do you know about emily?", memories, limit: 5 });

  assert.equal(matches[0].memory.id, "m1");
  assert.ok(matches[0].matchedTerms.includes("emily"));
  assert.ok(matches[0].score >= 80);
});

test("keyword memory search reads OCR and voice transcript metadata", () => {
  const sarah = searchMemoriesByKeyword({ query: "Sarah pricing", memories, limit: 5 });
  const john = searchMemoriesByKeyword({ query: "john gym", memories, limit: 5 });

  assert.equal(sarah[0].memory.id, "m2");
  assert.equal(john[0].memory.id, "m3");
});

test("keyword memory search handles partial text and punctuation", () => {
  const matches = searchMemoriesByKeyword({ query: "NeuroNest!!!", memories, limit: 5 });

  assert.equal(matches[0].memory.id, "m1");
});

test("vector search returns real keyword fallback when embeddings are unavailable", async () => {
  const oldOpenAiKey = process.env.OPENAI_API_KEY;
  const oldFallback = process.env.ALLOW_LOCAL_AI_FALLBACK;
  delete process.env.OPENAI_API_KEY;
  process.env.ALLOW_LOCAL_AI_FALLBACK = "false";
  try {
    const matches = await searchMemoryVectorsWithFallback({ userId: "user-1", query: "Emily", memories, limit: 5 });
    assert.equal(matches[0].memory.id, "m1");
    assert.equal(matches[0].provider, "keyword-fallback");
    assert.match(matches[0].vectorError, /OPENAI_API_KEY|embeddings/i);
  } finally {
    if (oldOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env["OPENAI_API_KEY"] = oldOpenAiKey;
    if (oldFallback === undefined) delete process.env.ALLOW_LOCAL_AI_FALLBACK;
    else process.env.ALLOW_LOCAL_AI_FALLBACK = oldFallback;
  }
});
