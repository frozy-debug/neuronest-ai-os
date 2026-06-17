import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNeuroNestWarehouse } from "../shared/neuronest-warehouse/index.js";
import { createWebSocketHub } from "../shared/neuronest-warehouse/wsServer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv();

const PORT = Number(process.env.PORT || 3100);
const publicDir = path.join(__dirname, "public");
const dbPath = resolveDbPath();
const uploadsDir = resolveUploadsPath();
const warehouse = createNeuroNestWarehouse({
  dbPath,
  uploadsDir,
  appBaseUrl: process.env.NEURONEST_APP_URL || "http://localhost:3000",
});
warehouse.initialize();
const { adminSyncService, databaseService: warehouseDb, activityService, moderationService, liveMonitorService, productionStore } = warehouse;
const liveMonitorWs = createWebSocketHub();
const syncClients = new Set();
let dbWatchTimer = null;
let productionSyncTimer = null;
let lastDbSignature = "";
const normalDashboardUrl = process.env.NEURONEST_APP_URL || "http://localhost:3000";
const allowDevLogin =
  process.env.ALLOW_ADMIN_DEV_LOGIN === "true" &&
  process.env.NODE_ENV !== "production" &&
  !process.env.RENDER;
const allowEmailLogin = process.env.ADMIN_EMAIL_LOGIN_ENABLED === "true" && Boolean(process.env.ADMIN_EMAIL_ACCESS_CODE);
const sessions = new Map();
const rateLimitBuckets = new Map();

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    process.env[key] ||= value;
  }
}

function resolveDbPath() {
  const configured = process.env.NEURONEST_DB_PATH || "../pc-ai-dashboard/data/db.json";
  return path.isAbsolute(configured) ? configured : path.resolve(__dirname, configured);
}

function resolveUploadsPath() {
  const configured = process.env.NEURONEST_UPLOADS_PATH || "../pc-ai-dashboard/data/uploads";
  return path.isAbsolute(configured) ? configured : path.resolve(__dirname, configured);
}

function getGoogleClientId() {
  loadEnv();
  return process.env.GOOGLE_CLIENT_ID || "";
}

function getSuperAdminEmails() {
  loadEnv();
  const raw = String(process.env.SUPER_ADMIN_EMAILS || "").trim();
  if (!raw) return new Set();

  let values = [];
  if (raw.startsWith("[")) {
    try {
      values = JSON.parse(raw);
    } catch {
      values = raw.split(",");
    }
  } else {
    values = raw.split(",");
  }

  return new Set(
    values
      .map((value) => String(value).replace(/^mailto:/i, "").trim().toLowerCase())
      .filter(Boolean),
  );
}

function isSuperAdminEmail(email) {
  return getSuperAdminEmails().has(String(email || "").trim().toLowerCase());
}

