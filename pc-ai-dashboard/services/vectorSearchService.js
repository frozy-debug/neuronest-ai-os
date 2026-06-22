import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateEmbedding, getEmbeddingStatus } from "./embeddingService.js";
import { mergeMemorySearchMatches, searchMemoriesByKeyword } from "./memorySearchService.js";
import { memoryTextForEmbedding } from "./unifiedMemoryService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const vectorDbPath = path.join(__dirname, "..", "data", "memory_vectors.json");

function contentHash(text) {
  return cryptoHash(String(text || ""));
}

function cryptoHash(text) {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (Math.imul(31, hash) + text.charCodeAt(index)) | 0;
  }
  return String(hash >>> 0);
}

function readVectorDb() {
  if (!fs.existsSync(vectorDbPath)) return { vectors: [] };
  const db = JSON.parse(fs.readFileSync(vectorDbPath, "utf8"));
  if (process.env.ALLOW_LOCAL_AI_FALLBACK === "true") return db;
  return {
    vectors: (db.vectors || []).filter((vector) => vector.provider === "openai"),
  };
}

function writeVectorDb(db) {
  fs.mkdirSync(path.dirname(vectorDbPath), { recursive: true });
  fs.writeFileSync(vectorDbPath, JSON.stringify(db, null, 2));
}

function supabaseReady() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function vectorToPgString(embedding) {
  return `[${embedding.map((value) => Number(value).toFixed(6)).join(",")}]`;
}

export function cosineSimilarity(a, b) {
  const size = Math.min(a?.length || 0, b?.length || 0);
  if (!size) return 0;

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let index = 0; index < size; index += 1) {
    dot += a[index] * b[index];
    magnitudeA += a[index] * a[index];
    magnitudeB += b[index] * b[index];
  }

  return dot / ((Math.sqrt(magnitudeA) || 1) * (Math.sqrt(magnitudeB) || 1));
}

async function upsertSupabaseVector(vectorRecord) {
  if (!supabaseReady()) return { ok: false, skipped: true };

  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/memory_vectors?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      id: vectorRecord.id,
      memory_id: vectorRecord.memoryId,
      user_id: vectorRecord.userId,
      embedding: vectorToPgString(vectorRecord.embedding),
      type: vectorRecord.type,
      provider: vectorRecord.provider,
      model: vectorRecord.model,
      content_hash: vectorRecord.contentHash,
      created_at: vectorRecord.createdAt,
      updated_at: vectorRecord.updatedAt,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase vector upsert failed: ${body}`);
  }

  return { ok: true };
}

async function searchSupabaseVectors(userId, queryEmbedding, limit) {
  if (!supabaseReady()) return null;

  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/match_memory_vectors`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      match_user_id: userId,
      query_embedding: vectorToPgString(queryEmbedding),
      match_count: limit,
    }),
  });

  if (!response.ok) return null;
  return response.json();
}

export async function ensureMemoryVector(memory) {
  const text = memoryTextForEmbedding(memory);
  const hash = contentHash(text);
  const db = readVectorDb();
  const existing = db.vectors.find((vector) => vector.memoryId === memory.id && vector.userId === memory.userId);

  if (existing?.contentHash === hash && Array.isArray(existing.embedding)) {
    return existing;
  }

  const result = await generateEmbedding(text);
  const vectorRecord = {
    id: memory.embeddingId || `vec_${memory.userId}_${memory.id}`,
    memoryId: memory.id,
    userId: memory.userId,
    type: memory.type,
    contentHash: hash,
    embedding: result.embedding,
    provider: result.provider,
    model: result.model,
    dimensions: result.dimensions,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    warning: result.warning || null,
  };

  const nextVectors = db.vectors.filter((vector) => !(vector.memoryId === memory.id && vector.userId === memory.userId));
  nextVectors.push(vectorRecord);
  writeVectorDb({ vectors: nextVectors.slice(-5000) });

  try {
    await upsertSupabaseVector(vectorRecord);
  } catch (error) {
    vectorRecord.remoteWarning = error.message;
  }

  return vectorRecord;
}

export async function ensureMemoryVectors(memories, limit = 120) {
  const indexed = [];
  for (const memory of memories.slice(0, limit)) {
    indexed.push(await ensureMemoryVector(memory));
  }
  return indexed;
}

export async function searchMemoryVectors({ userId, query, memories, limit = 8 }) {
  const queryResult = await generateEmbedding(query);
  await ensureMemoryVectors(memories);

  const remoteMatches = await searchSupabaseVectors(userId, queryResult.embedding, limit).catch(() => null);
  const remoteIds = Array.isArray(remoteMatches) ? new Map(remoteMatches.map((match) => [match.memory_id, match.similarity])) : null;

  const db = readVectorDb();
  const vectors = db.vectors.filter((vector) => vector.userId === userId);
  const memoryById = new Map(memories.map((memory) => [memory.id, memory]));

  return vectors
    .map((vector) => {
      const memory = memoryById.get(vector.memoryId);
      if (!memory) return null;
      const similarity = remoteIds?.get(vector.memoryId) ?? cosineSimilarity(queryResult.embedding, vector.embedding);
      return {
        memory,
        similarity,
        score: Math.round(Math.max(0, similarity) * 100),
        provider: remoteIds ? "supabase-pgvector" : vector.provider,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export async function searchMemoryVectorsWithFallback({ userId, query, memories, limit = 8 }) {
  const keywordMatches = searchMemoriesByKeyword({ query, memories, limit });
  try {
    const semanticMatches = await searchMemoryVectors({ userId, query, memories, limit });
    return mergeMemorySearchMatches(semanticMatches, keywordMatches, limit);
  } catch (error) {
    if (keywordMatches.length) {
      return keywordMatches.map((match) => ({
        ...match,
        vectorError: error.message,
      }));
    }
    throw error;
  }
}

export function getVectorStatus() {
  const db = readVectorDb();
  return {
    ...getEmbeddingStatus(),
    vectorDatabase: supabaseReady() ? "supabase-pgvector" : "local-json-cache",
    supabaseReady: supabaseReady(),
    localVectorCount: db.vectors.length,
  };
}
