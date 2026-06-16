import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createChatMemoryObject, createUnifiedMemoryObject, normalizeMemoryCollection } from "./services/unifiedMemoryService.js";
import { ensureMemoryVector, getVectorStatus, searchMemoryVectors } from "./services/vectorSearchService.js";
import { buildRelationshipGraph, detectBehaviorPatterns, detectRelationships } from "./services/relationshipEngine.js";
import { buildMemoryScores, scoreMemoryImportance, scoreMemories } from "./services/memoryScoringEngine.js";
import { buildMemoryStream, generateInsightCards, generateProactiveNotifications } from "./services/insightEngine.js";
import { buildMemoryReplay } from "./services/replayEngine.js";
import { createContextualAssistantReply, createGeneralAssistantReply, createSearchAnswer } from "./services/assistantContextEngine.js";
import { buildMemoryDnaProfile } from "./services/memoryDnaService.js";
import { analyzeScreenshotMemory, analyzeVoiceMemory, analyzeVisualMemory } from "./services/multimodalMemoryService.js";
import { buildTimeline, detectTimelineStreaks } from "./services/timelineEngine.js";
import { detectLifePatterns, forgottenMemorySuggestions } from "./services/patternAnalysisEngine.js";
import { buildContextChains, fuseAssistantContext } from "./services/contextFusionEngine.js";
import { buildProfileIdentity } from "./services/profileIdentityService.js";
import { buildAutonomousCaptureDashboard, runAutonomousCapture } from "./services/passiveCaptureEngine.js";
import { buildMemoryResurfacingFeed } from "./services/memoryResurfacingEngine.js";
import { buildIntelligenceCore } from "./services/intelligenceCoreService.js";
import { buildLanguageAwareAssistantReply, localizedFallback } from "./services/languageIntelligenceService.js";
import { generateOpenAiIntelligenceReply } from "./services/openAiIntelligenceService.js";
import {
  analyzeScreenshotWithOpenAi,
  analyzeVoiceTranscriptWithOpenAi,
  getProductionAiStatus,
  transcribeAudioWithOpenAi,
} from "./services/productionAiService.js";
import { buildDecisionRecommendation, buildDigitalTwin, isDecisionQuestion } from "./services/digitalTwinService.js";
import { buildUserBrainModel, summarizeUserBrainModel } from "./services/userBrainModelService.js";
import { buildLifeOsMissionControl, normalizeGoal } from "./services/lifeOsService.js";
import { extractLearningFeatures, rebuildLearningProfile, summarizeLearningProfile, updateLearningProfile } from "./services/learningEngineService.js";
import { detectLanguage } from "./services/languageIntelligenceService.js";
import {
  answerRelationshipQuery,
  buildRelationshipIntelligence,
  buildRelationshipTimeline,
  findRelationshipById,
} from "./services/relationshipIntelligenceService.js";
import {
  buildAutomaticPlaceMemoryPayload,
  downloadGooglePlacePhoto,
  finalizePassivePlaceState,
  normalizePassivePlaceSettings,
  processPassiveLocationSample,
  resolveGooglePlaceVisit,
} from "./services/passivePlaceMemoryService.js";
import { createNeuroNestWarehouse } from "../shared/neuronest-warehouse/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv();

const PORT = Number(process.env.PORT || 3000);
const ALLOW_OFFLINE_GOOGLE_FALLBACK =
  process.env.ALLOW_OFFLINE_GOOGLE_FALLBACK !== "false" &&
  process.env.NODE_ENV !== "production" &&
  !process.env.RENDER;

const publicDir = path.join(__dirname, "public");
const dbPath = resolveStoragePath(process.env.NEURONEST_DB_PATH, "data/db.json");
const uploadsDir = resolveStoragePath(process.env.NEURONEST_UPLOADS_PATH, "data/uploads");
const warehouse = createNeuroNestWarehouse({
  dbPath,
  uploadsDir,
  appBaseUrl: process.env.NEURONEST_APP_URL || `http://localhost:${PORT}`,
});
warehouse.initialize();
const { adminSyncService, databaseService: warehouseDb, moderationService, liveMonitorService, placeService, productionStore } = warehouse;
const accountSyncClients = new Map();
let accountWatchTimer = null;
let lastAccountDbSignature = "";
const sessions = new Map();
const rateLimitBuckets = new Map();

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalIndex = trimmed.indexOf("=");
    if (equalIndex === -1) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();
    process.env[key] ||= value;
  }
}

function resolveStoragePath(configuredPath, fallbackPath) {
  const configured = String(configuredPath || "").trim();
  if (!configured) return path.resolve(__dirname, fallbackPath);
  return path.isAbsolute(configured) ? configured : path.resolve(__dirname, configured);
}

function getGoogleClientId() {
  loadEnv();
  return process.env.GOOGLE_CLIENT_ID || "";
}

function getGoogleMapsApiKey() {
  loadEnv();
  return process.env.GOOGLE_MAPS_API_KEY || "";
}

function getGooglePlacesServerApiKey() {
  loadEnv();
  return process.env.GOOGLE_PLACES_SERVER_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
}

function getClientMeta(req, body = {}) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || "unknown";
  return {
    ip,
    userAgent: req.headers["user-agent"] || body.device?.userAgent || "",
    country: body.network?.country || "Unknown",
    region: body.network?.region || "Unknown",
    city: body.network?.city || "Unknown",
    device: body.device || {},
    page: body.page || "home",
  };
}

function syncLiveAction(userId, action, meta = {}) {
  if (!userId) return;
  try {
    const db = readDb();
    liveMonitorService.recordLiveAction(db, userId, action, meta);
    writeDb(db);
  } catch {
    // Live monitoring must never block user flows.
  }
}

function readDb() {
  return warehouseDb.readDb();
}

function writeDb(db) {
  warehouseDb.writeDb(db);
  scheduleAccountBroadcast();
}

function persistIntelligenceRecord(userId, collection, record) {
  const db = readDb();
  const saved = adminSyncService.syncIntelligenceRecord(db, collection, userId, record);
  writeDb(db);
  if (saved && productionStore.ready()) {
    void productionStore.upsertIntelligence(userId, collection, saved).catch(() => {});
  }
  return saved;
}

function persistRelationshipIntelligenceSnapshot(userId, snapshot, trigger = "rebuild") {
  const db = readDb();
  warehouseDb.normalizeWarehouse(db);
  const filterOut = (list) => list.filter((item) => item.userId !== userId);
  db.warehouse.relationshipProfiles = [
    ...snapshot.relationships.map((item) => ({ ...item, trigger })),
    ...filterOut(db.warehouse.relationshipProfiles),
  ].slice(0, 10_000);
  db.warehouse.relationshipEvents = [
    ...snapshot.events.map((item) => ({ ...item, trigger })),
    ...filterOut(db.warehouse.relationshipEvents),
  ].slice(0, 20_000);
  db.warehouse.relationshipInsights = [
    ...snapshot.insights.map((item) => ({ ...item, trigger })),
    ...filterOut(db.warehouse.relationshipInsights),
  ].slice(0, 10_000);
  db.warehouse.relationshipClusters = [
    ...snapshot.clusters.map((item) => ({ ...item, trigger })),
    ...filterOut(db.warehouse.relationshipClusters),
  ].slice(0, 5_000);
  adminSyncService.syncIntelligenceRecord(db, "insights", userId, {
    id: `relationship-intelligence_${userId}`,
    type: "relationship-intelligence",
    trigger,
    insights: snapshot.insights.slice(0, 12),
    evidenceMemoryCount: snapshot.events.length,
    relationshipCount: snapshot.relationships.length,
  });
  writeDb(db);
  if (productionStore.ready()) {
    void productionStore.replaceRelationshipIntelligence(userId, snapshot).catch(() => {});
  }
  return snapshot;
}

function recordAiUsage(userId, capability, status = "completed", metadata = {}) {
  return persistIntelligenceRecord(userId, "aiUsage", {
    id: crypto.randomUUID(),
    capability,
    type: capability,
    status,
    metadata,
    timestamp: new Date().toISOString(),
  });
}

async function ensureAndPersistMemoryVector(memory) {
  const vector = await ensureMemoryVector(memory);
  persistIntelligenceRecord(memory.userId, "embeddings", {
    id: vector.id,
    memoryId: memory.id,
    type: memory.type,
    provider: vector.provider,
    model: vector.model,
    dimensions: vector.dimensions,
    contentHash: vector.contentHash,
    remoteWarning: vector.remoteWarning || null,
  });
  return vector;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
  };
}

function getPassivePlaceSettings(userId) {
  const user = getUserById(userId);
  return normalizePassivePlaceSettings(user?.settings?.passivePlaceMemory || {});
}

function savePassivePlaceSettings(userId, patch = {}) {
  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) throw new Error("User not found.");
  user.settings ||= {};
  user.settings.passivePlaceMemory = normalizePassivePlaceSettings({
    ...(user.settings.passivePlaceMemory || {}),
    ...patch,
  });
  user.updatedAt = new Date().toISOString();
  writeDb(db);
  if (productionStore.ready()) void productionStore.upsertUser(user).catch(() => {});
  return user.settings.passivePlaceMemory;
}

function upsertUser(profile) {
  const db = readDb();
  const existing = db.users.find((user) => user.googleSub === profile.googleSub || user.email === profile.email);
  const now = new Date().toISOString();

  if (existing) {
    existing.name = profile.name;
    existing.picture = profile.picture;
    existing.lastLoginAt = now;
    adminSyncService.syncUserLogin(db, existing, { isNew: false });
    writeDb(db);
    if (productionStore.ready()) void productionStore.upsertUser(existing).catch(() => {});
    return existing;
  }

  const user = {
    id: crypto.randomUUID(),
    googleSub: profile.googleSub,
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    createdAt: now,
    lastLoginAt: now,
  };

  db.users.push(user);
  db.chats[user.id] = [];
  adminSyncService.syncUserLogin(db, user, { isNew: true });
  writeDb(db);
  if (productionStore.ready()) void productionStore.upsertUser(user).catch(() => {});
  return user;
}

function saveChatMessage(userId, role, content) {
  const db = readDb();
  db.chats[userId] ||= [];
  const message = {
    id: crypto.randomUUID(),
    role,
    content,
    createdAt: new Date().toISOString(),
  };

  db.chats[userId].push(message);
  db.chats[userId] = db.chats[userId].slice(-50);
  writeDb(db);
  recordLearningSignal(userId, {
    eventType: role === "user" ? "conversation-user" : "conversation-ai",
    text: content,
    timestamp: message.createdAt,
    signal: role === "user" ? "neutral" : "positive",
  });
  return message;
}

function getChatHistory(userId) {
  const db = readDb();
  return db.chats[userId] || [];
}

function getUserById(userId) {
  const db = readDb();
  return db.users.find((user) => user.id === userId) || null;
}

function getStoredUserBrainModel(userId) {
  const db = readDb();
  return db.brainModels?.[userId] || null;
}

function saveUserBrainModel(userId, model) {
  const db = readDb();
  db.brainModels ||= {};
  db.brainModels[userId] = model;
  writeDb(db);
  return model;
}

function getLearningProfile(userId) {
  const db = readDb();
  return db.learningProfiles?.[userId] || null;
}