function isValidAdminAccessCode(value) {
  const expected = Buffer.from(String(process.env.ADMIN_EMAIL_ACCESS_CODE || ""));
  const received = Buffer.from(String(value || ""));
  return expected.length > 0 && expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
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

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(text);
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function setAdminCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" || process.env.RENDER;
  const parts = [
    `neuronest_admin.sid=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=604800",
  ];
  if (secure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearAdminCookie(req, res) {
  const token = parseCookies(req)["neuronest_admin.sid"];
  if (token) sessions.delete(token);
  res.setHeader("Set-Cookie", "neuronest_admin.sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

function createSession(profile) {
  const token = crypto.randomUUID();
  const session = {
    token,
    admin: {
      id: profile.googleSub || `admin-${crypto.randomUUID()}`,
      googleSub: profile.googleSub || "",
      email: profile.email,
      name: profile.name || profile.email,
      picture: profile.picture || "",
      role: "Super Admin",
    },
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  sessions.set(token, session);
  return session;
}

function getSession(req) {
  const token = parseCookies(req)["neuronest_admin.sid"];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.lastSeenAt = new Date().toISOString();
  session.currentPage = "Admin Dashboard";
  return session;
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session || !isSuperAdminEmail(session.admin.email)) {
    sendJson(res, 401, { error: "Super Admin authentication required.", dashboardUrl: normalDashboardUrl });
    return null;
  }
  return session;
}

function decodeGoogleJwtPayload(credential) {
  const [, payloadPart] = String(credential || "").split(".");
  if (!payloadPart) throw new Error("Google credential is not a valid ID token.");
  const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
}

function profileFromGooglePayload(payload) {
  if (!getGoogleClientId()) throw new Error("GOOGLE_CLIENT_ID is not configured.");
  if (payload.aud !== getGoogleClientId()) {
    throw new Error("Google token audience does not match this admin app.");
  }
  if (payload.exp && Number(payload.exp) * 1000 < Date.now()) {
    throw new Error("Google token expired. Please sign in again.");
  }
  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    throw new Error("Google email is not verified.");
  }
  if (!payload.sub || !payload.email) {
    throw new Error("Google token is missing profile details.");
  }
  return {
    googleSub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture || "",
  };
}

async function verifyGoogleCredential(credential) {
  if (!getGoogleClientId()) throw new Error("GOOGLE_CLIENT_ID is not configured.");
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error_description || "Google token verification failed.");
  }
  return profileFromGooglePayload(payload);
}

function isRateLimited(key, maxRequests = 60, windowMs = 60_000) {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (bucket.resetAt < now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return bucket.count > maxRequests;
}

function defaultDb() {
  return {
    users: [],
    chats: {},
    entries: {},
    brainModels: {},
    lifeGoals: {},
    learningProfiles: {},
    adminUserStatus: {},
    adminLogs: [],
    announcements: [],
    moderationHistory: [],
    userNotifications: {},
    liveMonitoring: {
      activeSessions: {},
      sessionHistory: [],
      liveFeed: [],
      loginHistory: [],
      analytics: { peakOnlineToday: 0, peakOnlineAt: null, pageVisits: {}, featureUsage: {}, dailyActive: {}, weeklyActive: {} },
    },
  };
}

function readDb() {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`NeuroNest database not found at ${dbPath}`);
  }
  return warehouseDb.readDb();
}

function normalizeDb(db) {
  return warehouseDb.normalizeDb(db);
}

function writeDb(db) {
  warehouseDb.writeDb(db);
  scheduleSyncBroadcast();
}

function safeReadDb() {
  try {
    return { db: readDb(), error: null };
  } catch (error) {
    return { db: defaultDb(), error };
  }
}

function asDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function dayKey(value) {
  return asDate(value).toISOString().slice(0, 10);
}

function isToday(value) {
  return dayKey(value) === new Date().toISOString().slice(0, 10);
}

function withinDays(value, days) {
  const time = asDate(value).getTime();
  return Date.now() - time <= days * 24 * 60 * 60 * 1000;
}

function formatRelativeTime(value) {
  const diff = Math.max(0, Date.now() - asDate(value).getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

function shortUserId(user, index = 0) {
  if (!user?.id) return `USR-${String(index + 1).padStart(5, "0")}`;
  return `USR-${user.id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

function resolveUserRecord(db, userRef) {
  const ref = String(userRef || "").trim();
  if (!ref) return null;

  let user = db.users.find((item) => item.id === ref);
  if (user) return user;

  user = db.users.find((item, index) => shortUserId(item, index) === ref);
  if (user) return user;

  const lowered = ref.toLowerCase();
  user = db.users.find((item) => String(item.email || "").toLowerCase() === lowered);
  if (user) return user;

  return db.users.find((item) => item.googleSub === ref) || null;
}

function getUserStatus(db, user) {
  if (isSuperAdminEmail(user.email)) return "admin";
  return moderationService.normalizeStatus(moderationService.getEffectiveStatus(db, user.id)).toLowerCase().replace(/_/g, "-");
}

function getUserEntries(db, userId, includeDeleted = false) {
  return (db.entries?.[userId] || []).filter((entry) => includeDeleted || !entry.deletedAt);
}

function getUserChats(db, userId) {
  return db.chats?.[userId] || [];
}

function allEntries(db) {
  return Object.entries(db.entries || {}).flatMap(([userId, entries]) =>
    (entries || []).map((entry) => ({ ...entry, userId })),
  );
}

function allChats(db) {
  return Object.entries(db.chats || {}).flatMap(([userId, messages]) =>
    (messages || []).map((message) => ({ ...message, userId })),
  );
}

function textForEntry(entry) {
  return [entry.kind, entry.type, entry.source, entry.title, entry.body, entry.summary, ...(entry.tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function countEntriesBy(db, predicate) {
  return allEntries(db).filter((entry) => !entry.deletedAt && predicate(entry)).length;
}

function countVectors(db) {
  warehouseDb.normalizeWarehouse(db);
  return db.warehouse.embeddings.length;
}

function countEmbeddings(db) {
  warehouseDb.normalizeWarehouse(db);
  return db.warehouse.embeddings.filter((record) => record.provider === "openai").length;
}

function userActivityScore(db, user) {
  const entries = getUserEntries(db, user.id).length;
  const chats = getUserChats(db, user.id).length;
  const recent = withinDays(user.lastLoginAt || user.createdAt, 7) ? 20 : 0;
  return Math.min(100, Math.round(entries * 4 + chats * 1.2 + recent));
}

function userUsageStats(db, user) {
  const entries = getUserEntries(db, user.id);
  const chats = getUserChats(db, user.id);
  const kindCount = (pattern) => entries.filter((entry) => textForEntry(entry).includes(pattern)).length;
  return {
    memoryCount: entries.length,
    aiChats: chats.length,
    voiceNotes: kindCount("voice"),
    placesSaved: kindCount("place"),
    timelineEntries: entries.filter((entry) => textForEntry(entry).includes("timeline")).length || entries.length,
    screenshots: kindCount("screenshot"),
    aiRequests: chats.filter((message) => message.role === "assistant").length,
  };
}

function userIntelligenceStats(db, user) {
  const brain = db.brainModels?.[user.id] || {};
  const learning = db.learningProfiles?.[user.id] || {};
  const goals = db.lifeGoals?.[user.id] || [];
  const stats = userUsageStats(db, user);
  const understanding = Math.min(100, Math.round(42 + stats.memoryCount * 2 + stats.aiChats * 0.6));
  const goalAlignment = goals.length
    ? Math.round(
        goals.reduce((sum, goal) => sum + Number(goal.progress || goal.completion || goal.alignment || 50), 0) / goals.length,
      )
    : Math.min(96, Math.round(54 + stats.memoryCount * 1.2));

  return {
    understandingLevel: Number(brain.understandingLevel || learning.understandingLevel || understanding),
    memoryDna: brain.identity || learning.personalityType || "Creative Night Thinker",
    digitalTwinSummary:
      brain.summary ||
      learning.summary ||
      "NeuroNest is building a behavioral model from memories, chats, goals, and recurring routines.",
    goalAlignment,
    activityScore: userActivityScore(db, user),
  };
}

function publicUser(db, user, index = 0) {
  const usage = userUsageStats(db, user);
  return {
    id: user.id,
    userId: shortUserId(user, index),
    googleId: user.googleSub || "",
    name: user.name || user.email || "Unknown User",
    email: user.email || "",
    picture: user.picture || "",
    createdAt: user.createdAt || "",
    signupDate: user.createdAt || "",
    lastLoginAt: user.lastLoginAt || user.createdAt || "",
    lastLogin: formatRelativeTime(user.lastLoginAt || user.createdAt),
    status: getUserStatus(db, user),
    usage,
    activityScore: userActivityScore(db, user),
  };
}

function filterUsers(db, search = "", filter = "all") {
  const query = search.trim().toLowerCase();
  let users = db.users.map((user, index) => publicUser(db, user, index));

  if (query) {
    users = users.filter((user) =>
      [user.name, user.email, user.id, user.userId, user.googleId].some((value) =>
        String(value || "").toLowerCase().includes(query),
      ),
    );
  }

  if (filter === "active") users = users.filter((user) => user.status === "active");
  if (filter === "blocked") users = users.filter((user) => user.status === "blocked");
  if (filter === "suspended") users = users.filter((user) => user.status === "suspended");
  if (filter === "pending-review") users = users.filter((user) => user.status === "pending_review");
  if (filter === "admins") users = users.filter((user) => user.status === "admin");
  if (filter === "new-users") users = users.filter((user) => withinDays(user.createdAt, 7));
  if (filter === "most-active") users = users.sort((a, b) => b.activityScore - a.activityScore);

  return users.sort((a, b) => asDate(b.lastLoginAt) - asDate(a.lastLoginAt));
}

function trendFrom(todayCount, totalCount) {
  if (!totalCount) return "0.0%";
  return `${((todayCount / Math.max(1, totalCount)) * 100).toFixed(1)}%`;
}

function buildMetrics(db) {
  warehouseDb.normalizeWarehouse(db);
  const entries = allEntries(db).filter((entry) => !entry.deletedAt);
  const chats = allChats(db);
  const warehouse = db.warehouse;
  const moderation = moderationService.buildModerationAnalytics(db);
  const todayUsers = db.users.filter((user) => isToday(user.createdAt)).length;
  const activeUsers = moderation.activeUsers;
  const memories = warehouse.memories.length;
  const places = warehouse.places.length;
  const placeVisits = warehouse.placeMemories.length;
  const voice = warehouse.voiceNotes.length;
  const screenshots = warehouse.screenshots.length;
  const embeddings = countEmbeddings(db);
  const vectors = countVectors(db);
  const aiChats = warehouse.aiChats.length;
  const aiRequests = warehouse.aiUsage.length;
  const relationshipProfiles = warehouse.relationshipProfiles.length;
  const futurePredictions = warehouse.futurePredictions.length;

  return [
    { key: "users", label: "Total Users", value: db.users.length, accent: "blue", icon: "US", trend: trendFrom(todayUsers, db.users.length), trendLabel: "new today" },
    { key: "active", label: "Active Users", value: activeUsers, accent: "green", icon: "AC", trend: trendFrom(activeUsers, db.users.length), trendLabel: "active accounts" },
    { key: "blocked", label: "Blocked Users", value: moderation.blockedUsers, accent: "pink", icon: "BL", trend: trendFrom(moderation.blockedUsers, Math.max(db.users.length, 1)), trendLabel: "blocked" },
    { key: "suspended", label: "Suspended Users", value: moderation.suspendedUsers, accent: "orange", icon: "SU", trend: trendFrom(moderation.suspendedUsers, Math.max(db.users.length, 1)), trendLabel: "suspended" },
    { key: "pending", label: "Pending Review", value: moderation.pendingReviewUsers, accent: "violet", icon: "PR", trend: trendFrom(moderation.pendingReviewUsers, Math.max(db.users.length, 1)), trendLabel: "under review" },
    { key: "memories", label: "Total Memories", value: memories || entries.length, accent: "purple", icon: "ME", trend: trendFrom(entries.filter((entry) => isToday(entry.createdAt)).length, entries.length), trendLabel: "from today" },
    { key: "chats", label: "AI Conversations", value: aiChats, accent: "cyan", icon: "AI", trend: trendFrom(chats.filter((chat) => isToday(chat.createdAt)).length, chats.length), trendLabel: "from today" },
    { key: "places", label: "Total Places", value: places, accent: "orange", icon: "PL", trend: trendFrom(places, Math.max(entries.length, 1)), trendLabel: "of memories" },
    { key: "place-visits", label: "Automatic Place Visits", value: placeVisits, accent: "cyan", icon: "PV", trend: trendFrom(placeVisits, Math.max(places, 1)), trendLabel: "passively captured" },
    { key: "relationships", label: "People Relationships", value: relationshipProfiles, accent: "green", icon: "RI", trend: trendFrom(warehouse.relationshipEvents.length, Math.max(relationshipProfiles, 1)), trendLabel: "evidence signals" },
    { key: "future-predictions", label: "Future Predictions", value: futurePredictions, accent: "blue", icon: "FP", trend: trendFrom(warehouse.predictionHistory.length, Math.max(futurePredictions, 1)), trendLabel: "evaluated" },
    { key: "voice", label: "Voice Notes", value: voice, accent: "violet", icon: "VO", trend: trendFrom(voice, Math.max(entries.length, 1)), trendLabel: "of memories" },
    { key: "screenshots", label: "Screenshots", value: screenshots, accent: "pink", icon: "SC", trend: trendFrom(screenshots, Math.max(entries.length, 1)), trendLabel: "of memories" },
    { key: "embeddings", label: "Embeddings", value: embeddings, accent: "cyan", icon: "EM", trend: trendFrom(vectors, Math.max(embeddings, 1)), trendLabel: "vectorized" },
    { key: "vectors", label: "Vector Records", value: vectors, accent: "blue", icon: "VX", trend: trendFrom(vectors, Math.max(entries.length, 1)), trendLabel: "coverage" },
    { key: "requests", label: "Total AI Requests", value: aiRequests, accent: "purple", icon: "RQ", trend: trendFrom(aiRequests, Math.max(aiRequests, 1)), trendLabel: "recorded requests" },
  ];
}

function buildUserGrowth(db, days = 7) {
  const points = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const count = db.users.filter((user) => dayKey(user.createdAt) <= key).length;
    points.push({
      label: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: count,
    });
  }
  return points;
}

function buildAiUsage(db) {
  warehouseDb.normalizeWarehouse(db);
  const warehouse = db.warehouse;
  const aiChat = warehouse.aiChats.length;
  const memorySearch = warehouse.aiUsage.filter((item) => item.type === "memory-search" || item.capability === "semantic-search").length;
  const embeddings = countEmbeddings(db);
  const voiceProcessing = warehouse.voiceNotes.length;
  const predictions = warehouse.futurePredictions.length || warehouse.predictions.length;
  const total = Math.max(1, aiChat + memorySearch + embeddings + voiceProcessing + predictions);
  return [
    { label: "AI Chat", value: aiChat, color: "#8a4dff", percent: Math.round((aiChat / total) * 1000) / 10 },
    { label: "Memory Search", value: memorySearch, color: "#3478ff", percent: Math.round((memorySearch / total) * 1000) / 10 },
    { label: "Embeddings", value: embeddings, color: "#24d7ff", percent: Math.round((embeddings / total) * 1000) / 10 },
    { label: "Voice Processing", value: voiceProcessing, color: "#f7a531", percent: Math.round((voiceProcessing / total) * 1000) / 10 },
    { label: "Predictions", value: predictions, color: "#6d8fbf", percent: Math.round((predictions / total) * 1000) / 10 },
  ];
}

function buildLanguageBreakdown(db) {
  const counts = new Map();
  for (const profile of Object.values(db.learningProfiles || {})) {
    const languageUsage = profile.languageUsage || profile.languages || {};
    for (const [language, count] of Object.entries(languageUsage)) {
      counts.set(language, (counts.get(language) || 0) + Number(count || 0));
    }
  }
  for (const message of allChats(db).filter((chat) => chat.role === "user")) {
    const text = String(message.content || "");
    const language = /[\u0900-\u097F]/.test(text)
      ? "Hindi"
      : /\b(kal|mera|meri|hai|tha|kya|bhai|aaj)\b/i.test(text)
        ? "Hinglish"
        : "English";
    counts.set(language, (counts.get(language) || 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value]) => ({ label, value, percent: Math.round((value / total) * 1000) / 10 }));
}

function buildPlaceAnalytics(db) {
  warehouseDb.normalizeWarehouse(db);
  const visits = db.warehouse.placeMemories || [];
  const countBy = (key) => {
    const counts = new Map();
    visits.forEach((visit) => {
      const value = String(visit[key] || "Unknown").trim() || "Unknown";
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  };
  const totalDurationMinutes = visits.reduce((sum, visit) => sum + Number(visit.durationMinutes || 0), 0);
  const uniqueUsers = new Set(visits.map((visit) => visit.userId).filter(Boolean)).size;
  const resolved = visits.filter((visit) => String(visit.metadataStatus || "").startsWith("resolved")).length;
  return {
    totalVisits: visits.length,
    uniqueUsers,
    totalDurationMinutes,
    averageDurationMinutes: visits.length ? Math.round(totalDurationMinutes / visits.length) : 0,
    metadataCoverage: visits.length ? Math.round((resolved / visits.length) * 100) : 0,
    topLocations: countBy("placeName").slice(0, 12),
    categories: countBy("category").slice(0, 12),
    recentVisits: [...visits]
      .sort((a, b) => asDate(b.departureTime || b.createdAt) - asDate(a.departureTime || a.createdAt))
      .slice(0, 50),
  };
}

function buildRelationshipAnalytics(db) {
  warehouseDb.normalizeWarehouse(db);
  const warehouse = db.warehouse;
  const relationships = warehouse.relationshipProfiles || [];
  const events = warehouse.relationshipEvents || [];
  const insights = warehouse.relationshipInsights || [];
  const clusters = warehouse.relationshipClusters || [];
  const totalStrength = relationships.reduce((sum, item) => sum + Number(item.relationshipStrength || 0), 0);
  const reconnect = relationships.filter((item) => Number(item.reconnectScore || 0) >= 45);
  const health = relationships.reduce((acc, item) => {
    const key = item.relationshipHealth || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const relationshipGrowth = relationships.filter((item) => withinDays(item.firstSeen || item.createdAt, 7)).length;
  const strongestRelationships = [...relationships]
    .sort((a, b) => Number(b.relationshipStrength || 0) - Number(a.relationshipStrength || 0))
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      userId: item.userId,
      personName: item.personName,
      relationshipType: item.relationshipType,
      relationshipStrength: item.relationshipStrength,
      relationshipHealth: item.relationshipHealth,
      lastSeen: item.lastSeen,
      interactionCount: item.interactionCount,
    }));
  return {
    totalRelationships: relationships.length,
    totalEvents: events.length,
    totalInsights: insights.length,
    totalClusters: clusters.length,
    strongestRelationships,
    averageStrength: relationships.length ? Math.round(totalStrength / relationships.length) : 0,
    relationshipGrowth,
    reconnectCandidates: reconnect
      .sort((a, b) => Number(b.reconnectScore || 0) - Number(a.reconnectScore || 0))
      .slice(0, 12),
    health,
    recentInsights: [...insights]
      .sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt))
      .slice(0, 20),
    clusters: [...clusters].sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0)).slice(0, 16),
  };
}

function buildPredictionAnalytics(db) {
  warehouseDb.normalizeWarehouse(db);
  const warehouse = db.warehouse;
  const predictions = warehouse.futurePredictions || [];
  const models = warehouse.predictionModels || [];
  const history = warehouse.predictionHistory || [];
  const byType = predictions.reduce((acc, item) => {
    const key = item.type || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const confidenceBuckets = predictions.reduce(
    (acc, item) => {
      const confidence = Number(item.confidence || 0);
      if (confidence >= 80) acc.high += 1;
      else if (confidence >= 55) acc.medium += 1;
      else acc.low += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 },
  );
  const riskDistribution = predictions.reduce((acc, item) => {
    const key = item.riskLevel || "Low";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const averageConfidence = predictions.length
    ? Math.round(predictions.reduce((sum, item) => sum + Number(item.confidence || 0), 0) / predictions.length)
    : 0;
  const successful = history.filter((item) => item.success).length;
  return {
    totalPredictions: predictions.length,
    totalModels: models.length,
    totalHistory: history.length,
    averageConfidence,
    accuracy: history.length ? Math.round((successful / history.length) * 100) : 0,
    byType,
    confidenceBuckets,
    riskDistribution,
    recentPredictions: [...predictions]
      .sort((a, b) => asDate(b.generatedAt) - asDate(a.generatedAt))
      .slice(0, 30),
    topModels: [...models]
      .sort((a, b) => Number(b.averageConfidence || 0) - Number(a.averageConfidence || 0))
      .slice(0, 16),
    recentHistory: [...history]
      .sort((a, b) => asDate(b.evaluatedAt) - asDate(a.evaluatedAt))
      .slice(0, 30),
  };
}

function healthItem(name, ok, detail = "") {
  return {
    name,
    status: ok ? "healthy" : "warning",
    label: ok ? "Healthy" : "Needs config",
    detail,
  };
}

function buildSystemHealth(dbError = null) {
  const { db } = safeReadDb();
  const vectors = countVectors(db);
  return [
    healthItem("Server", true, "Admin API online"),
    healthItem("Database", !dbError, dbError ? dbError.message : "Shared data source readable"),
    healthItem("Generative AI", Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY), process.env.GROQ_API_KEY ? "Groq configured" : process.env.OPENAI_API_KEY ? "OpenAI configured" : "GROQ_API_KEY or OPENAI_API_KEY missing"),
    healthItem("Google Auth", Boolean(getGoogleClientId()), getGoogleClientId() ? "OAuth client configured" : "GOOGLE_CLIENT_ID missing"),
    healthItem("Maps Service", Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAP_API_KEY), "Google Maps key indicator"),
    healthItem("Embedding Service", Boolean(process.env.OPENAI_API_KEY), process.env.OPENAI_API_KEY ? "Uses OpenAI embeddings" : "Optional OpenAI embeddings not configured"),
    healthItem("Vector DB", Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY), process.env.SUPABASE_URL ? "Supabase configured" : `${vectors} warehouse vector records; external vector DB not configured`),
  ];
}

function systemHealthScore(items) {
  return Math.round((items.filter((item) => item.status === "healthy").length / Math.max(1, items.length)) * 100);
}

function buildRecentActivity(db) {
  warehouseDb.normalizeWarehouse(db);
  const userById = new Map(db.users.map((user) => [user.id, user]));
  const stream = (db.warehouse.activityStream || []).slice(0, 100).map((event) => {
    const user = userById.get(event.userId);
    return {
      type: String(event.action || "activity").toLowerCase(),
      title: event.action.replace(/_/g, " "),
      detail: `${event.metadata?.title || event.metadata?.fileName || event.metadata?.preview || user?.email || "User activity"}`.trim(),
      timestamp: event.timestamp,
      userId: event.userId,
    };
  });

  if (stream.length) {
    return stream
      .filter((item) => item.timestamp)
      .sort((a, b) => asDate(b.timestamp) - asDate(a.timestamp))
      .slice(0, 24)
      .map((item) => ({ ...item, relativeTime: formatRelativeTime(item.timestamp) }));
  }

  const userByIdLegacy = userById;
  const activities = [];

  for (const user of db.users) {
    activities.push({
      type: "user",
      title: "New user registered",
      detail: user.email || user.name,
      timestamp: user.createdAt || user.lastLoginAt,
    });
    if (user.lastLoginAt) {
      activities.push({
        type: "login",
        title: "User login",
        detail: user.email || user.name,
        timestamp: user.lastLoginAt,
      });
    }
  }

  for (const entry of allEntries(db)) {
    const user = userByIdLegacy.get(entry.userId);
    activities.push({
      type: textForEntry(entry).includes("voice") ? "voice" : "memory",
      title: textForEntry(entry).includes("place") ? "Place saved" : "Memory created",
      detail: `${entry.title || "Untitled"}${user?.email ? ` - ${user.email}` : ""}`,
      timestamp: entry.createdAt || entry.updatedAt,
    });
  }

  for (const message of allChats(db).filter((chat) => chat.role === "assistant")) {
    const user = userByIdLegacy.get(message.userId);
    activities.push({
      type: "ai",
      title: "AI conversation processed",
      detail: user?.email || "Unknown user",
      timestamp: message.createdAt,
    });
  }

  for (const log of db.adminLogs || []) {
    activities.push({
      type: "admin",
      title: log.action || "Admin action",
      detail: log.detail || log.targetUserId || log.adminEmail || "",
      timestamp: log.createdAt,
    });
  }

  return activities
    .filter((item) => item.timestamp)
    .sort((a, b) => asDate(b.timestamp) - asDate(a.timestamp))
    .slice(0, 24)
    .map((item) => ({ ...item, relativeTime: formatRelativeTime(item.timestamp) }));
}

function buildOverview() {
  const { db, error } = safeReadDb();
  const health = buildSystemHealth(error);
  const aiUsage = buildAiUsage(db);
  return {
    generatedAt: new Date().toISOString(),
    dbPath,
    metrics: buildMetrics(db),
    userGrowth: buildUserGrowth(db),
    aiUsage,
    aiUsageTotal: aiUsage.reduce((sum, item) => sum + item.value, 0),
    languageBreakdown: buildLanguageBreakdown(db),
    health,
    healthScore: systemHealthScore(health),
    recentActivity: buildRecentActivity(db).slice(0, 8),
    recentUsers: filterUsers(db, "", "all").slice(0, 8),
    warehouse: adminSyncService.buildSyncSnapshot(db),
    moderation: moderationService.buildModerationAnalytics(db),
  };
}

function logAdminAction(db, admin, action, detail = "", targetUserId = "") {
  db.adminLogs ||= [];
  db.adminLogs.unshift({
    id: crypto.randomUUID(),
    adminEmail: admin.email,
    action,
    detail,
    targetUserId,
    createdAt: new Date().toISOString(),
  });
  db.adminLogs = db.adminLogs.slice(0, 500);
}

function getInspectableUser(db, userId) {
  const user = resolveUserRecord(db, userId);
  if (!user) return null;
  const publicData = publicUser(db, user, db.users.indexOf(user));
  const warehouseDetail = adminSyncService.buildUserDetail(db, userId) || {};
  const stats = warehouseDetail.stats || userUsageStats(db, user);

  const mapRecent = (items, titleKey, typeKey = "type") =>
    (items || []).slice(0, 12).map((item) => ({
      id: item.id,
      title: item[titleKey] || item.message || item.placeName || "Untitled",
      type: item[typeKey] || item.action || "record",
      createdAt: item.createdDate || item.timestamp || item.uploadDate,
      relativeTime: formatRelativeTime(item.createdDate || item.timestamp || item.uploadDate),
      content: item.content || item.response || item.ocrSummary || item.transcript || "",
      fileUrl: item.fileUrl || "",
      deleted: Boolean(item.deletedAt),
    }));

  return {
    ...publicData,
    usage: {
      memoryCount: stats.memoryCount,
      aiChats: stats.chatCount,
      voiceNotes: stats.voiceNotesCount,
      placesSaved: stats.placeCount,
      timelineEntries: stats.timelineCount,
      screenshots: stats.screenshotCount,
      aiRequests: stats.aiRequestsCount,
    },
    intelligence: userIntelligenceStats(db, user),
    recentMemories: mapRecent(warehouseDetail.memories, "title", "type"),
    recentChats: mapRecent(warehouseDetail.chats, "message").map((item) => ({
      ...item,
      role: item.type,
      content: item.content || item.title,
    })),
    screenshots: mapRecent(warehouseDetail.screenshots, "fileName").map((item) => ({
      ...item,
      ocrSummary: item.content,
    })),
    voiceNotes: mapRecent(warehouseDetail.voiceNotes, "transcript"),
    places: mapRecent(warehouseDetail.places, "placeName"),
    timeline: mapRecent(warehouseDetail.timeline, "title"),
    activityHistory: (warehouseDetail.activityHistory || []).slice(0, 12).map((item) => ({
      ...item,
      relativeTime: formatRelativeTime(item.timestamp),
    })),
    warehouse: warehouseDetail,
    moderation: moderationService.getUserModerationPanel(db, user.id),
    activityLogs: (db.adminLogs || [])
      .filter((log) => log.targetUserId === user.id)
      .slice(0, 10)
      .map((log) => ({ ...log, relativeTime: formatRelativeTime(log.createdAt) })),
  };
}

function exportUserData(db, userId) {
  const user = db.users.find((item) => item.id === userId);
  if (!user) return null;
  return {
    user,
    chats: db.chats?.[userId] || [],
    entries: db.entries?.[userId] || [],
    brainModel: db.brainModels?.[userId] || null,
    lifeGoals: db.lifeGoals?.[userId] || [],
    learningProfile: db.learningProfiles?.[userId] || null,
    adminStatus: db.adminUserStatus?.[userId] || null,
  };
}

function applyUserAction(db, admin, userRef, action, payload = {}) {
  const user = resolveUserRecord(db, userRef);
  if (!user) return { status: 404, payload: { error: "User not found." } };
  const userId = user.id;
  if (isSuperAdminEmail(user.email) && ["block", "suspend", "deleteUser", "resetUserData", "pendingReview"].includes(action)) {
    return { status: 403, payload: { error: "Protected Super Admin accounts cannot be modified by this action." } };
  }

  const confirm = Boolean(payload.confirm);
  const destructive = new Set(["deleteUser", "resetUserData", "forceLogout", "logoutAllDevices"]);
  if (destructive.has(action) && !confirm) {
    return { status: 409, payload: { error: "Confirmation required.", requiresConfirmation: true } };
  }

  const moderationActions = new Set([
    "block",
    "unblock",
    "suspend",
    "unsuspend",
    "forceLogout",
    "logoutAllDevices",
    "saveAccountNotes",
    "pendingReview",
  ]);
  if (moderationActions.has(action)) {
    try {
      const moderation = moderationService.applyModerationAction(db, userId, admin.email, action, payload);
      if (action === "forceLogout" || action === "logoutAllDevices") {
        liveMonitorService.endAllUserSessions(db, userId, action);
      }
      logAdminAction(db, admin, action, `${user.name || user.email} moderated`, userId);
      return { status: 200, payload: { ok: true, action, moderation, user: getInspectableUser(db, userId) } };
    } catch (error) {
      return { status: 400, payload: { error: error.message } };
    }
  }

  db.adminUserStatus ||= {};

  if (action === "resetUserData") {
    delete db.chats[userId];
    delete db.entries[userId];
    delete db.brainModels[userId];
    delete db.lifeGoals[userId];
    delete db.learningProfiles[userId];
    adminSyncService.purgeUserWarehouse(db, userId);
  } else if (action === "deleteUser") {
    db.users = db.users.filter((item) => item.id !== userId);
    delete db.chats[userId];
    delete db.entries[userId];
    delete db.brainModels[userId];
    delete db.lifeGoals[userId];
    delete db.learningProfiles[userId];
    delete db.adminUserStatus[userId];
    adminSyncService.purgeUserWarehouse(db, userId);
    logAdminAction(db, admin, "Delete User", user.email, userId);
    return { status: 200, payload: { ok: true, action, deleted: true } };
  } else if (action === "exportUserData") {
    logAdminAction(db, admin, "Export User Data", user.email, userId);
    return { status: 200, payload: { ok: true, action, export: exportUserData(db, userId) } };
  } else if (action === "viewActivityLogs") {
    return {
      status: 200,
      payload: {
        ok: true,
        action,
        logs: (db.adminLogs || []).filter((log) => log.targetUserId === userId),
      },
    };
  } else {
    return { status: 400, payload: { error: "Unsupported admin action." } };
  }

  logAdminAction(db, admin, action, `${user.name || user.email} -> ${action}`, userId);
  return { status: 200, payload: { ok: true, action, user: getInspectableUser(db, userId) } };
}

function collectionRows(db, collection) {
  const maxRows = 300;
  if (collection === "users") {
    return {
      columns: ["name", "email", "status", "createdAt", "lastLoginAt"],
      rows: db.users.map((user, index) => publicUser(db, user, index)).slice(0, maxRows),
    };
  }
  if (collection === "chats") {
    return {
      columns: ["userId", "role", "content", "createdAt"],
      rows: allChats(db)
        .sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt))
        .slice(0, maxRows),
    };
  }
  if (collection === "memories" || collection === "timeline") {
    const rows = allEntries(db)
      .filter((entry) => collection === "memories" || textForEntry(entry).includes("timeline"))
      .sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt))
      .slice(0, maxRows);
    return { columns: ["userId", "kind", "type", "title", "createdAt", "deletedAt"], rows };
  }
  if (collection === "voice") {
    return {
      columns: ["userId", "title", "summary", "createdAt"],
      rows: allEntries(db)
        .filter((entry) => textForEntry(entry).includes("voice"))
        .slice(0, maxRows),
    };
  }
  if (collection === "places") {
    return {
      columns: ["userId", "title", "location", "createdAt"],
      rows: allEntries(db)
        .filter((entry) => textForEntry(entry).includes("place"))
        .slice(0, maxRows),
    };
  }
  if (collection === "place_memories" || collection === "placeMemories") {
    const rows = adminSyncService.getWarehouseCollection(db, "placeMemories", maxRows);
    return {
      columns: ["userId", "placeName", "category", "arrivalTime", "departureTime", "durationMinutes", "metadataStatus"],
      rows,
    };
  }
  if (collection === "embeddings" || collection === "vectors") {
    const rows = adminSyncService.getWarehouseCollection(db, collection, maxRows);
    return {
      columns: ["userId", "memoryId", "provider", "model", "dimensions", "updatedAt"],
      rows,
    };
  }
  if (collection === "relationship_profiles" || collection === "relationshipProfiles" || collection === "people_relationships") {
    const rows = adminSyncService.getWarehouseCollection(db, "relationshipProfiles", maxRows);
    return {
      columns: ["userId", "personName", "relationshipType", "relationshipStrength", "relationshipHealth", "lastSeen", "interactionCount"],
      rows,
    };
  }
  if (collection === "relationship_events" || collection === "relationshipEvents") {
    const rows = adminSyncService.getWarehouseCollection(db, "relationshipEvents", maxRows);
    return {
      columns: ["userId", "relationshipId", "sourceType", "interactionType", "sentiment", "timestamp"],
      rows,
    };
  }
  if (collection === "relationship_insights" || collection === "relationshipInsights") {
    const rows = adminSyncService.getWarehouseCollection(db, "relationshipInsights", maxRows);
    return {
      columns: ["userId", "relationshipId", "insightType", "insightText", "confidence", "createdAt"],
      rows,
    };
  }
  if (collection === "relationship_clusters" || collection === "relationshipClusters") {
    const rows = adminSyncService.getWarehouseCollection(db, "relationshipClusters", maxRows);
    return {
      columns: ["userId", "clusterName", "members", "confidence", "createdAt"],
      rows,
    };
  }
  if (collection === "future_predictions" || collection === "futurePredictions" || collection === "predictions") {
    const rows = adminSyncService.getWarehouseCollection(db, "futurePredictions", maxRows);
    return {
      columns: ["userId", "type", "title", "confidence", "predictionScore", "riskLevel", "evidenceCount", "generatedAt"],
      rows,
    };
  }
  if (collection === "prediction_models" || collection === "predictionModels") {
    const rows = adminSyncService.getWarehouseCollection(db, "predictionModels", maxRows);
    return {
      columns: ["userId", "modelType", "evidenceCount", "predictionCount", "averageConfidence", "averageScore", "updatedAt"],
      rows,
    };
  }
  if (collection === "prediction_history" || collection === "predictionHistory") {
    const rows = adminSyncService.getWarehouseCollection(db, "predictionHistory", maxRows);
    return {
      columns: ["userId", "predictionId", "predictionType", "outcome", "success", "confidence", "evaluatedAt"],
      rows,
    };
  }
  if (collection === "announcements") {
    return { columns: ["title", "type", "active", "createdAt", "createdBy"], rows: db.announcements.slice(0, maxRows) };
  }
  if (collection === "adminLogs") {
    return { columns: ["adminEmail", "action", "detail", "createdAt"], rows: db.adminLogs.slice(0, maxRows) };
  }
  if (collection === "screenshots") {
    const rows = adminSyncService.getWarehouseCollection(db, "screenshots", maxRows);
    return { columns: ["userId", "fileName", "fileUrl", "uploadDate", "ocrSummary"], rows };
  }
  if (collection === "activityStream") {
    const rows = adminSyncService.getWarehouseCollection(db, "activityStream", maxRows);
    return { columns: ["userId", "action", "metadata", "timestamp"], rows };
  }
  if (collection === "moderationHistory") {
    return {
      columns: ["action", "adminEmail", "targetUserId", "reason", "timestamp"],
      rows: (db.moderationHistory || []).slice(0, maxRows),
    };
  }
  if (collection === "fileStorage") {
    const rows = adminSyncService.getWarehouseCollection(db, "fileStorage", maxRows);
    return { columns: ["userId", "fileName", "fileUrl", "kind", "createdAt"], rows };
  }
  if (collection === "liveMonitoring") {
    liveMonitorService.pruneStaleSessions(db);
    const live = db.liveMonitoring || {};
    const rows = [
      ...Object.values(live.activeSessions || {}).map((session) => ({ ...session, recordType: "active" })),
      ...(live.sessionHistory || []).slice(0, maxRows).map((session) => ({ ...session, recordType: "history" })),
    ].slice(0, maxRows);
    return {
      columns: ["recordType", "userId", "name", "email", "currentPage", "currentAction", "loginAt", "lastActivityAt"],
      rows,
    };
  }
  const warehouseRows = adminSyncService.getWarehouseCollection(db, collection, maxRows);
  if (warehouseRows.length) {
    const columns = Object.keys(warehouseRows[0] || {});
    return { columns, rows: warehouseRows };
  }
  return { columns: [], rows: [] };
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
      ".webm": "audio/webm",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
    }[ext] || "application/octet-stream"
  );
}

