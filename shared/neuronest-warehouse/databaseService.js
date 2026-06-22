import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sanitizeFileName, validateUploadPayload } from "./securityService.js";

const WAREHOUSE_VERSION = 3;

export function createEmptyWarehouse() {
  return {
    version: WAREHOUSE_VERSION,
    lastSyncAt: null,
    memories: [],
    screenshots: [],
    voiceNotes: [],
    places: [],
    placeMemories: [],
    locationSamples: [],
    passivePlaceStates: {},
    placeMetadataQueue: [],
    timelineEvents: [],
    aiChats: [],
    goals: [],
    decisions: [],
    aiUsage: [],
    activityStream: [],
    fileStorage: [],
    embeddings: [],
    relationships: [],
    relationshipProfiles: [],
    relationshipEvents: [],
    relationshipInsights: [],
    relationshipClusters: [],
    digitalTwins: [],
    predictions: [],
    futurePredictions: [],
    predictionModels: [],
    predictionHistory: [],
    autonomousIntelligence: [],
    chiefOfStaff: [],
    memoryTimeMachine: [],
    memoryAtlas: [],
    decisionIntelligence: [],
    securityAuditLogs: [],
    replays: [],
    insights: [],
    aiJobs: [],
  };
}

export function normalizeWarehouse(db) {
  db.warehouse ||= createEmptyWarehouse();
  const warehouse = db.warehouse;
  warehouse.version ||= WAREHOUSE_VERSION;
  warehouse.memories ||= [];
  warehouse.screenshots ||= [];
  warehouse.voiceNotes ||= [];
  warehouse.places ||= [];
  warehouse.placeMemories ||= [];
  warehouse.locationSamples ||= [];
  warehouse.passivePlaceStates ||= {};
  warehouse.placeMetadataQueue ||= [];
  warehouse.timelineEvents ||= [];
  warehouse.aiChats ||= [];
  warehouse.goals ||= [];
  warehouse.decisions ||= [];
  warehouse.aiUsage ||= [];
  warehouse.activityStream ||= [];
  warehouse.fileStorage ||= [];
  warehouse.embeddings ||= [];
  warehouse.relationships ||= [];
  warehouse.relationshipProfiles ||= [];
  warehouse.relationshipEvents ||= [];
  warehouse.relationshipInsights ||= [];
  warehouse.relationshipClusters ||= [];
  warehouse.digitalTwins ||= [];
  warehouse.predictions ||= [];
  warehouse.futurePredictions ||= [];
  warehouse.predictionModels ||= [];
  warehouse.predictionHistory ||= [];
  warehouse.autonomousIntelligence ||= [];
  warehouse.chiefOfStaff ||= [];
  warehouse.memoryTimeMachine ||= [];
  warehouse.memoryAtlas ||= [];
  warehouse.decisionIntelligence ||= [];
  warehouse.securityAuditLogs ||= [];
  warehouse.replays ||= [];
  warehouse.insights ||= [];
  warehouse.aiJobs ||= [];
  return warehouse;
}

export function normalizeDb(db) {
  db ||= {};
  db.users ||= [];
  db.chats ||= {};
  db.entries ||= {};
  db.brainModels ||= {};
  db.lifeGoals ||= {};
  db.lifeDecisions ||= {};
  db.learningProfiles ||= {};
  db.adminUserStatus ||= {};
  db.adminLogs ||= [];
  db.securityAuditLogs ||= [];
  db.announcements ||= [];
  db.moderationHistory ||= [];
  db.userNotifications ||= {};
  db.liveMonitoring ||= {
    activeSessions: {},
    sessionHistory: [],
    liveFeed: [],
    loginHistory: [],
    analytics: { peakOnlineToday: 0, peakOnlineAt: null, pageVisits: {}, featureUsage: {}, dailyActive: {}, weeklyActive: {} },
  };
  normalizeWarehouse(db);
  return db;
}

export function createDatabaseService(options = {}) {
  const dbPath = options.dbPath;
  const uploadsDir = options.uploadsDir || path.join(path.dirname(dbPath || ""), "uploads");
  const appBaseUrl = String(options.appBaseUrl || "").replace(/\/$/, "");

  function ensureDbFile() {
    if (!dbPath) throw new Error("Database path is not configured.");
    if (!fs.existsSync(dbPath)) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(
        dbPath,
        JSON.stringify(
          {
            users: [],
            chats: {},
            entries: {},
            brainModels: {},
            lifeGoals: {},
            learningProfiles: {},
            securityAuditLogs: [],
            warehouse: createEmptyWarehouse(),
          },
          null,
          2,
        ),
      );
    }
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  }

  function readDb() {
    ensureDbFile();
    const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
    return normalizeDb(db);
  }

  function writeDb(db) {
    ensureDbFile();
    normalizeDb(db);
    db.warehouse.lastSyncAt = new Date().toISOString();
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    return db;
  }

  function touchWarehouse(db) {
    normalizeWarehouse(db);
    db.warehouse.lastSyncAt = new Date().toISOString();
    return db;
  }

  function saveFile(userId, payload = {}) {
    const dataUrl = String(payload.dataUrl || payload.imageData || payload.audioData || payload.fileData || payload.base64 || "").trim();
    if (!userId || !dataUrl) return null;
    const validation = validateUploadPayload({ ...payload, dataUrl });
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    const fileName = sanitizeFileName(validation.fileName || payload.fileName || payload.name || "upload.bin");
    const mimeType = validation.mimeType;

    let buffer;
    let ext = path.extname(fileName) || guessExtension(mimeType);
    if (dataUrl.startsWith("data:")) {
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return null;
      buffer = Buffer.from(match[2], "base64");
      ext = ext || guessExtension(match[1]);
    } else {
      buffer = Buffer.from(dataUrl, "base64");
    }

    const fileId = crypto.randomUUID();
    const userDir = path.join(uploadsDir, userId);
    fs.mkdirSync(userDir, { recursive: true });
    const storedName = `${fileId}${ext}`;
    const absolutePath = path.join(userDir, storedName);
    fs.writeFileSync(absolutePath, buffer);

    const relativeUrl = `/api/files/${encodeURIComponent(userId)}/${encodeURIComponent(storedName)}`;
    const fileUrl = appBaseUrl ? `${appBaseUrl}${relativeUrl}` : relativeUrl;
    return {
      id: fileId,
      userId,
      fileName: payload.fileName || storedName,
      storedName,
      mimeType,
      fileUrl,
      relativeUrl,
      absolutePath,
      size: buffer.length,
      createdAt: new Date().toISOString(),
    };
  }

  function resolveStoredFile(userId, storedName) {
    const safeUserId = String(userId || "").replace(/[^\w-]/g, "");
    const safeName = path.basename(String(storedName || ""));
    const absolutePath = path.join(uploadsDir, safeUserId, safeName);
    if (!absolutePath.startsWith(uploadsDir)) return null;
    if (!fs.existsSync(absolutePath)) return null;
    return absolutePath;
  }

  return {
    dbPath,
    uploadsDir,
    appBaseUrl,
    readDb,
    writeDb,
    touchWarehouse,
    saveFile,
    resolveStoredFile,
    normalizeDb,
    normalizeWarehouse,
  };
}

function guessExtension(mimeType) {
  const map = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "audio/webm": ".webm",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
  };
  return map[String(mimeType || "").toLowerCase()] || ".bin";
}