function saveLearningProfile(userId, profile) {
  const db = readDb();
  db.learningProfiles ||= {};
  db.learningProfiles[userId] = profile;
  writeDb(db);
  return profile;
}

function recordLearningSignal(userId, event = {}) {
  if (!userId) return null;
  try {
    const text = String(event.text || event.title || event.content || "").trim();
    const language = event.language || detectLanguage(text);
    const previous = getLearningProfile(userId);
    const profile = updateLearningProfile(previous, {
      userId,
      timestamp: event.timestamp || new Date().toISOString(),
      eventType: event.eventType || "interaction",
      text,
      language,
      signal: event.signal || "neutral",
      goalTitle: event.goalTitle || "",
      memoryImportance: event.memoryImportance || 50,
      features: event.features || extractLearningFeatures({
        text,
        language,
        eventType: event.eventType || "interaction",
        timestamp: event.timestamp || new Date().toISOString(),
      }),
    });
    return saveLearningProfile(userId, profile);
  } catch {
    return null;
  }
}

function getLifeGoals(userId) {
  const db = readDb();
  db.lifeGoals ||= {};
  return (db.lifeGoals[userId] || []).map(normalizeGoal).sort((a, b) => {
    const priorityRank = { high: 3, medium: 2, low: 1 };
    return (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0) || new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

function saveLifeGoals(userId, goals) {
  const db = readDb();
  db.lifeGoals ||= {};
  db.lifeGoals[userId] = goals.map(normalizeGoal);
  writeDb(db);
  return db.lifeGoals[userId];
}

function createLifeGoal(userId, data = {}) {
  const title = String(data.title || "").trim();
  if (!title) throw new Error("Goal title is required.");
  if (title.length > 120) throw new Error("Goal title is too long.");

  const now = new Date().toISOString();
  const tags = String(data.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
  const goal = normalizeGoal({
    id: crypto.randomUUID(),
    title,
    description: data.description || "",
    category: data.category || "life",
    priority: data.priority || "medium",
    progress: data.progress || 0,
    status: "active",
    targetDate: data.targetDate || "",
    tags,
    createdAt: now,
    updatedAt: now,
  });
  const db = readDb();
  db.lifeGoals ||= {};
  const goals = (db.lifeGoals[userId] || []).map(normalizeGoal);
  goals.unshift(goal);
  db.lifeGoals[userId] = goals.map(normalizeGoal);
  adminSyncService.syncGoal(db, userId, goal, "GOAL_CREATED");
  writeDb(db);
  if (productionStore.ready()) void productionStore.upsertGoal(userId, goal).catch(() => {});
  recordLearningSignal(userId, {
    eventType: "goal-created",
    text: `${goal.title} ${goal.description}`,
    goalTitle: goal.title,
    timestamp: goal.createdAt,
    signal: "positive",
  });
  return goal;
}

function updateLifeGoal(userId, goalId, patch = {}) {
  const db = readDb();
  db.lifeGoals ||= {};
  const goals = (db.lifeGoals[userId] || []).map(normalizeGoal);
  const index = goals.findIndex((goal) => goal.id === goalId);
  if (index === -1) return null;
  const existing = goals[index];
  const next = normalizeGoal({
    ...existing,
    ...patch,
    id: existing.id,
    tags: Array.isArray(patch.tags) ? patch.tags : existing.tags,
    updatedAt: new Date().toISOString(),
  });
  goals[index] = next;
  db.lifeGoals[userId] = goals.map(normalizeGoal);
  adminSyncService.syncGoal(db, userId, next, "GOAL_UPDATED");
  writeDb(db);
  if (productionStore.ready()) void productionStore.upsertGoal(userId, next).catch(() => {});
  recordLearningSignal(userId, {
    eventType: next.status === "completed" ? "task-completed" : next.status === "paused" ? "project-abandoned" : "goal-updated",
    text: `${next.title} ${next.description}`,
    goalTitle: next.title,
    timestamp: next.updatedAt,
    signal: next.status === "completed" || Number(next.progress || 0) > Number(existing.progress || 0) ? "positive" : next.status === "paused" ? "negative" : "neutral",
  });
  return next;
}

function cleanEntryKind(kind) {
  const allowedKinds = new Set([
    "note",
    "memory",
    "place",
    "insight",
    "tag",
    "voice",
    "screenshot",
    "journal",
    "workout",
    "idea",
    "focus",
    "travel",
    "recap",
    "ai-chat",
    "timeline",
  ]);
  return allowedKinds.has(kind) ? kind : "memory";
}

function publicEntry(entry) {
  return {
    id: entry.id,
    type: entry.type || entry.kind,
    kind: entry.kind,
    source: entry.source || entry.metadata?.captureSource || "",
    title: entry.title,
    body: entry.body,
    meta: entry.meta,
    tags: entry.tags,
    summary: entry.summary || "",
    emotions: entry.emotions || [],
    importanceScore: entry.importanceScore || null,
    aiScore: entry.aiScore || null,
    location: entry.location || null,
    media: entry.media || null,
    metadata: entry.metadata || {},
    embeddingId: entry.embeddingId || null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt || entry.createdAt,
    deletedAt: entry.deletedAt || null,
  };
}

function getEntries(userId, { includeDeleted = false } = {}) {
  const db = readDb();
  const entries = db.entries[userId] || [];
  return entries
    .filter((entry) => includeDeleted || !entry.deletedAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicEntry);
}

async function createEntry(userId, data) {
  const db = readDb();
  db.entries[userId] ||= [];

  const title = String(data.title || "").trim();
  const body = String(data.body || "").trim();
  const meta = String(data.meta || "").trim();
  const tags = String(data.tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 8);
  const filePayload =
    data.imageData || data.audioData || data.fileData
      ? {
          dataUrl: data.imageData || data.audioData || data.fileData,
          fileName: data.fileName || data.media?.fileName || title,
          mimeType: data.mimeType || data.media?.mimeType || "",
          storagePrefix: data.storagePrefix || "",
        }
      : null;

  if (!title) throw new Error("Title is required.");
  if (title.length > 120) throw new Error("Title is too long.");
  const bodyLimit = ["voice", "screenshot"].includes(cleanEntryKind(data.type || data.kind)) ? 12_000 : 1_000;
  if (body.length > bodyLimit) throw new Error("Entry details are too long.");

  const entry = {
    id: crypto.randomUUID(),
    kind: cleanEntryKind(data.kind),
    type: cleanEntryKind(data.type || data.kind),
    title,
    body,
    meta,
    tags,
    summary: String(data.summary || body || title).slice(0, 260),
    emotions: [],
    importanceScore: 50,
    aiScore: 50,
    location: data.location || null,
    relatedMemories: [],
    behaviorPatterns: [],
    aiInsights: [],
    media: data.media || null,
    source: String(data.source || "manual").slice(0, 60),
    metadata: data.metadata || {},
    createdAt: data.createdAt && !Number.isNaN(new Date(data.createdAt).getTime()) ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  };

  if (entry.type === "voice" || entry.kind === "voice") {
    const voiceAnalysis = data.aiAnalysis || await analyzeVoiceMemory({
      transcript: body,
      title,
      duration: meta,
      tags,
    });
    entry.summary = voiceAnalysis.summary;
    entry.emotions = voiceAnalysis.emotions;
    entry.importanceScore = voiceAnalysis.importanceScore;
    entry.tags = [...new Set([...entry.tags, ...voiceAnalysis.tags])].slice(0, 10);
    entry.metadata = { ...entry.metadata, ...voiceAnalysis.metadata };
  }

  if (entry.type === "screenshot") {
    const screenshotAnalysis = data.aiAnalysis || await analyzeScreenshotMemory({
      text: entry.metadata?.ocrText || body,
      fileName: entry.metadata?.fileName || title,
      mimeType: entry.metadata?.mimeType || "",
      size: entry.metadata?.size || 0,
    });
    entry.summary = screenshotAnalysis.summary;
    entry.emotions = screenshotAnalysis.emotions;
    entry.importanceScore = screenshotAnalysis.importanceScore;
    entry.tags = [...new Set([...entry.tags, ...screenshotAnalysis.tags])].slice(0, 10);
    entry.media = screenshotAnalysis.media;
    entry.metadata = { ...entry.metadata, ...screenshotAnalysis.metadata };
  }

  const memory = createUnifiedMemoryObject(entry, userId, data.source || entry.kind);
  const scoring = scoreMemoryImportance(memory);
  entry.emotions = entry.emotions.length ? entry.emotions : memory.emotions;
  entry.importanceScore = Math.max(entry.importanceScore, scoring.importanceScore);
  entry.aiScore = scoring.memoryStrength;

  db.entries[userId].push(entry);
  writeDb(db);
  recordLearningSignal(userId, {
    eventType: "memory-saved",
    text: `${entry.title} ${entry.body} ${entry.summary} ${entry.tags.join(" ")}`,
    timestamp: entry.createdAt,
    signal: "positive",
    memoryImportance: entry.importanceScore || entry.aiScore || 50,
  });

  try {
    const vector = await ensureMemoryVector(createUnifiedMemoryObject(entry, userId, data.source || entry.kind));
    entry.embeddingId = vector.id;
    entry.embeddingProvider = vector.provider;
    entry.updatedAt = new Date().toISOString();
    adminSyncService.syncIntelligenceRecord(db, "embeddings", userId, {
      id: vector.id,
      memoryId: entry.id,
      type: entry.type,
      provider: vector.provider,
      model: vector.model,
      dimensions: vector.dimensions,
      contentHash: vector.contentHash,
      remoteWarning: vector.remoteWarning || null,
    });
    writeDb(db);
  } catch (error) {
    entry.embeddingError = error.message;
    adminSyncService.syncIntelligenceRecord(db, "aiJobs", userId, {
      id: `embedding_${entry.id}`,
      capability: "embedding",
      memoryId: entry.id,
      status: "failed",
      error: error.message,
    });
    writeDb(db);
  }

  try {
    refreshUserBrainModelForUserId(userId, { trigger: "memory-created", activity: title });
  } catch {
    // Continuous learning should never block saving a memory.
  }

  adminSyncService.syncEntry(db, userId, entry, filePayload);
  writeDb(db);

  if (productionStore.ready()) {
    try {
      const user = getUserById(userId);
      if (user) await productionStore.upsertUser(user);
      await productionStore.upsertMemory(userId, entry, filePayload);
      entry.productionSync = { provider: "supabase", status: "completed", syncedAt: new Date().toISOString() };
      writeDb(db);
    } catch (error) {
      entry.productionSync = { provider: "supabase", status: "failed", error: error.message, syncedAt: new Date().toISOString() };
      writeDb(db);
    }
  }

  try {
    await persistDerivedIntelligenceForUserId(userId, "memory-created");
  } catch {
    // Derived intelligence must not block a successfully stored memory.
  }

  const kind = String(entry.type || entry.kind || "").toLowerCase();
  if (kind.includes("screenshot")) syncLiveAction(userId, "SCREENSHOT_UPLOADED", { page: "memories", label: "Uploading Screenshot" });
  else if (kind.includes("voice")) syncLiveAction(userId, "VOICE_ASSISTANT", { page: "voice", label: "Voice Assistant" });
  else if (kind.includes("place")) syncLiveAction(userId, "PLACE_SAVED", { page: "places", label: "Saving Place" });
  else syncLiveAction(userId, "MEMORY_CREATED", { page: "memories", label: "Creating Memory" });

  return publicEntry(entry);
}

async function persistPassivePlaceVisit(userId, rawVisit, existingEntryId = null) {
  const apiKey = getGooglePlacesServerApiKey();
  let visit = { ...rawVisit };
  let photoPayload = null;
  let metadataError = null;

  try {
    visit = await resolveGooglePlaceVisit(visit, apiKey);
    if (visit.photoName) {
      try {
        photoPayload = await downloadGooglePlacePhoto(visit.photoName, apiKey);
      } catch (error) {
        visit.photoError = error.message;
      }
    }
  } catch (error) {
    metadataError = error.message;
    visit.metadataStatus = "pending";
    visit.metadataError = metadataError;
  }

  let entry;
  if (!existingEntryId) {
    entry = await createEntry(userId, buildAutomaticPlaceMemoryPayload(visit, photoPayload));
  } else {
    const db = readDb();
    const stored = (db.entries[userId] || []).find((item) => item.id === existingEntryId);
    if (!stored) throw new Error("Passive place memory entry not found.");
    const payload = buildAutomaticPlaceMemoryPayload(visit, photoPayload);
    Object.assign(stored, {
      title: payload.title,
      body: payload.body,
      summary: payload.summary,
      meta: payload.meta,
      tags: String(payload.tags).split(",").map((tag) => tag.trim()).filter(Boolean),
      location: payload.location,
      media: payload.media || stored.media,
      metadata: { ...(stored.metadata || {}), ...payload.metadata },
      updatedAt: new Date().toISOString(),
    });
    adminSyncService.syncEntry(db, userId, stored, photoPayload ? { ...photoPayload, storagePrefix: "places" } : null);
    writeDb(db);
    if (productionStore.ready()) {
      await productionStore.upsertMemory(userId, stored, photoPayload ? { ...photoPayload, storagePrefix: "places" } : null);
    }
    entry = publicEntry(stored);
  }

  const db = readDb();
  const queueItem = db.warehouse.placeMetadataQueue.find((item) => item.visitId === visit.id && item.userId === userId);
  const placeMemory = {
    ...visit,
    userId,
    memoryId: entry.id,
    entryId: entry.id,
    photoUrl: photoPayload && process.env.SUPABASE_URL
      ? `${String(process.env.SUPABASE_URL || "").replace(/\/$/, "")}/storage/v1/object/authenticated/${process.env.SUPABASE_MEDIA_BUCKET || "neuronest-media"}/places/${userId}/${entry.id}/${photoPayload.fileName}`
      : visit.photoUrl || null,
    updatedAt: new Date().toISOString(),
  };
  const index = db.warehouse.placeMemories.findIndex((item) => item.id === visit.id && item.userId === userId);
  if (index === -1) db.warehouse.placeMemories.unshift(placeMemory);
  else db.warehouse.placeMemories[index] = { ...db.warehouse.placeMemories[index], ...placeMemory };
  if (queueItem) {
    queueItem.attempts = Number(queueItem.attempts || 0) + 1;
    queueItem.lastAttemptAt = new Date().toISOString();
    queueItem.memoryId = entry.id;
    queueItem.status = metadataError ? "pending" : "completed";
    queueItem.error = metadataError;
    queueItem.nextAttemptAt = metadataError ? new Date(Date.now() + 30 * 60_000).toISOString() : null;
  }
  writeDb(db);
  if (productionStore.ready()) {
    void productionStore.upsertPlaceMemory(userId, placeMemory).catch(() => {});
  }
  return { visit: placeMemory, entry, metadataError };
}

async function retryPendingPlaceMetadata(userId, limit = 5) {
  const db = readDb();
  const queue = db.warehouse.placeMetadataQueue
    .filter((item) => item.userId === userId && item.status !== "completed" && new Date(item.nextAttemptAt || 0).getTime() <= Date.now())
    .slice(0, limit);
  const results = [];
  for (const item of queue) {
    const visit = db.warehouse.placeMemories.find((record) => record.id === item.visitId && record.userId === userId);
    if (!visit) continue;
    try {
      results.push(await persistPassivePlaceVisit(userId, visit, item.memoryId || visit.memoryId));
    } catch (error) {
      results.push({ visitId: item.visitId, error: error.message });
    }
  }
  return results;
}

async function retryAllPendingPlaceMetadata() {
  const db = readDb();
  const userIds = [...new Set(
    db.warehouse.placeMetadataQueue
      .filter((item) => item.status !== "completed" && new Date(item.nextAttemptAt || 0).getTime() <= Date.now())
      .map((item) => item.userId),
  )].slice(0, 10);
  for (const userId of userIds) {
    await retryPendingPlaceMetadata(userId, 1).catch(() => {});
  }
}

function setEntryDeleted(userId, entryId, deleted) {
  const db = readDb();
  db.entries[userId] ||= [];
  const entry = db.entries[userId].find((item) => item.id === entryId);

  if (!entry) return null;
  entry.deletedAt = deleted ? new Date().toISOString() : null;
  if (deleted) {
    adminSyncService.syncEntryDeleted(db, userId, entryId);
  } else {
    adminSyncService.syncEntry(db, userId, entry);
  }
  writeDb(db);
  recordLearningSignal(userId, {
    eventType: deleted ? "memory-deleted" : "memory-restored",
    text: `${entry.title} ${entry.body} ${Array.isArray(entry.tags) ? entry.tags.join(" ") : ""}`,
    timestamp: new Date().toISOString(),
    signal: deleted ? "negative" : "positive",
    memoryImportance: entry.importanceScore || entry.aiScore || 50,
  });
  return publicEntry(entry);
}

function userEntryRecords(userId) {
  return getEntries(userId).map((entry) => ({
    ...entry,
    mood: inferMood(entry),
    score: scoreEntry(entry),
    location: inferLocation(entry),
  }));
}

function chatMemoryRecords(userId) {
  return getChatHistory(userId)
    .slice(-30)
    .map((message) => ({
      id: `chat-${message.id}`,
      kind: "ai-chat",
      title: message.role === "user" ? "User conversation memory" : "AI assistant response",
      body: message.content,
      meta: message.role,
      tags: ["chat", message.role],
      createdAt: message.createdAt,
      mood: inferMood({ title: message.role, body: message.content, tags: ["chat"] }),
      score: 62,
      location: null,
    }));
}

function allMemoryRecords(userId) {
  return [...userEntryRecords(userId), ...chatMemoryRecords(userId)].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
}

function allUnifiedMemories(userId) {
  const memories = normalizeMemoryCollection(allMemoryRecords(userId), userId, "memory-os");
  const relationships = detectRelationships(memories);
  return scoreMemories(memories, relationships).map((memory) => ({
    ...memory,
    metadata: {
      ...(memory.metadata || {}),
      visualAnalysis: analyzeVisualMemory(memory),
    },
  }));
}

async function buildResurfacingResponse(userId, context = {}) {
  const memories = allUnifiedMemories(userId);
  const relationships = detectRelationships(memories);
  const query = String(context.query || context.activity || context.project || "").trim();
  const semanticMatches = query
    ? await searchMemoryVectors({ userId, query, memories, limit: 8 }).catch(() => [])
    : [];
  return buildMemoryResurfacingFeed({ memories, relationships, context, semanticMatches });
}

function buildRelationshipIntelligenceForUser(userId, { persist = false, trigger = "read" } = {}) {
  const db = readDb();
  const snapshot = buildRelationshipIntelligence({
    userId,
    memories: allUnifiedMemories(userId),
    chats: getChatHistory(userId),
    places: placeService.getUserPlaceMemories(db, userId, 10_000),
  });
  return persist ? persistRelationshipIntelligenceSnapshot(userId, snapshot, trigger) : snapshot;
}

async function buildIntelligenceCoreResponse(user, context = {}) {
  const memories = allUnifiedMemories(user.id);
  const relationships = detectRelationships(memories);
  const patterns = detectLifePatterns(memories, relationships);
  const dna = buildMemoryDnaProfile(memories, relationships);
  const resurfacing = await buildResurfacingResponse(user.id, context);
  const core = buildIntelligenceCore({
    user,
    memories,
    relationships,
    patterns,
    dna,
    resurfacing,
    languageInput: context.query || context.message || context.activity || "",
    chatHistory: getChatHistory(user.id),
  });
  const userBrainModel = getStoredUserBrainModel(user.id) || buildAndPersistUserBrainModel(user, { ...context, trigger: "intelligence-core" });
  const learningProfile = buildLearningEngineResponse(user, { context: { activity: context.activity || context.query || "intelligence core" } });
  return {
    ...core,
    version: "NeuroNest Intelligence Core v3",
    userBrainModel: summarizeUserBrainModel(userBrainModel),
    learningProfile,
  };
}

async function buildDigitalTwinResponse(user, context = {}) {
  const memories = allUnifiedMemories(user.id);
  const relationships = detectRelationships(memories);
  const dna = buildMemoryDnaProfile(memories, relationships);
  const intelligenceCore = await buildIntelligenceCoreResponse(user, context);
  const peopleRelationships = buildRelationshipIntelligenceForUser(user.id);
  const digitalTwin = buildDigitalTwin({ user, memories, relationships, intelligenceCore, dna, peopleRelationships });
  persistIntelligenceRecord(user.id, "digitalTwins", {
    id: `digital-twin_${user.id}`,
    snapshot: digitalTwin,
    memoryCount: memories.length,
    relationshipCount: relationships.length + peopleRelationships.relationships.length,
  });
  return digitalTwin;
}

async function persistDerivedIntelligenceForUserId(userId, trigger = "interaction") {
  const user = getUserById(userId);
  if (!user) return null;
  const memories = allUnifiedMemories(userId);
  const relationships = detectRelationships(memories);
  const predictions = [...buildPredictions(allMemoryRecords(userId)), ...generateProactiveNotifications(memories, relationships)].slice(0, 12);
  const replay = buildMemoryReplay(memories, relationships, "day", "today");
  const insights = generateInsightCards(memories, relationships);
  const relationshipIntelligence = buildRelationshipIntelligenceForUser(userId, { persist: true, trigger });

  persistIntelligenceRecord(userId, "relationships", {
    id: `relationships_${userId}`,
    trigger,
    relationships,
    patterns: detectBehaviorPatterns(memories, relationships),
    memoryCount: memories.length,
  });
  persistIntelligenceRecord(userId, "predictions", {
    id: `predictions_${userId}`,
    trigger,
    predictions,
    evidenceMemoryCount: memories.length,
  });
  persistIntelligenceRecord(userId, "replays", {
    id: `replay_${userId}_day_today`,
    trigger,
    range: "day",
    mode: "today",
    replay,
    memoryCount: memories.length,
  });
  persistIntelligenceRecord(userId, "insights", {
    id: `insights_${userId}`,
    trigger,
    insights,
    evidenceMemoryCount: memories.length,
  });
  persistIntelligenceRecord(userId, "insights", {
    id: `relationship-insights_${userId}`,
    trigger,
    insights: relationshipIntelligence.insights.slice(0, 12),
    evidenceMemoryCount: relationshipIntelligence.events.length,
    relationshipCount: relationshipIntelligence.relationships.length,
  });
  await buildDigitalTwinResponse(user, { activity: trigger, trigger });
  return { relationships, predictions, replay, insights, relationshipIntelligence };
}

function buildLearningEngineResponse(user, { rebuild = false, context = {} } = {}) {
  const previous = getLearningProfile(user.id);
  const goals = getLifeGoals(user.id);
  let profile = previous;

  if (rebuild || !profile) {
    profile = rebuildLearningProfile({
      userId: user.id,
      previousProfile: previous,
      memories: allUnifiedMemories(user.id),
      chats: getChatHistory(user.id),
      goals,
    });
    saveLearningProfile(user.id, profile);
  } else if (context.text || context.activity || context.query) {
    profile = recordLearningSignal(user.id, {
      eventType: context.eventType || "learning-loop",
      text: context.text || context.activity || context.query,
      signal: context.signal || "neutral",
      goalTitle: context.goalTitle || "",
    }) || profile;
  }

  return summarizeLearningProfile(profile);
}

async function buildLifeOsResponse(user, context = {}) {
  const memories = allUnifiedMemories(user.id);
  const relationships = detectRelationships(memories);
  const dna = buildMemoryDnaProfile(memories, relationships);
  const intelligenceCore = await buildIntelligenceCoreResponse(user, {
    ...context,
    activity: context.activity || "mission control",
    focusState: context.focusState || "goal execution",
  });
  const peopleRelationships = buildRelationshipIntelligenceForUser(user.id);
  const digitalTwin = buildDigitalTwin({ user, memories, relationships, intelligenceCore, dna, peopleRelationships });
  const userBrainModel = getStoredUserBrainModel(user.id) || buildAndPersistUserBrainModel(user, { trigger: "life-os", activity: context.activity || "mission control" });
  const learningProfile = buildLearningEngineResponse(user, { context: { activity: context.activity || "mission control" } });
  return buildLifeOsMissionControl({
    goals: getLifeGoals(user.id),
    memories,
    relationships,
    digitalTwin,
    userBrainModel: { ...summarizeUserBrainModel(userBrainModel), learningProfile },
  });
}

function buildAndPersistUserBrainModel(user, context = {}) {
  const memories = allUnifiedMemories(user.id);
  const relationships = detectRelationships(memories);
  const dna = buildMemoryDnaProfile(memories, relationships);
  const peopleRelationships = buildRelationshipIntelligenceForUser(user.id);
  const digitalTwin = buildDigitalTwin({ user, memories, relationships, dna, peopleRelationships });
  const previousModel = getStoredUserBrainModel(user.id);
  const model = buildUserBrainModel({
    user,
    memories,
    relationships,
    chatHistory: getChatHistory(user.id),
    digitalTwin,
    previousModel,
    context,
  });
  return saveUserBrainModel(user.id, model);
}

function refreshUserBrainModelForUserId(userId, context = {}) {
  const user = getUserById(userId);
  if (!user) return null;
  return buildAndPersistUserBrainModel(user, context);
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function inferMood(entry) {
  const text = `${entry.title} ${entry.body} ${entry.tags?.join(" ") || ""}`.toLowerCase();
  if (/(happy|great|love|excited|inspired|win|good)/.test(text)) return "happy";
  if (/(stress|sad|angry|tired|bad|blocked)/.test(text)) return "heavy";
  if (/(gym|workout|run|health|fitness)/.test(text)) return "energized";
  if (/(idea|ai|startup|build|code|focus)/.test(text)) return "focused";
  return "neutral";
}

function scoreEntry(entry) {
  const tags = Array.isArray(entry.tags) ? entry.tags.length : 0;
  const bodyLength = String(entry.body || "").length;
  return Math.min(98, 58 + tags * 5 + Math.floor(bodyLength / 70));
}

function inferLocation(entry) {
  const text = `${entry.title} ${entry.body} ${entry.meta}`.toLowerCase();
  const base = { lat: 30.3782, lng: 76.7767 };
  if (text.includes("cafe") || text.includes("coffee")) return { lat: 30.3646, lng: 76.7819, label: "Cafe memory" };
  if (text.includes("restaurant") || text.includes("food")) return { lat: 30.3749, lng: 76.7728, label: "Food memory" };
  if (text.includes("gym") || text.includes("workout") || text.includes("fitness")) return { lat: 30.3717, lng: 76.7891, label: "Fitness memory" };
  if (text.includes("travel") || text.includes("trip")) return { lat: 30.3856, lng: 76.7623, label: "Travel memory" };

  const jitterSeed = tokenize(entry.title).join("").length || 1;
  return {
    lat: base.lat + ((jitterSeed % 7) - 3) * 0.002,
    lng: base.lng + ((jitterSeed % 5) - 2) * 0.002,
    label: "Memory zone",
  };
}

function kindCounts(records) {
  return records.reduce((counts, record) => {
    counts[record.kind] = (counts[record.kind] || 0) + 1;
    return counts;
  }, {});
}

function topTags(records) {
  const tags = new Map();
  records.forEach((record) => {
    (record.tags || []).forEach((tag) => tags.set(tag, (tags.get(tag) || 0) + 1));
  });

  return [...tags.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([tag, count]) => ({ tag, count }));
}

function productivityWindow(records) {
  const buckets = new Map();
  records.forEach((record) => {
    const hour = new Date(record.createdAt).getHours();
    const bucket = hour < 10 ? "6AM-10AM" : hour < 13 ? "10AM-1PM" : hour < 18 ? "1PM-6PM" : "6PM-12AM";
    buckets.set(bucket, (buckets.get(bucket) || 0) + record.score);
  });

  return [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "10AM-1PM";
}

function buildInsightCards(records) {
  const counts = kindCounts(records);
  const cafeCount = records.filter((record) => /cafe|coffee/i.test(`${record.title} ${record.body} ${record.tags?.join(" ")}`)).length;
  const focusWindow = productivityWindow(records);
  const moodCounts = records.reduce((countsByMood, record) => {
    countsByMood[record.mood] = (countsByMood[record.mood] || 0) + 1;
    return countsByMood;
  }, {});
  const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "focused";

  return [
    {
      title: `Peak focus: ${focusWindow}`,
      body: `Your strongest memory/productivity cluster is currently around ${focusWindow}.`,
      signal: "Productivity timing",
      strength: 92,
    },
    {
      title: `Cafe pattern detected`,
      body: `You have ${cafeCount || 1} cafe-linked memories. These often connect with startup and AI ideas.`,
      signal: "Repeated places",
      strength: 84,
    },
    {
      title: `${counts.place || 0} place memories`,
      body: "Places are becoming one of your strongest memory anchors.",
      signal: "Movement pattern",
      strength: 78,
    },
    {
      title: `Mood trend: ${dominantMood}`,
      body: `Recent memories lean ${dominantMood}, based on notes, tags, and activity context.`,
      signal: "Emotional pattern",
      strength: 73,
    },
  ];
}

function buildHeatmap(records, range = "week") {
  const rangeBoost = range === "day" ? 1.4 : range === "month" ? 0.78 : 1;
  return records
    .filter((record) => record.location)
    .map((record) => ({
      id: record.id,
      title: record.title,
      lat: record.location.lat,
      lng: record.location.lng,
      label: record.location.label,
      kind: record.kind,
      intensity: Math.max(0.25, Math.min(1, (record.score / 100) * rangeBoost)),
      productivity: record.score,
      mood: record.mood,
    }));
}

function buildGraph(records) {
  const nodes = records.slice(0, 18).map((record, index) => ({
    id: record.id,
    label: record.title,
    kind: record.kind,
    mood: record.mood,
    x: 160 + Math.cos(index * 0.78) * (120 + (index % 3) * 42),
    y: 150 + Math.sin(index * 0.78) * (92 + (index % 4) * 30),
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = [];

  for (let i = 0; i < records.length; i += 1) {
    for (let j = i + 1; j < records.length; j += 1) {
      if (!nodeById.has(records[i].id) || !nodeById.has(records[j].id)) continue;
      const sharedTags = (records[i].tags || []).filter((tag) => (records[j].tags || []).includes(tag));
      const sharedWords = tokenize(`${records[i].title} ${records[i].body}`).filter((token) =>
        tokenize(`${records[j].title} ${records[j].body}`).includes(token),
      );

      if (sharedTags.length || sharedWords.length > 1 || records[i].kind === records[j].kind) {
        edges.push({
          source: records[i].id,
          target: records[j].id,
          reason: sharedTags[0] || sharedWords[0] || records[i].kind,
          strength: Math.min(1, 0.35 + sharedTags.length * 0.18 + sharedWords.length * 0.06),
        });
      }
    }
  }

  return { nodes, edges: edges.slice(0, 32) };
}

function rankSearch(records, query) {
  const queryTokens = tokenize(query);
  const intentAliases = {
    happiest: ["happy", "inspired", "excited", "love"],
    cafe: ["cafe", "coffee", "startup", "focus"],
    cafes: ["cafe", "coffee", "startup", "focus"],
    friday: ["restaurant", "evening", "food"],
    productive: ["focus", "coding", "planning", "productivity"],
  };
  const expandedTokens = new Set(queryTokens);
  queryTokens.forEach((token) => (intentAliases[token] || []).forEach((alias) => expandedTokens.add(alias)));

  return records
    .map((record) => {
      const text = `${record.title} ${record.body} ${record.meta} ${record.tags?.join(" ")} ${record.mood}`;
      const tokens = tokenize(text);
      const overlap = [...expandedTokens].filter((token) => tokens.includes(token));
      const score = overlap.length * 18 + (record.score || 50) * 0.28 + (record.kind === "place" && expandedTokens.has("where") ? 12 : 0);
      return {
        id: record.id,
        kind: record.kind,
        title: record.title,
        body: record.body,
        meta: record.meta,
        tags: record.tags,
        score: Math.round(score),
        reason: overlap.length ? `Matched ${overlap.slice(0, 3).join(", ")}` : "Ranked by recent memory context",
      };
    })
    .filter((item) => item.score > 20)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

function classifyScreenshotText(text, fileName = "") {
  const content = `${text} ${fileName}`.toLowerCase();
  const tags = [];
  if (/idea|startup|build|ai|product/.test(content)) tags.push("idea", "AI");
  if (/buy|price|cart|product|order/.test(content)) tags.push("product");
  if (/chat|whatsapp|message|dm/.test(content)) tags.push("chat");
  if (/todo|remind|deadline|meeting/.test(content)) tags.push("reminder");
  if (/note|quote|inspiration/.test(content)) tags.push("inspiration");

  return {
    title: fileName ? `Screenshot memory: ${fileName}` : "Screenshot memory",
    body: text.slice(0, 800) || "Screenshot uploaded. OCR did not find readable text, but the image was saved as a memory.",
    meta: tags[0] || "Screenshot",
    tags: [...new Set(["screenshot", ...tags])],
  };
}

function buildRecap(records) {
  const todayRecords = records.slice(0, 6);
  const focusWindow = productivityWindow(records);

  return {
    title: "Daily cinematic recap",
    mood: todayRecords[0]?.mood || "focused",
    summary: `Today blended ${todayRecords.length} memory signals, with strongest focus around ${focusWindow}.`,
    timeline: todayRecords.map((record) => ({
      time: new Date(record.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      title: record.title,
      kind: record.kind,
      body: record.body,
    })),
    cards: buildInsightCards(records).slice(0, 3),
  };
}

function buildJournal(records) {
  const latest = records.slice(0, 5);
  return {
    title: "Smart Journal",
    date: new Date().toLocaleDateString("en-IN", { weekday: "long", month: "long", day: "numeric" }),
    body:
      `Today felt like a layered memory map. ${latest
        .map((record) => `${record.title} carried a ${record.mood} signal`)
        .join(", ")}. ` +
      "The strongest pattern is that places, ideas, and focus sessions are starting to connect into routines rather than isolated notes.",
    prompts: [
      "What made today feel most productive?",
      "Which place gave you the clearest idea?",
      "What should tomorrow protect more time for?",
    ],
  };
}

function buildPredictions(records) {
  if (records.length < 3) return [];
  const focusWindow = productivityWindow(records);
  const hasWorkout = records.some((record) => /workout|gym|fitness/i.test(`${record.title} ${record.body} ${record.tags?.join(" ")}`));
  const hasCafe = records.some((record) => /cafe|coffee/i.test(`${record.title} ${record.body} ${record.tags?.join(" ")}`));
  const predictions = [
    {
      title: `Tomorrow focus peak: ${focusWindow}`,
      body: `Your current routine suggests your best deep-work window may be around ${focusWindow}.`,
      confidence: Math.min(92, 45 + records.length * 3),
    },
  ];
  if (hasWorkout && hasCafe) {
    predictions.push({
      title: "Cafe after workout pattern",
      body: "Your stored records contain both workout and cafe activity. Continue capturing these sessions to test whether the sequence predicts creative planning.",
      confidence: Math.min(88, 50 + records.filter((record) => /workout|gym|fitness|cafe|coffee/i.test(`${record.title} ${record.body}`)).length * 4),
    });
  }
  const tags = topTags(records);
  if (tags[0]) {
    predictions.push({
      title: `${tags[0].label} activity is recurring`,
      body: `${tags[0].label} appears in ${tags[0].count} stored memories and is currently the strongest recurring topic.`,
      confidence: Math.min(94, 50 + tags[0].count * 7),
    });
  }
  return predictions;
}

function parseCookies(req) {
  const cookies = {};
  const cookieHeader = req.headers.cookie || "";
  for (const item of cookieHeader.split(";")) {
    const [key, ...valueParts] = item.trim().split("=");
    if (!key) continue;
    cookies[key] = decodeURIComponent(valueParts.join("="));
  }
  return cookies;
}

function getSession(req) {
  const sid = parseCookies(req)["neuronest.sid"];
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  session.createdAt ||= Date.now();
  return { sid, ...session };
}

function resolveAccountAccess(userId, sessionCreatedAt = 0) {
  const db = readDb();
  return moderationService.getAccountAccess(db, userId, { sessionCreatedAt });
}

function accountStatusPayload(userId, sessionCreatedAt = 0) {
  const access = resolveAccountAccess(userId, sessionCreatedAt);
  return {
    allowed: access.allowed && !access.forceLogout,
    forceLogout: access.forceLogout,
    status: access.status,
    moderation: access.allowed && !access.forceLogout ? null : access,
    notifications: access.notifications || [],
  };
}

function invalidateUserSessions(userId) {
  for (const [sid, session] of sessions.entries()) {
    if (session.user?.id === userId) sessions.delete(sid);
  }
}

function dbSignature() {
  try {
    const stat = fs.statSync(dbPath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "";
  }
}

function broadcastAccountUpdates(force = false) {
  const signature = dbSignature();
  if (!force && signature === lastAccountDbSignature) return;
  lastAccountDbSignature = signature;

  for (const [userId, clients] of accountSyncClients.entries()) {
    const payload = accountStatusPayload(userId);
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
      client.write(message);
    }
  }
}

function scheduleAccountBroadcast() {
  clearTimeout(accountWatchTimer);
  accountWatchTimer = setTimeout(broadcastAccountUpdates, 120);
}

function startAccountDbWatcher() {
  if (!fs.existsSync(dbPath)) return;
  lastAccountDbSignature = dbSignature();
  fs.watch(dbPath, { persistent: true }, () => {
    scheduleAccountBroadcast();
  });
}

function enforceAuthenticatedAccess(req, res, session) {
  if (!session?.user?.id) {
    sendJson(res, 401, { error: "Please login first." });
    return false;
  }

  const access = resolveAccountAccess(session.user.id, session.createdAt);
  if (access.forceLogout) {
    clearSession(req, res);
    sendJson(res, 401, {
      error: "Your session was ended by NeuroNest administration.",
      forceLogout: true,
      moderation: access,
    });
    return false;
  }

  if (!access.allowed) {
    sendJson(res, 403, {
      error: access.headline || "Account access restricted.",
      moderation: access,
      accountStatus: access.status,
    });
    return false;
  }

  return true;
}

function setSession(res, user) {
  const sid = crypto.randomUUID();
  sessions.set(sid, { user, createdAt: Date.now() });
  const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `neuronest.sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${secureCookie}`,
  );
}

function clearSession(req, res) {
  const sid = parseCookies(req)["neuronest.sid"];
  if (sid) sessions.delete(sid);
  const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("Set-Cookie", `neuronest.sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie}`);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function isRateLimited(req) {
  if (!req.url?.startsWith("/api/")) return false;
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = Number(process.env.RATE_LIMIT_PER_MINUTE || 120);
  const key = `${req.socket.remoteAddress || "local"}:${parseCookies(req)["neuronest.sid"] || "anon"}`;
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return bucket.count > maxRequests;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > Number(process.env.MAX_REQUEST_BODY_BYTES || 25_000_000)) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function decodeGoogleJwtPayload(credential) {
  const [, payloadPart] = String(credential).split(".");
  if (!payloadPart) {
    throw new Error("Google credential is not a valid ID token.");
  }

  const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
}

function profileFromGooglePayload(payload) {
  if (payload.aud !== getGoogleClientId()) {
    throw new Error("Google token audience does not match your client ID.");
  }

  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
    throw new Error("Google token has expired. Please try logging in again.");
  }

  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    throw new Error("Google email is not verified.");
  }

  if (!payload.sub || !payload.email) {
    throw new Error("Google token is missing required profile details.");
  }

  return {
    googleSub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture || "",
  };
}

async function verifyGoogleCredential(credential) {
  if (!getGoogleClientId()) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }

  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
    );
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error_description || "Google token verification failed.");
    }

    return profileFromGooglePayload(payload);
  } catch (error) {
    if (!ALLOW_OFFLINE_GOOGLE_FALLBACK || (error.message !== "fetch failed" && error.name !== "TypeError")) {
      throw error;
    }

    console.warn("Google tokeninfo was unreachable. Using local ID-token decode for development login only.");
    return profileFromGooglePayload(decodeGoogleJwtPayload(credential));
  }
}

async function handleApi(req, res, url) {
  const session = getSession(req);

  if (req.method === "GET" && url.pathname === "/api/config") {
    const googleClientId = getGoogleClientId();
    const googleMapsApiKey = getGoogleMapsApiKey();

    return sendJson(res, 200, {
      googleClientId,
      googleMapsApiKey,
      googleReady: Boolean(googleClientId),
      mapsReady: Boolean(googleMapsApiKey),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    if (!session?.user?.id) return sendJson(res, 200, { user: null });
    const account = accountStatusPayload(session.user.id, session.createdAt);
    if (account.forceLogout) {
      clearSession(req, res);
      return sendJson(res, 200, { user: null, forceLogout: true, moderation: account.moderation });
    }
    if (!account.allowed) {
      return sendJson(res, 200, {
        user: session.user,
        accountStatus: account.status,
        moderation: account.moderation,
        notifications: account.notifications,
      });
    }
    return sendJson(res, 200, {
      user: session.user,
      accountStatus: account.status,
      notifications: account.notifications,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/account/status") {
    if (!session?.user?.id) return sendJson(res, 401, { error: "Please login first." });
    return sendJson(res, 200, accountStatusPayload(session.user.id, session.createdAt));
  }

  if (req.method === "GET" && url.pathname === "/api/account/stream") {
    if (!session?.user?.id) return sendJson(res, 401, { error: "Please login first." });
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    const userId = session.user.id;
    if (!accountSyncClients.has(userId)) accountSyncClients.set(userId, new Set());
    accountSyncClients.get(userId).add(res);
    req.on("close", () => {
      accountSyncClients.get(userId)?.delete(res);
      if (accountSyncClients.get(userId)?.size === 0) accountSyncClients.delete(userId);
    });
    res.write(`data: ${JSON.stringify(accountStatusPayload(userId, session.createdAt))}\n\n`);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, {
      ok: true,
      intelligence: {
        embeddings: getVectorStatus(),
        generation: getProductionAiStatus(),
      },
      passivePlaces: {
        googlePlacesServerReady: Boolean(getGooglePlacesServerApiKey()),
        supabaseReady: productionStore.ready(),
        minimumStayMinutes: 10,
        movementRadiusMeters: 100,
      },
      warehouse: adminSyncService.buildSyncSnapshot(readDb()),
    });
  }

  const fileRoute = url.pathname.match(/^\/api\/files\/([^/]+)\/([^/]+)$/);
  if (req.method === "GET" && fileRoute) {
    const storedPath = warehouseDb.resolveStoredFile(decodeURIComponent(fileRoute[1]), decodeURIComponent(fileRoute[2]));
    if (!storedPath) return sendJson(res, 404, { error: "File not found." });
    res.writeHead(200, { "Content-Type": contentTypeFor(storedPath), "Cache-Control": "public, max-age=86400" });
    return fs.createReadStream(storedPath).pipe(res);
  }

  if (req.method === "POST" && url.pathname === "/api/files/upload") {
    if (!session?.user) return sendJson(res, 401, { error: "Please login first." });
    try {
      const body = await readBody(req);
      const db = readDb();
      const fileRecord = warehouseDb.saveFile(session.user.id, body);
      if (!fileRecord) return sendJson(res, 400, { error: "File data is required." });
      db.warehouse.fileStorage.unshift({
        id: fileRecord.id,
        userId: session.user.id,
        fileUrl: fileRecord.fileUrl,
        fileName: fileRecord.fileName,
        mimeType: fileRecord.mimeType,
        kind: String(body.kind || "upload").slice(0, 40),
        createdAt: fileRecord.createdAt,
      });
      db.warehouse.fileStorage = db.warehouse.fileStorage.slice(0, 5000);
      writeDb(db);
      return sendJson(res, 201, { file: fileRecord });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/auth/google") {
    try {
      const body = await readBody(req);
      if (!body.credential) return sendJson(res, 400, { error: "Missing Google credential." });

      const profile = await verifyGoogleCredential(body.credential);
      const user = upsertUser(profile);
      const access = resolveAccountAccess(user.id);
      if (!access.allowed) {
        return sendJson(res, 403, {
          error: access.headline || "Account access restricted.",
          moderation: access,
          accountStatus: access.status,
          user: publicUser(user),
        });
      }
      const loginDb = readDb();
      const liveSession = liveMonitorService.recordLogin(loginDb, user, getClientMeta(req, body));
      writeDb(loginDb);
      const safeUser = publicUser(user);
      setSession(res, safeUser);
      return sendJson(res, 200, { user: safeUser, accountStatus: access.status, presenceSessionId: liveSession?.sessionId || null });
    } catch (error) {
      return sendJson(res, 401, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    if (session?.user?.id) {
      try {
        let body = {};
        try {
          body = await readBody(req);
        } catch {
          body = {};
        }
        const db = readDb();
        if (body.sessionId) liveMonitorService.recordLogout(db, session.user.id, body.sessionId);
        else {
          const active = Object.values(db.liveMonitoring?.activeSessions || {}).find((item) => item.userId === session.user.id);
          if (active) liveMonitorService.recordLogout(db, session.user.id, active.sessionId);
        }
        writeDb(db);
      } catch {
        // Ignore logout sync failures.
      }
    }
    clearSession(req, res);
    return sendJson(res, 200, { ok: true });
  }

  if (!session?.user) {
    return sendJson(res, 401, { error: "Please login first." });
  }

  if (req.method === "POST" && url.pathname === "/api/presence/heartbeat") {
    try {
      const body = await readBody(req);
      const db = readDb();
      const liveSession = liveMonitorService.updatePresence(db, session.user.id, body, getClientMeta(req, body));
      writeDb(db);
      return sendJson(res, 200, { ok: true, session: liveSession });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/presence/action") {
    try {
      const body = await readBody(req);
      const db = readDb();
      liveMonitorService.recordLiveAction(db, session.user.id, body.action || "ACTIVITY", body);
      writeDb(db);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (!enforceAuthenticatedAccess(req, res, session)) {
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/passive-places/settings") {
    return sendJson(res, 200, {
      settings: getPassivePlaceSettings(session.user.id),
      capability: {
        browserForegroundTracking: true,
        nativeBackgroundTrackingReady: true,
        googlePlacesServerReady: Boolean(getGooglePlacesServerApiKey()),
      },
    });
  }

  if (req.method === "PATCH" && url.pathname === "/api/passive-places/settings") {
    try {
      const body = await readBody(req);
      const settings = savePassivePlaceSettings(session.user.id, body.settings || body);
      if (!settings.enabled) {
        const db = readDb();
        delete db.warehouse.passivePlaceStates[session.user.id];
        writeDb(db);
      }
      return sendJson(res, 200, { settings });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/passive-places/visits") {
    const db = readDb();
    void retryPendingPlaceMetadata(session.user.id, 2).catch(() => {});
    return sendJson(res, 200, {
      visits: placeService.getUserPlaceMemories(db, session.user.id, 250),
      activeVisit: db.warehouse.passivePlaceStates[session.user.id] || null,
      pendingMetadata: db.warehouse.placeMetadataQueue.filter(
        (item) => item.userId === session.user.id && item.status !== "completed",
      ).length,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/passive-places/samples") {
    try {
      const body = await readBody(req);
      const db = readDb();
      const result = processPassiveLocationSample(
        db,
        session.user.id,
        body.sample || body,
        getPassivePlaceSettings(session.user.id),
      );
      if (result.visit) {
        db.warehouse.placeMemories.unshift({ ...result.visit });
        db.warehouse.placeMemories = db.warehouse.placeMemories.slice(0, 10_000);
      }
      writeDb(db);
      let persisted = null;
      if (result.visit) persisted = await persistPassivePlaceVisit(session.user.id, result.visit);
      else void retryPendingPlaceMetadata(session.user.id, 1).catch(() => {});
      return sendJson(res, 200, {
        ...result,
        visit: persisted?.visit || result.visit,
        entry: persisted?.entry || null,
        metadataError: persisted?.metadataError || null,
      });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/passive-places/flush") {
    try {
      const body = await readBody(req);
      const db = readDb();
      const result = finalizePassivePlaceState(
        db,
        session.user.id,
        getPassivePlaceSettings(session.user.id),
        body.departureTime,
      );
      if (result.visit) {
        db.warehouse.placeMemories.unshift({ ...result.visit });
        db.warehouse.placeMemories = db.warehouse.placeMemories.slice(0, 10_000);
      }
      writeDb(db);
      if (result.visit) void persistPassivePlaceVisit(session.user.id, result.visit).catch(() => {});
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/passive-places/retry") {
    try {
      return sendJson(res, 200, { results: await retryPendingPlaceMetadata(session.user.id, 10) });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/chat/history") {
    return sendJson(res, 200, { messages: getChatHistory(session.user.id) });
  }

  if (req.method === "GET" && url.pathname === "/api/entries") {
    return sendJson(res, 200, {
      entries: getEntries(session.user.id),
      trash: getEntries(session.user.id, { includeDeleted: true }).filter((entry) => entry.deletedAt),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/entries") {
    try {
      const body = await readBody(req);
      return sendJson(res, 201, { entry: await createEntry(session.user.id, body) });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  const entryRoute = url.pathname.match(/^\/api\/entries\/([^/]+)(?:\/(restore))?$/);
  if (entryRoute && req.method === "DELETE" && !entryRoute[2]) {
    const entry = setEntryDeleted(session.user.id, entryRoute[1], true);
    if (!entry) return sendJson(res, 404, { error: "Entry not found." });
    return sendJson(res, 200, { entry });
  }

  if (entryRoute && req.method === "POST" && entryRoute[2] === "restore") {
    const entry = setEntryDeleted(session.user.id, entryRoute[1], false);
    if (!entry) return sendJson(res, 404, { error: "Entry not found." });
    return sendJson(res, 200, { entry });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/status") {
    return sendJson(res, 200, { ...getVectorStatus(), ...getProductionAiStatus() });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/profile") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    return sendJson(res, 200, buildProfileIdentity({ user: session.user, memories, relationships }));
  }

  if (req.method === "GET" && url.pathname === "/api/ai/intelligence-core") {
    return sendJson(res, 200, await buildIntelligenceCoreResponse(session.user, {
      query: url.searchParams.get("query") || "",
      activity: url.searchParams.get("activity") || "dashboard",
      focusState: url.searchParams.get("focus") || "",
      mood: url.searchParams.get("mood") || "",
      locationLabel: url.searchParams.get("location") || "",
    }));
  }

  if (req.method === "GET" && url.pathname === "/api/ai/digital-twin") {
    return sendJson(res, 200, await buildDigitalTwinResponse(session.user, {
      query: url.searchParams.get("query") || "",
      activity: url.searchParams.get("activity") || "digital twin",
      focusState: url.searchParams.get("focus") || "",
    }));
  }

  if (req.method === "POST" && url.pathname === "/api/ai/digital-twin/analyze") {
    const body = await readBody(req);
    return sendJson(res, 200, await buildDigitalTwinResponse(session.user, body.context || body));
  }

  if (req.method === "GET" && url.pathname === "/api/ai/life-os") {
    return sendJson(res, 200, await buildLifeOsResponse(session.user, {
      query: url.searchParams.get("query") || "",
      activity: url.searchParams.get("activity") || "mission control",
      focusState: url.searchParams.get("focus") || "goal execution",
    }));
  }

  if (req.method === "POST" && url.pathname === "/api/ai/life-os/goals") {
    try {
      const body = await readBody(req);
      const goal = createLifeGoal(session.user.id, body);
      refreshUserBrainModelForUserId(session.user.id, { trigger: "life-goal-created", activity: goal.title });
      return sendJson(res, 201, { goal, lifeOs: await buildLifeOsResponse(session.user, { activity: goal.title }) });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  const lifeGoalRoute = url.pathname.match(/^\/api\/ai\/life-os\/goals\/([^/]+)$/);
  if (lifeGoalRoute && req.method === "PATCH") {
    try {
      const body = await readBody(req);
      const goal = updateLifeGoal(session.user.id, decodeURIComponent(lifeGoalRoute[1]), body);
      if (!goal) return sendJson(res, 404, { error: "Goal not found." });
      refreshUserBrainModelForUserId(session.user.id, { trigger: "life-goal-updated", activity: goal.title });
      return sendJson(res, 200, { goal, lifeOs: await buildLifeOsResponse(session.user, { activity: goal.title }) });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "GET" && (url.pathname === "/api/ai/user-brain" || url.pathname === "/api/ai/continuous-learning")) {
    return sendJson(res, 200, buildAndPersistUserBrainModel(session.user, {
      query: url.searchParams.get("query") || "",
      activity: url.searchParams.get("activity") || "continuous learning",
      trigger: "manual-read",
    }));
  }

  if (req.method === "GET" && (url.pathname === "/api/ai/learning-engine" || url.pathname === "/api/ai/learning-engine-v2")) {
    return sendJson(res, 200, buildLearningEngineResponse(session.user, {
      rebuild: url.searchParams.get("rebuild") === "true",
      context: {
        query: url.searchParams.get("query") || "",
        activity: url.searchParams.get("activity") || "learning engine",
      },
    }));
  }

  if (req.method === "POST" && url.pathname === "/api/ai/learning-engine/loop") {
    const body = await readBody(req);
    return sendJson(res, 200, buildLearningEngineResponse(session.user, {
      rebuild: Boolean(body.rebuild),
      context: {
        ...(body.context || body),
        eventType: body.eventType || body.context?.eventType || "self-improvement-loop",
      },
    }));
  }

  if (req.method === "POST" && (url.pathname === "/api/ai/user-brain/learn" || url.pathname === "/api/ai/continuous-learning/learn")) {
    const body = await readBody(req);
    return sendJson(res, 200, buildAndPersistUserBrainModel(session.user, {
      ...(body.context || body),
      trigger: body.trigger || body.context?.trigger || "manual-learning",
    }));
  }

  if (req.method === "POST" && url.pathname === "/api/ai/intelligence-core/reason") {
    const body = await readBody(req);
    const message = String(body.message || body.query || "").trim();
    if (!message) return sendJson(res, 400, { error: "Message is required." });
    const core = await buildIntelligenceCoreResponse(session.user, { query: message, activity: message, focusState: "reasoning" });
    const reply = await generateOpenAiIntelligenceReply({
      message,
      language: core.language,
      memoryContext: {
        predictions: core.predictions,
        insights: core.insights,
        graph: core.knowledgeGraph.stats,
        userBrainModel: core.userBrainModel,
      },
      intelligenceCore: core,
    });
    return sendJson(res, 200, {
      reply: reply || localizedFallback(message, core.language, core.insights?.[0]?.body),
      core,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/autonomous-capture") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    return sendJson(res, 200, buildAutonomousCaptureDashboard({ memories, relationships }));
  }

  if (req.method === "GET" && url.pathname === "/api/ai/resurfacing") {
    return sendJson(res, 200, await buildResurfacingResponse(session.user.id, {
      query: url.searchParams.get("query") || "",
      activity: url.searchParams.get("activity") || "",
      project: url.searchParams.get("project") || "",
      locationLabel: url.searchParams.get("location") || "",
      mood: url.searchParams.get("mood") || "",
      productivityState: url.searchParams.get("productivity") || "",
      focusState: url.searchParams.get("focus") || "",
    }));
  }

  if (req.method === "POST" && url.pathname === "/api/ai/resurfacing/context") {
    const body = await readBody(req);
    return sendJson(res, 200, await buildResurfacingResponse(session.user.id, body.context || body));
  }

  if (req.method === "POST" && url.pathname === "/api/ai/autonomous-capture/event") {
    try {
      const body = await readBody(req);
      const event = body.event || body;
      const memories = allUnifiedMemories(session.user.id);
      const relationships = detectRelationships(memories);
      const result = await runAutonomousCapture({ event, memories, relationships });

      if (result.entryPayload) {
        result.entry = await createEntry(session.user.id, result.entryPayload);
      }

      return sendJson(res, result.entry ? 201 : 200, {
        captured: result.captured,
        message: result.message,
        analysis: result.analysis,
        session: result.session,
        relatedMemories: result.relatedMemories,
        entry: result.entry || null,
      });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/ai/memory-engine") {
    const records = allMemoryRecords(session.user.id);
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    const patterns = detectLifePatterns(memories, relationships);
    const timeline = buildTimeline({ memories, relationships, limit: 12 });
    const resurfacingFeed = buildMemoryResurfacingFeed({ memories, relationships, context: { activity: "dashboard memory engine" } });
    return sendJson(res, 200, {
      insights: generateInsightCards(memories, relationships),
      counts: kindCounts(records),
      tags: topTags(records),
      focusWindow: productivityWindow(records),
      routines: [...detectBehaviorPatterns(memories, relationships).map((pattern) => pattern.body), ...patterns.slice(0, 2).map((pattern) => pattern.body)],
      notifications: generateProactiveNotifications(memories, relationships),
      streaks: detectTimelineStreaks(timeline.events),
      resurfacing: forgottenMemorySuggestions(memories, relationships),
      resurfacingFeed: resurfacingFeed.highlights,
      vectorStatus: getVectorStatus(),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/timeline") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    const limit = Math.max(4, Math.min(40, Number(url.searchParams.get("limit") || 18)));
    const timeline = buildTimeline({
      memories,
      relationships,
      filter: url.searchParams.get("filter") || "all",
      search: url.searchParams.get("search") || "",
      groupBy: url.searchParams.get("groupBy") || "day",
      offset,
      limit,
    });

    return sendJson(res, 200, {
      ...timeline,
      streaks: detectTimelineStreaks(timeline.events),
      patterns: detectLifePatterns(memories, relationships).slice(0, 5),
      chains: buildContextChains(memories, relationships).slice(0, 4),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/patterns") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    return sendJson(res, 200, {
      patterns: detectLifePatterns(memories, relationships),
      resurfacing: forgottenMemorySuggestions(memories, relationships),
      chains: buildContextChains(memories, relationships),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/context-chains") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    return sendJson(res, 200, { chains: buildContextChains(memories, relationships) });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/multimodal") {
    const memories = allUnifiedMemories(session.user.id);
    const visual = memories.map((memory) => ({ memoryId: memory.id, title: memory.title, type: memory.type, ...analyzeVisualMemory(memory) }));
    const clusters = visual.reduce((map, item) => {
      map[item.clusterKey] ||= [];
      map[item.clusterKey].push(item);
      return map;
    }, {});
    return sendJson(res, 200, {
      screenshots: memories.filter((memory) => memory.type === "screenshot").length,
      voice: memories.filter((memory) => memory.type === "voice").length,
      visual,
      clusters: Object.entries(clusters).map(([key, items]) => ({ key, count: items.length, items: items.slice(0, 6) })),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/heatmap") {
    const records = allMemoryRecords(session.user.id);
    return sendJson(res, 200, {
      range: url.searchParams.get("range") || "week",
      points: buildHeatmap(records, url.searchParams.get("range") || "week"),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/graph") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    return sendJson(res, 200, buildRelationshipGraph(memories, relationships));
  }

  if (req.method === "GET" && url.pathname === "/api/ai/recap") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    const legacyRecap = buildRecap(allMemoryRecords(session.user.id));
    const replay = buildMemoryReplay(memories, relationships, "day");
    return sendJson(res, 200, {
      ...legacyRecap,
      summary: replay.narration,
      timeline: replay.events.map((event) => ({ time: event.time, title: event.title, kind: event.type, body: event.body })),
      emotionalArc: replay.emotionalArc,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/journal") {
    const memories = allUnifiedMemories(session.user.id);
    const dna = buildMemoryDnaProfile(memories, detectRelationships(memories));
    const journal = buildJournal(allMemoryRecords(session.user.id));
    return sendJson(res, 200, {
      ...journal,
      body: `${journal.body} Your current memory DNA reads as ${dna.identity}.`,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/predictions") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    const response = {
      predictions: [...buildPredictions(allMemoryRecords(session.user.id)), ...generateProactiveNotifications(memories, relationships)].slice(0, 6),
    };
    persistIntelligenceRecord(session.user.id, "predictions", {
      id: `predictions_${session.user.id}`,
      ...response,
      evidenceMemoryCount: memories.length,
    });
    return sendJson(res, 200, response);
  }

  if (req.method === "POST" && url.pathname === "/api/ai/search") {
    const body = await readBody(req);
    const query = String(body.query || "").trim();
    if (!query) return sendJson(res, 400, { error: "Search query is required." });

    const memories = allUnifiedMemories(session.user.id);
    let semanticMatches;
    try {
      semanticMatches = await searchMemoryVectors({ userId: session.user.id, query, memories, limit: 8 });
    } catch (error) {
      recordAiUsage(session.user.id, "semantic-search", "failed", { query, error: error.message });
      return sendJson(res, error.statusCode || 503, {
        error: error.message,
        code: error.code || "SEMANTIC_SEARCH_UNAVAILABLE",
        vectorStatus: getVectorStatus(),
      });
    }
    recordAiUsage(session.user.id, "semantic-search", "completed", { query, resultCount: semanticMatches.length });
    const relationships = detectRelationships(memories);
    const patterns = detectLifePatterns(memories, relationships);
    const chains = buildContextChains(memories, relationships);
    const fusedContext = fuseAssistantContext({ semanticMatches, chains, patterns });

    return sendJson(res, 200, {
      query,
      answer: [createSearchAnswer(query, semanticMatches), fusedContext.summary].filter(Boolean).join(" "),
      fusedContext,
      vectorStatus: getVectorStatus(),
      results: semanticMatches.map((match) => ({
            id: match.memory.id,
            kind: match.memory.type,
            title: match.memory.title,
            body: match.memory.content || match.memory.summary,
            meta: match.memory.metadata?.meta || match.memory.type,
            tags: match.memory.tags,
            score: match.score,
            similarity: Number(match.similarity.toFixed(4)),
            reason: `${match.provider} semantic match`,
            relationships: relationships.filter((item) => item.sourceId === match.memory.id || item.targetId === match.memory.id).slice(0, 3),
          })),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/relationships") {
    const snapshot = buildRelationshipIntelligenceForUser(session.user.id, {
      persist: url.searchParams.get("persist") === "true",
      trigger: "relationships-read",
    });
    return sendJson(res, 200, snapshot);
  }

  if (req.method === "GET" && url.pathname === "/api/relationships/top") {
    const snapshot = buildRelationshipIntelligenceForUser(session.user.id);
    return sendJson(res, 200, { topPeople: snapshot.topPeople, overview: snapshot.overview });
  }

  if (req.method === "GET" && url.pathname === "/api/relationships/graph") {
    const snapshot = buildRelationshipIntelligenceForUser(session.user.id);
    return sendJson(res, 200, { graph: snapshot.graph, clusters: snapshot.clusters });
  }

  if (req.method === "GET" && url.pathname === "/api/relationships/insights") {
    const snapshot = buildRelationshipIntelligenceForUser(session.user.id);
    return sendJson(res, 200, { insights: snapshot.insights, overview: snapshot.overview });
  }

  if (req.method === "GET" && url.pathname === "/api/relationships/reconnect") {
    const snapshot = buildRelationshipIntelligenceForUser(session.user.id);
    return sendJson(res, 200, { reconnect: snapshot.reconnect, overview: snapshot.overview });
  }

  if (req.method === "POST" && url.pathname === "/api/relationships/rebuild") {
    const snapshot = buildRelationshipIntelligenceForUser(session.user.id, { persist: true, trigger: "manual-rebuild" });
    recordAiUsage(session.user.id, "relationship-intelligence-rebuild", "completed", {
      relationshipCount: snapshot.relationships.length,
      eventCount: snapshot.events.length,
      insightCount: snapshot.insights.length,
    });
    return sendJson(res, 200, snapshot);
  }

  const relationshipRoute = url.pathname.match(/^\/api\/relationships\/([^/]+)$/);
  if (req.method === "GET" && relationshipRoute) {
    const snapshot = buildRelationshipIntelligenceForUser(session.user.id);
    const id = decodeURIComponent(relationshipRoute[1]);
    const relationship = findRelationshipById(snapshot, id);
    if (!relationship) return sendJson(res, 404, { error: "Relationship not found." });
    return sendJson(res, 200, {
      relationship,
      timeline: buildRelationshipTimeline(snapshot, relationship.id),
      insights: snapshot.insights.filter((insight) => insight.relationshipId === relationship.id),
    });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/relationships") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    const response = {
      relationships,
      patterns: detectBehaviorPatterns(memories, relationships),
      stream: buildMemoryStream(memories, relationships),
    };
    persistIntelligenceRecord(session.user.id, "relationships", {
      id: `relationships_${session.user.id}`,
      ...response,
      memoryCount: memories.length,
    });
    return sendJson(res, 200, response);
  }

  if (req.method === "GET" && url.pathname === "/api/ai/scores") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    return sendJson(res, 200, { scores: buildMemoryScores(memories, relationships) });
  }

  if (req.method === "GET" && url.pathname === "/api/ai/dna") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    return sendJson(res, 200, buildMemoryDnaProfile(memories, relationships));
  }

  if (req.method === "GET" && url.pathname === "/api/ai/replay") {
    const memories = allUnifiedMemories(session.user.id);
    const relationships = detectRelationships(memories);
    const range = url.searchParams.get("range") || "day";
    const mode = url.searchParams.get("mode") || "today";
    const replay = buildMemoryReplay(memories, relationships, range, mode);
    persistIntelligenceRecord(session.user.id, "replays", {
      id: `replay_${session.user.id}_${range}_${mode}`,
      range,
      mode,
      replay,
      memoryCount: memories.length,
    });
    return sendJson(res, 200, replay);
  }

  if (req.method === "POST" && url.pathname === "/api/ai/screenshot-memory") {
    try {
      const body = await readBody(req);
      const imageData = body.imageData || body.fileData || "";
      if (!imageData) return sendJson(res, 400, { error: "Screenshot imageData is required." });
      const classification = classifyScreenshotText(String(body.text || ""), String(body.fileName || ""));
      const vision = await analyzeScreenshotWithOpenAi({
        imageData,
        ocrText: String(body.text || ""),
        fileName: String(body.fileName || ""),
        mimeType: String(body.mimeType || ""),
      });
      const multimodal = {
        ...vision,
        caption: vision.description,
        meta: vision.scene || vision.topics[0] || "Screenshot",
        media: {
          fileName: String(body.fileName || ""),
          mimeType: String(body.mimeType || ""),
          size: Number(body.size || 0),
          caption: vision.description,
          visualLabels: vision.topics,
        },
        metadata: {
          ocrText: vision.extractedText,
          fileName: String(body.fileName || ""),
          mimeType: String(body.mimeType || ""),
          size: Number(body.size || 0),
          visualLabels: vision.topics,
          detectedApps: vision.detectedApps,
          imageCaption: vision.description,
          topics: vision.topics,
          aiProvider: vision.provider,
          aiModel: vision.model,
        },
      };
      const entry = await createEntry(session.user.id, {
        kind: "memory",
        type: "screenshot",
        title: multimodal.title || classification.title,
        body: multimodal.summary || classification.body,
        meta: multimodal.meta || classification.meta,
        tags: [...new Set([...classification.tags, ...multimodal.tags])].join(", "),
        summary: multimodal.summary,
        metadata: multimodal.metadata,
        media: multimodal.media,
        source: "screenshot-ocr",
        aiAnalysis: multimodal,
        imageData,
        fileName: body.fileName || "",
        mimeType: body.mimeType || "",
      });
      recordAiUsage(session.user.id, "screenshot-analysis", "completed", {
        memoryId: entry.id,
        provider: vision.provider,
        model: vision.model,
      });
      return sendJson(res, 201, { entry, classification: { ...classification, ...multimodal } });
    } catch (error) {
      recordAiUsage(session.user.id, "screenshot-analysis", "failed", { error: error.message });
      return sendJson(res, error.statusCode || 400, { error: error.message, code: error.code || "SCREENSHOT_AI_FAILED" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/ai/voice-memory") {
    try {
      const body = await readBody(req);
      const audioData = String(body.audioData || body.fileData || "");
      let transcript = String(body.transcript || "").trim();
      let transcription = null;
      if (audioData) {
        transcription = await transcribeAudioWithOpenAi({
          audioData,
          fileName: String(body.fileName || "voice-note.webm"),
          mimeType: String(body.mimeType || "audio/webm"),
          language: String(body.language || ""),
        });
        transcript = transcription.transcript;
      }
      if (!transcript) return sendJson(res, 400, { error: "Voice audio or transcript is required." });
      const title = String(body.title || "Voice memory").trim();
      const analysis = await analyzeVoiceTranscriptWithOpenAi({ transcript, title });
      const entry = await createEntry(session.user.id, {
        kind: "voice",
        type: "voice",
        title,
        body: transcript,
        meta: String(body.duration || ""),
        tags: analysis.tags.join(", "),
        summary: analysis.summary,
        metadata: {
          ...analysis.metadata,
          transcriptionProvider: transcription?.provider || "provided-transcript",
          transcriptionModel: transcription?.model || null,
        },
        source: "voice-ai",
        aiAnalysis: analysis,
        audioData,
        fileName: String(body.fileName || "voice-note.webm"),
        mimeType: String(body.mimeType || "audio/webm"),
      });
      recordAiUsage(session.user.id, "voice-processing", "completed", {
        memoryId: entry.id,
        transcriptionModel: transcription?.model || null,
        analysisModel: analysis.model,
      });
      return sendJson(res, 201, { entry, transcription, analysis });
    } catch (error) {
      recordAiUsage(session.user.id, "voice-processing", "failed", { error: error.message });
      return sendJson(res, error.statusCode || 400, { error: error.message, code: error.code || "VOICE_AI_FAILED" });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const body = await readBody(req);
    const message = String(body.message || "").trim();

    if (!message) return sendJson(res, 400, { error: "Message is required." });
    if (message.length > 1000) return sendJson(res, 400, { error: "Message is too long." });
    if (!getProductionAiStatus().aiReady) {
      return sendJson(res, 503, { error: "AI Chat requires GROQ_API_KEY or OPENAI_API_KEY.", code: "AI_PROVIDER_NOT_CONFIGURED" });
    }

    const userMessage = saveChatMessage(session.user.id, "user", message);
    const memories = allUnifiedMemories(session.user.id);
    let semanticMatches = [];
    try {
      semanticMatches = await searchMemoryVectors({ userId: session.user.id, query: message, memories, limit: 5 });
    } catch (error) {
      recordAiUsage(session.user.id, "semantic-search", "failed", { error: error.message, context: "ai-chat" });
      semanticMatches = [];
    }
    const relationships = detectRelationships(memories);
    const peopleRelationships = buildRelationshipIntelligenceForUser(session.user.id);
    const relationshipAnswer = answerRelationshipQuery(message, peopleRelationships);
    const timeline = buildTimeline({ memories, relationships, limit: 80 });
    const insights = generateInsightCards(memories, relationships);
    const patterns = detectLifePatterns(memories, relationships);
    const chains = buildContextChains(memories, relationships);
    const fusedContext = fuseAssistantContext({ semanticMatches, chains, patterns });
    const resurfacing = buildMemoryResurfacingFeed({
      memories,
      relationships,
      context: { query: message, activity: message, focusState: "conversation" },
      semanticMatches,
    });
    const intelligenceCore = buildIntelligenceCore({
      user: session.user,
      memories,
      relationships,
      patterns,
      dna: buildMemoryDnaProfile(memories, relationships),
      resurfacing,
      languageInput: message,
      chatHistory: getChatHistory(session.user.id),
    });
    const digitalTwin = buildDigitalTwin({
      user: session.user,
      memories,
      relationships,
      intelligenceCore,
      dna: buildMemoryDnaProfile(memories, relationships),
      peopleRelationships,
    });
    const userBrainModel = buildAndPersistUserBrainModel(session.user, {
      trigger: "chat-before-reply",
      activity: message,
      query: message,
    });
    const decisionRecommendation = isDecisionQuestion(message)
      ? buildDecisionRecommendation({ question: message, twin: digitalTwin, memories, relationships })
      : null;
    let providerReply;
    try {
      providerReply = await generateOpenAiIntelligenceReply({
      message,
      language: intelligenceCore.language,
      memoryContext: {
        semanticMatches: semanticMatches.map((match) => ({
          title: match.memory.title,
          summary: match.memory.summary || match.memory.content,
          score: match.score,
        })),
        relationships: relationships.slice(0, 5),
        peopleRelationships: {
          overview: peopleRelationships.overview,
          topPeople: peopleRelationships.topPeople.slice(0, 5).map((person) => ({
            personName: person.personName,
            relationshipType: person.relationshipType,
            strength: person.relationshipStrength,
            health: person.relationshipHealth,
            lastSeen: person.lastSeen,
            emotionalImpact: person.emotionalImpact,
          })),
          reconnect: peopleRelationships.reconnect.slice(0, 4),
          insights: peopleRelationships.insights.slice(0, 5),
          directAnswer: relationshipAnswer.matched ? relationshipAnswer : null,
        },
        recentConversation: getChatHistory(session.user.id).slice(-10).map((item) => ({
          role: item.role,
          content: item.content,
          createdAt: item.createdAt,
        })),
        timeline: {
          events: timeline.events.slice(0, 8).map((event) => ({
            title: event.title,
            type: event.type,
            timestamp: event.timestamp,
            emotionalScore: event.emotionalScore,
            productivityScore: event.productivityScore,
            importanceScore: event.importanceScore,
          })),
          groups: timeline.groups.slice(0, 4).map((group) => ({
            label: group.label,
            count: group.events.length,
            stats: group.stats,
          })),
          streaks: detectTimelineStreaks(timeline.events),
        },
        fusedContext,
        digitalTwin: {
          understandingLevel: digitalTwin.understandingLevel,
          strengths: digitalTwin.strengths.slice(0, 4),
          weaknesses: digitalTwin.weaknesses.slice(0, 4),
          goals: digitalTwin.goals.slice(0, 5),
          habits: digitalTwin.habits.slice(0, 5),
          personality: digitalTwin.personality,
          goalAlignment: digitalTwin.goalAlignment,
          decisionHistory: digitalTwin.decisionHistory,
          decisionRecommendation,
        },
        userBrainModel: summarizeUserBrainModel(userBrainModel),
      },
      intelligenceCore,
      });
    } catch (error) {
      recordAiUsage(session.user.id, "ai-chat", "failed", { error: error.message });
      return sendJson(res, error.statusCode || 502, { error: error.message, code: error.code || "AI_CHAT_FAILED" });
    }
    const contextualReply = providerReply;
    const decisionLine = "";
    const reply =
      relationshipAnswer.matched && relationshipAnswer.confidence >= 50
        ? `${contextualReply}${decisionLine} ${relationshipAnswer.answer}`
        : semanticMatches.length && fusedContext.summary
          ? `${contextualReply}${decisionLine} ${fusedContext.summary}`
          : `${contextualReply}${decisionLine}`;
    const assistantMessage = saveChatMessage(session.user.id, "assistant", reply);

    const chatDb = readDb();
    adminSyncService.syncChat(chatDb, session.user.id, userMessage, assistantMessage);
    liveMonitorService.recordLiveAction(chatDb, session.user.id, "AI_CHAT", { page: "ai-chat", label: "AI Chat", message: "used AI Chat" });
    writeDb(chatDb);
    if (productionStore.ready()) {
      try {
        await productionStore.upsertUser(getUserById(session.user.id));
        await productionStore.upsertChat(session.user.id, userMessage);
        await productionStore.upsertChat(session.user.id, assistantMessage);
      } catch (error) {
        recordAiUsage(session.user.id, "production-chat-sync", "failed", { error: error.message });
      }
    }
    recordAiUsage(session.user.id, "ai-chat", "completed", {
      provider: getProductionAiStatus().provider,
      model: getProductionAiStatus().chatModel,
      semanticMatchCount: semanticMatches.length,
    });

    void ensureAndPersistMemoryVector(createChatMemoryObject(userMessage, session.user.id)).catch(() => {});
    void ensureAndPersistMemoryVector(createChatMemoryObject(assistantMessage, session.user.id)).catch(() => {});
    try {
      refreshUserBrainModelForUserId(session.user.id, {
        trigger: "chat-after-reply",
        activity: message,
        assistantReply: reply,
      });
    } catch {
      // Continuous learning should not block chat delivery.
    }
    try {
      await persistDerivedIntelligenceForUserId(session.user.id, "ai-chat");
    } catch {
      // Derived intelligence must not block a completed AI response.
    }

    return sendJson(res, 200, { messages: [userMessage, assistantMessage] });
  }

  return sendJson(res, 404, { error: "API route not found." });
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml",
  };

  return types[ext] || "application/octet-stream";
}

function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(publicDir, "index.html");

  res.writeHead(200, { "Content-Type": contentTypeFor(finalPath) });
  fs.createReadStream(finalPath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {

    const skipRateLimit = [
        "/api/presence/heartbeat",
        "/api/presence/action",
        "/api/passive-places/samples",
        "/api/passive-places/flush"
    ];

    if (
        !skipRateLimit.includes(url.pathname) &&
        isRateLimited(req)
    ) {
        sendJson(res, 429, {
            error: "Too many requests. Please slow down for a moment."
        });
        return;
    }

    await handleApi(req, res, url);
    return;
}  

    serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "Server error." });
  }
});

server.listen(PORT, () => {
  console.log(`NeuroNest backend running at http://localhost:${PORT}`);
  startAccountDbWatcher();
  if (!getGoogleClientId()) {
    console.log("Google login is not configured. Add GOOGLE_CLIENT_ID to .env.");
  }
  const placeRetryTimer = setInterval(() => {
    void retryAllPendingPlaceMetadata();
  }, 10 * 60_000);
  placeRetryTimer.unref?.();
});