function dbSignature() {
  try {
    const stat = fs.statSync(dbPath);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "";
  }
}

function broadcastSyncSnapshot(force = false) {
  const signature = dbSignature();
  if (!force && signature === lastDbSignature) return;
  lastDbSignature = signature;
  const { db } = safeReadDb();
  const snapshot = adminSyncService.buildSyncSnapshot(db);
  const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
  for (const client of syncClients) {
    client.write(payload);
  }
  broadcastLiveMonitor(force);
}

function broadcastLiveMonitor(force = false) {
  const { db } = safeReadDb();
  const snapshot = liveMonitorService.buildLiveMonitorSnapshot(db);
  liveMonitorWs.broadcast({ type: "live-monitor", ...snapshot, force: Boolean(force) });
}

function scheduleSyncBroadcast() {
  clearTimeout(dbWatchTimer);
  dbWatchTimer = setTimeout(broadcastSyncSnapshot, 120);
}

function startDbWatcher() {
  if (!fs.existsSync(dbPath)) return;
  lastDbSignature = dbSignature();
  fs.watch(dbPath, { persistent: true }, () => {
    scheduleSyncBroadcast();
  });
}

async function syncProductionSource() {
  if (!productionStore.ready()) return;
  try {
    const db = readDb();
    await productionStore.hydrateAdminDb(db);
    writeDb(db);
  } catch (error) {
    console.error(`Supabase admin sync failed: ${error.message}`);
  }
}

function startProductionSync() {
  if (!productionStore.ready()) return;
  void syncProductionSource();
  clearInterval(productionSyncTimer);
  productionSyncTimer = setInterval(() => void syncProductionSource(), Number(process.env.ADMIN_PRODUCTION_SYNC_MS || 15000));
}

function serveStatic(req, res, url) {
  const requested = url.pathname === "/" || url.pathname === "/admin" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) return sendText(res, 403, "Forbidden");

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, {
      "Content-Type": contentTypeFor(filePath),
      "Cache-Control": filePath.endsWith("index.html") ? "no-store" : "public, max-age=86400",
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  const indexPath = path.join(publicDir, "index.html");
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
  return fs.createReadStream(indexPath).pipe(res);
}

async function handleApi(req, res, url) {
  const ip = req.socket.remoteAddress || "unknown";
  if (isRateLimited(ip, 160, 60_000)) return sendJson(res, 429, { error: "Too many admin requests. Slow down briefly." });

  if (req.method === "GET" && url.pathname === "/api/admin/config") {
    return sendJson(res, 200, {
      googleClientId: getGoogleClientId(),
      adminConfigured: getSuperAdminEmails().size > 0,
      allowDevLogin,
      allowEmailLogin,
      dashboardUrl: normalDashboardUrl,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/auth/google") {
    try {
      const body = await readBody(req);
      if (!body.credential) return sendJson(res, 400, { error: "Missing Google credential." });
      const profile = await verifyGoogleCredential(body.credential);
      if (!isSuperAdminEmail(profile.email)) {
        return sendJson(res, 403, {
          error: "Access Denied",
          message: "This Google account is not approved as a NeuroNest Super Admin.",
          dashboardUrl: normalDashboardUrl,
        });
      }
      const session = createSession(profile);
      setAdminCookie(res, session.token);
      return sendJson(res, 200, { admin: session.admin });
    } catch (error) {
      return sendJson(res, 401, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/admin/auth/dev") {
    try {
      if (!allowDevLogin) return sendJson(res, 403, { error: "Local admin dev login is disabled." });
      const body = await readBody(req);
      if (!isSuperAdminEmail(body.email)) return sendJson(res, 403, { error: "Access Denied", dashboardUrl: normalDashboardUrl });
      const session = createSession({
        googleSub: "local-admin",
        email: body.email,
        name: body.name || "Super Admin",
        picture: "",
      });
      setAdminCookie(res, session.token);
      return sendJson(res, 200, { admin: session.admin });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/admin/auth/email") {
    try {
      if (!allowEmailLogin) return sendJson(res, 403, { error: "Admin email login is not configured." });
      if (isRateLimited(`admin-email-login:${ip}`, 8, 15 * 60_000)) {
        return sendJson(res, 429, { error: "Too many email login attempts. Try again later." });
      }
      const body = await readBody(req);
      if (!isSuperAdminEmail(body.email) || !isValidAdminAccessCode(body.accessCode)) {
        return sendJson(res, 403, { error: "Invalid approved admin email or access code." });
      }
      const email = String(body.email).trim().toLowerCase();
      const session = createSession({
        googleSub: `email-admin:${email}`,
        email,
        name: body.name || "Super Admin",
        picture: "",
      });
      setAdminCookie(res, session.token);
      return sendJson(res, 200, { admin: session.admin });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/admin/me") {
    const session = getSession(req);
    return sendJson(res, 200, { admin: session?.admin || null });
  }

  if (req.method === "POST" && url.pathname === "/api/admin/logout") {
    clearAdminCookie(req, res);
    return sendJson(res, 200, { ok: true });
  }

  const protectedNamespaces = ["/api/admin/", "/api/users/", "/api/system/", "/api/analytics/", "/api/database/"];
  if (protectedNamespaces.some((namespace) => url.pathname.startsWith(namespace))) {
    const session = requireAdmin(req, res);
    if (!session) return;

    try {

  if (req.method === "GET" && url.pathname === "/api/admin/overview") {
    return sendJson(res, 200, buildOverview());
  }

  if (
    req.method === "GET" &&
    url.pathname === "/api/admin/live-users"
  ) {
    return sendJson(res, 200, {
      users: []
    });
    }
      if (req.method === "GET" && url.pathname === "/api/admin/sync/snapshot") {
        const { db } = safeReadDb();
        return sendJson(res, 200, adminSyncService.buildSyncSnapshot(db));
      }

      if (req.method === "GET" && url.pathname === "/api/admin/sync/stream") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        });
        res.write(": connected\n\n");
        syncClients.add(res);
        req.on("close", () => syncClients.delete(res));
        broadcastSyncSnapshot(true);
        return;
      }

      const adminFileRoute = url.pathname.match(/^\/api\/admin\/files\/([^/]+)\/([^/]+)$/);
      if (req.method === "GET" && adminFileRoute) {
        const storedPath = warehouseDb.resolveStoredFile(decodeURIComponent(adminFileRoute[1]), decodeURIComponent(adminFileRoute[2]));
        if (!storedPath) return sendJson(res, 404, { error: "File not found." });
        res.writeHead(200, { "Content-Type": contentTypeFor(storedPath), "Cache-Control": "public, max-age=86400" });
        return fs.createReadStream(storedPath).pipe(res);
      }

      if (req.method === "GET" && url.pathname === "/api/admin/users") {
        const { db } = safeReadDb();
        const search = url.searchParams.get("search") || "";
        const filter = url.searchParams.get("filter") || "all";
        return sendJson(res, 200, { users: filterUsers(db, search, filter) });
      }

      const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
      if (req.method === "GET" && userMatch) {
        const { db } = safeReadDb();
        const user = getInspectableUser(db, decodeURIComponent(userMatch[1]));
        return user ? sendJson(res, 200, { user }) : sendJson(res, 404, { error: "User not found." });
      }

      const actionMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/action$/);
      if (req.method === "POST" && actionMatch) {
        const body = await readBody(req);
        const db = readDb();
        const result = applyUserAction(db, session.admin, decodeURIComponent(actionMatch[1]), body.action, body);
        if (result.status < 400) writeDb(db);
        return sendJson(res, result.status, result.payload);
      }

      const moderationMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/moderation$/);
      if (req.method === "POST" && moderationMatch) {
        const body = await readBody(req);
        const db = readDb();
        const result = applyUserAction(db, session.admin, decodeURIComponent(moderationMatch[1]), body.action, body);
        if (result.status < 400) writeDb(db);
        return sendJson(res, result.status, result.payload);
      }

      if (req.method === "GET" && url.pathname === "/api/admin/moderation/analytics") {
        const { db } = safeReadDb();
        return sendJson(res, 200, moderationService.buildModerationAnalytics(db));
      }

      if (req.method === "GET" && url.pathname === "/api/admin/live-monitor/overview") {
        const { db } = safeReadDb();
        return sendJson(res, 200, liveMonitorService.buildLiveMonitorSnapshot(db));
      }

      if (req.method === "GET" && url.pathname === "/api/admin/live-monitor/feed") {
        const { db } = safeReadDb();
        return sendJson(res, 200, { feed: liveMonitorService.buildLiveFeed(db, 100) });
      }

      if (req.method === "GET" && url.pathname === "/api/admin/live-monitor/analytics") {
        const { db } = safeReadDb();
        return sendJson(res, 200, liveMonitorService.buildLiveAnalytics(db));
      }

      const liveUserMatch = url.pathname.match(/^\/api\/admin\/live-monitor\/users\/([^/]+)$/);
      if (req.method === "GET" && liveUserMatch) {
        const { db } = safeReadDb();
        const user = resolveUserRecord(db, decodeURIComponent(liveUserMatch[1]));
        if (!user) return sendJson(res, 404, { error: "User not found." });
        const detail = liveMonitorService.getUserLiveDetail(db, user.id);
        return detail ? sendJson(res, 200, { detail }) : sendJson(res, 404, { error: "User not found." });
      }

      if (req.method === "GET" && url.pathname === "/api/admin/live-monitor/sessions") {
        const { db } = safeReadDb();
        liveMonitorService.pruneStaleSessions(db);
        return sendJson(res, 200, {
          active: Object.values(db.liveMonitoring?.activeSessions || {}),
          history: (db.liveMonitoring?.sessionHistory || []).slice(0, 100),
        });
      }

      if (req.method === "GET" && url.pathname === "/api/admin/system/health") {
        const { error } = safeReadDb();
        const health = buildSystemHealth(error);
        return sendJson(res, 200, { health, score: systemHealthScore(health), checkedAt: new Date().toISOString() });
      }

      if (req.method === "GET" && url.pathname === "/api/admin/analytics/ai") {
        const { db } = safeReadDb();
        return sendJson(res, 200, {
          usage: buildAiUsage(db),
          languageBreakdown: buildLanguageBreakdown(db),
          requests: allChats(db).filter((chat) => chat.role === "assistant").length,
          embeddings: countEmbeddings(db),
          averageResponseTimeMs: 820,
          memorySearchVolume: allChats(db).filter((chat) => /memory|search|show|find/i.test(chat.content || "")).length,
          predictionUsage: (db.warehouse?.futurePredictions || []).length,
          voiceAssistantUsage: countEntriesBy(db, (entry) => textForEntry(entry).includes("voice")),
        });
      }

      if (req.method === "GET" && url.pathname === "/api/admin/analytics/places") {
        const { db } = safeReadDb();
        return sendJson(res, 200, buildPlaceAnalytics(db));
      }

      if (req.method === "GET" && url.pathname === "/api/admin/analytics/relationships") {
        const { db } = safeReadDb();
        return sendJson(res, 200, buildRelationshipAnalytics(db));
      }

      if (req.method === "GET" && url.pathname === "/api/admin/analytics/predictions") {
        const { db } = safeReadDb();
        return sendJson(res, 200, buildPredictionAnalytics(db));
      }

      const dbMatch = url.pathname.match(/^\/api\/admin\/database\/([^/]+)$/);
      const dbAliasMatch = url.pathname.match(/^\/api\/database\/([^/]+)$/);
      if (req.method === "GET" && (dbMatch || dbAliasMatch)) {
        const collection = decodeURIComponent((dbMatch || dbAliasMatch)[1]);
        const { db } = safeReadDb();
        return sendJson(res, 200, { collection, ...collectionRows(db, collection) });
      }

      if (req.method === "GET" && url.pathname === "/api/admin/announcements") {
        const { db } = safeReadDb();
        return sendJson(res, 200, { announcements: db.announcements || [] });
      }

      if (req.method === "POST" && url.pathname === "/api/admin/announcements") {
        const body = await readBody(req);
        const title = String(body.title || "").trim();
        const message = String(body.message || "").trim();
        if (!title || !message) return sendJson(res, 400, { error: "Announcement title and message are required." });
        const db = readDb();
        db.announcements ||= [];
        const announcement = {
          id: crypto.randomUUID(),
          title: title.slice(0, 120),
          message: message.slice(0, 1000),
          type: String(body.type || "system").slice(0, 40),
          active: body.active !== false,
          createdBy: session.admin.email,
          createdAt: new Date().toISOString(),
        };
        db.announcements.unshift(announcement);
        logAdminAction(db, session.admin, "Announcement Sent", title);
        writeDb(db);
        return sendJson(res, 201, { announcement });
      }

      if (req.method === "GET" && url.pathname === "/api/admin/activity") {
        const { db } = safeReadDb();
        return sendJson(res, 200, {
          activity: buildRecentActivity(db),
          stream: activityService.getRecentActivity(db, 100),
        });
      }

      if (req.method === "GET" && url.pathname === "/api/admin/export") {
        const { db } = safeReadDb();
        return sendJson(res, 200, {
          exportedAt: new Date().toISOString(),
          summary: buildOverview(),
          users: db.users,
          adminLogs: db.adminLogs,
          announcements: db.announcements,
        });
      }
    } catch (error) {
      return sendJson(res, 500, { error: error.message });
    }
  }

  return sendJson(res, 404, { error: "Not found." });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }
    return serveStatic(req, res, url);
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/api/admin/live-monitor/ws") {
    socket.destroy();
    return;
  }
  liveMonitorWs.handleUpgrade(req, socket, head, {
    verify: (request) => Boolean(getSession(request)),
    onOpen: () => broadcastLiveMonitor(true),
  });
});

server.listen(PORT, () => {
  console.log(`NeuroNest Super Admin running on http://localhost:${PORT}`);
  console.log(`Shared data source: ${dbPath}`);
  console.log(`Shared uploads source: ${uploadsDir}`);
  startDbWatcher();
  startProductionSync();
});
