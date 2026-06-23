import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

loadEnv();

const PORT = Number(process.env.PORT || 3002);
const NEURONEST_API_BASE_URL = String(
  process.env.NEURONEST_API_BASE_URL ||
  process.env.MAIN_APP_API_URL ||
  process.env.PC_API_BASE_URL ||
  "",
).replace(/\/+$/, "");
const ALLOW_OFFLINE_GOOGLE_FALLBACK =
  process.env.ALLOW_OFFLINE_GOOGLE_FALLBACK !== "false" &&
  process.env.NODE_ENV !== "production" &&
  !process.env.RENDER;

const publicDir = path.join(__dirname, "public");
const dbPath = path.join(__dirname, "data", "db.json");
const sessions = new Map();

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

function getGoogleClientId() {
  loadEnv();
  return process.env.GOOGLE_CLIENT_ID || "";
}

function getGoogleClientIds() {
  loadEnv();
  return new Set(
    [
      process.env.GOOGLE_CLIENT_ID,
      ...(process.env.GOOGLE_CLIENT_IDS || "").split(","),
    ]
      .map((item) => String(item || "").trim())
      .filter(Boolean),
  );
}

function getGoogleMapsApiKey() {
  loadEnv();
  return process.env.GOOGLE_MAPS_API_KEY || "";
}

function shouldProxyApi(req, url) {
  if (!NEURONEST_API_BASE_URL) return false;
  if (!url.pathname.startsWith("/api/")) return false;
  if (url.pathname === "/api/health" || url.pathname === "/api/mobile-health" || url.pathname === "/api/config") {
    return false;
  }
  return true;
}

function readRawBody(req, limitBytes = 25_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function proxyApiRequest(req, res) {
  const upstreamUrl = `${NEURONEST_API_BASE_URL}${req.url}`;
  const body = ["GET", "HEAD"].includes(req.method || "GET") ? undefined : await readRawBody(req);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["content-length"];
  delete headers["accept-encoding"];

  const upstreamResponse = await fetch(upstreamUrl, {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  });

  const responseHeaders = {};
  for (const [key, value] of upstreamResponse.headers.entries()) {
    const lower = key.toLowerCase();
    if (["content-encoding", "content-length", "transfer-encoding", "connection"].includes(lower)) continue;
    responseHeaders[key] = value;
  }

  const setCookies = typeof upstreamResponse.headers.getSetCookie === "function"
    ? upstreamResponse.headers.getSetCookie()
    : [];
  const fallbackCookie = upstreamResponse.headers.get("set-cookie");
  if (setCookies.length) responseHeaders["set-cookie"] = setCookies;
  else if (fallbackCookie) responseHeaders["set-cookie"] = fallbackCookie;

  const payload = Buffer.from(await upstreamResponse.arrayBuffer());
  res.writeHead(upstreamResponse.status, responseHeaders);
  res.end(payload);
}

function readDb() {
  if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, JSON.stringify({ users: [], chats: {}, entries: {} }, null, 2));
  }

  const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
  db.users ||= [];
  db.chats ||= {};
  db.entries ||= {};
  return db;
}

function writeDb(db) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
  };
}

function upsertUser(profile) {
  const db = readDb();
  const existing = db.users.find((user) => user.googleSub === profile.googleSub || user.email === profile.email);
  const now = new Date().toISOString();

  if (existing) {
    existing.name = profile.name;
    existing.picture = profile.picture;
    existing.lastLoginAt = now;
    writeDb(db);
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
  writeDb(db);
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
  return message;
}

function getChatHistory(userId) {
  const db = readDb();
  return db.chats[userId] || [];
}

function cleanEntryKind(kind) {
  const allowedKinds = new Set(["note", "memory", "place", "insight", "tag", "voice"]);
  return allowedKinds.has(kind) ? kind : "memory";
}

function publicEntry(entry) {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    body: entry.body,
    meta: entry.meta,
    tags: entry.tags,
    createdAt: entry.createdAt,
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

function createEntry(userId, data) {
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

  if (!title) throw new Error("Title is required.");
  if (title.length > 120) throw new Error("Title is too long.");
  if (body.length > 1000) throw new Error("Entry details are too long.");

  const entry = {
    id: crypto.randomUUID(),
    kind: cleanEntryKind(data.kind),
    title,
    body,
    meta,
    tags,
    createdAt: new Date().toISOString(),
    deletedAt: null,
  };

  db.entries[userId].push(entry);
  writeDb(db);
  return publicEntry(entry);
}

function setEntryDeleted(userId, entryId, deleted) {
  const db = readDb();
  db.entries[userId] ||= [];
  const entry = db.entries[userId].find((item) => item.id === entryId);

  if (!entry) return null;
  entry.deletedAt = deleted ? new Date().toISOString() : null;
  writeDb(db);
  return publicEntry(entry);
}

function demoMemoryRecords() {
  return [];
}

function userEntryRecords(userId) {
  return getEntries(userId).map((entry) => ({
    ...entry,
    mood: inferMood(entry),
    score: scoreEntry(entry),
    location: inferLocation(entry),
  }));
}

function allMemoryRecords(userId) {
  return [...demoMemoryRecords(), ...userEntryRecords(userId)].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
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
  const focusWindow = productivityWindow(records);
  const hasWorkout = records.some((record) => /workout|gym|fitness/i.test(`${record.title} ${record.body} ${record.tags?.join(" ")}`));
  const hasCafe = records.some((record) => /cafe|coffee/i.test(`${record.title} ${record.body} ${record.tags?.join(" ")}`));

  return [
    {
      title: `Tomorrow focus peak: ${focusWindow}`,
      body: `Your current routine suggests your best deep-work window may be around ${focusWindow}.`,
      confidence: 86,
    },
    {
      title: "Cafe after workout pattern",
      body: hasWorkout && hasCafe
        ? "You often connect fitness and cafe/idea memories. A cafe stop after workouts may trigger creative planning."
        : "Add more workout and cafe entries to strengthen this prediction.",
      confidence: hasWorkout && hasCafe ? 74 : 42,
    },
    {
      title: "Startup idea recurrence",
      body: "AI/startup memories are clustering with voice notes and place visits, suggesting ideas appear during movement or public-work sessions.",
      confidence: 81,
    },
  ];
}

function detectMessageLanguage(message = "") {
  const text = String(message || "").trim();
  const lower = text.toLowerCase();
  const romanHindi = (lower.match(/\b(kal|aaj|abhi|mera|meri|mere|mujhe|main|maine|tum|kya|kyu|kaise|kaha|gaya|gayi|tha|thi|hai|haan|nahi|bata|samjha|wala|wali)\b/g) || []).length;
  const english = /\b(what|where|when|how|why|can|should|memory|memories|idea|project|startup|week|day|gym|work|focus)\b/i.test(text);
  const devanagari = /[\u0900-\u097F]/.test(text);
  const devanagariChars = (text.match(/[\u0900-\u097F]/g) || []).length;
  const latinWords = (text.match(/[a-z]+/gi) || []).length;
  if (devanagari && /[a-z]/i.test(text) && english && latinWords >= 2 && devanagariChars < text.length * 0.45) return "hi-en";
  if (devanagari) return "hi";
  if (romanHindi >= 2 && english) return "hi-en";
  if (romanHindi >= 3) return "hi-en";
  if (/\b(c[o\u00f3]mo|semana|memorias|productividad|ideas|d[o\u00f3]nde|cu[a\u00e1]ndo|feliz)\b/i.test(text)) return "es";
  if (/\b(comment|semaine|souvenirs|productivite|idees|ou|quand)\b/i.test(text)) return "fr";
  if (/\b(wie|woche|erinnerungen|produktivitat|ideen|wo|wann)\b/i.test(text)) return "de";
  if (/\b(c[o\u00f3]mo|semana|mem[o\u00f3]rias|produtividade|ideias|onde|quando)\b/i.test(text)) return "pt";
  return "en";
}

function mobileReply(key, language, userName) {
  const firstName = userName || "there";
  const copy = {
    greeting: {
      en: `Hello ${firstName}! I can help with your timeline, memories, places, tags, voice notes, weekly recap, workouts, cafes, and saved AI ideas.`,
      "hi-en": `Haan ${firstName}, main yahin hoon. Timeline, memories, places, tags, voice notes, weekly recap, workouts, cafes aur AI ideas mein help kar sakta hoon.`,
      hi: `Namaste ${firstName}. Main aapki timeline, memories, places, tags, voice notes, weekly recap aur AI ideas mein madad kar sakta hoon.`,
      es: `Hola ${firstName}. Puedo ayudarte con tu timeline, recuerdos, lugares, notas de voz, resumen semanal e ideas de IA.`,
      fr: `Bonjour ${firstName}. Je peux t'aider avec ta timeline, tes souvenirs, lieux, notes vocales, recap hebdo et idees IA.`,
      de: `Hallo ${firstName}. Ich kann dir mit Timeline, Erinnerungen, Orten, Sprachnotizen, Wochenruckblick und KI-Ideen helfen.`,
      pt: `Ola ${firstName}. Posso ajudar com timeline, memorias, lugares, notas de voz, resumo semanal e ideias de IA.`,
    },
    status: {
      en: "I am running nicely. Your login, saved chat history, and dashboard navigation are connected.",
      "hi-en": "Main smoothly chal raha hoon. Login, chat history aur dashboard navigation connected hai.",
      hi: "Main sahi chal raha hoon. Login, chat history aur dashboard navigation connected hain.",
      es: "Estoy funcionando bien. Tu login, historial de chat y navegacion del dashboard estan conectados.",
      fr: "Je fonctionne bien. Login, historique de chat et navigation du dashboard sont connectes.",
      de: "Ich laufe gut. Login, Chatverlauf und Dashboard-Navigation sind verbunden.",
      pt: "Estou funcionando bem. Login, historico de chat e navegacao do dashboard estao conectados.",
    },
    identity: {
      en: "I am NeuroNest AI, your AI Second Brain Assistant. I answer naturally and use your memories, places, routines, and patterns when they help.",
      "hi-en": "Main NeuroNest AI hoon, tumhara AI Second Brain Assistant. Main natural chat karta hoon aur jab useful ho tab memories, places, routines aur patterns use karta hoon.",
      hi: "Main NeuroNest AI hoon, aapka AI Second Brain Assistant. Zaroorat par main memories, places, routines aur patterns ka use karta hoon.",
      es: "Soy NeuroNest AI, tu asistente de segundo cerebro. Respondo de forma natural y uso recuerdos, lugares y patrones cuando ayudan.",
      fr: "Je suis NeuroNest AI, ton assistant de second cerveau. Je reponds naturellement et j'utilise souvenirs, lieux et habitudes quand c'est utile.",
      de: "Ich bin NeuroNest AI, dein Second-Brain-Assistent. Ich antworte naturlich und nutze Erinnerungen, Orte und Muster, wenn es hilft.",
      pt: "Sou o NeuroNest AI, seu assistente de segundo cerebro. Respondo naturalmente e uso memorias, lugares e padroes quando ajudam.",
    },
    timeline: {
      en: "Today starts with a 9:15 AM planning note, an 11:20 AM cafe visit, a 2:40 PM business idea, and an 8:30 PM upper body workout.",
      "hi-en": "Aaj timeline mein 9:15 AM planning note, 11:20 AM cafe visit, 2:40 PM business idea aur 8:30 PM upper body workout dikh raha hai.",
      hi: "Aaj ki timeline mein planning note, cafe visit, business idea aur upper body workout hai.",
      es: "Tu dia muestra una nota de planificacion, una visita a cafe, una idea de negocio y un entrenamiento.",
      fr: "Ta journee montre une note de planning, un cafe, une idee business et une seance de sport.",
      de: "Dein Tag zeigt Planung, Cafe-Besuch, Business-Idee und Training.",
      pt: "Seu dia mostra planejamento, cafe, ideia de negocio e treino.",
    },
    weekly: {
      en: "Your weekly recap shows 12 places visited, 68 memories saved, 34 screenshots, and 7 voice notes. Biggest patterns: cafes, productivity content, and late-night ideas.",
      "hi-en": "Is week ka recap: 12 places visited, 68 memories saved, 34 screenshots aur 7 voice notes. Strong patterns cafes, productivity content aur late-night ideas hain.",
      hi: "Is haftay ke recap mein 12 places, 68 memories, 34 screenshots aur 7 voice notes hain.",
      es: "Tu resumen semanal muestra 12 lugares, 68 recuerdos, 34 capturas y 7 notas de voz.",
      fr: "Ton recap hebdo montre 12 lieux, 68 souvenirs, 34 captures et 7 notes vocales.",
      de: "Dein Wochenruckblick zeigt 12 Orte, 68 Erinnerungen, 34 Screenshots und 7 Sprachnotizen.",
      pt: "Seu resumo semanal mostra 12 lugares, 68 memorias, 34 screenshots e 7 notas de voz.",
    },
    tags: {
      en: "Your useful demo tags are AI, Cafes, Fitness, Travel, Books, and Ideas. Tags are fast filters for memory categories.",
      "hi-en": "Useful tags AI, Cafes, Fitness, Travel, Books aur Ideas hain. Tags memory categories ko fast filter karte hain.",
      hi: "Useful tags AI, Cafes, Fitness, Travel, Books aur Ideas hain.",
      es: "Tus tags utiles son AI, Cafes, Fitness, Travel, Books e Ideas.",
      fr: "Tes tags utiles sont AI, Cafes, Fitness, Travel, Books et Ideas.",
      de: "Deine nutzlichen Tags sind AI, Cafes, Fitness, Travel, Books und Ideas.",
      pt: "Seus tags uteis sao AI, Cafes, Fitness, Travel, Books e Ideas.",
    },
    memory: {
      en: "Recent memories include Upper Body Workout, Sorrento Restaurant, Business Idea, Manali Trip, and Book Notes. Ask for any one by name and I will summarize it.",
      "hi-en": "Recent memories mein Upper Body Workout, Sorrento Restaurant, Business Idea, Manali Trip aur Book Notes hain. Kisi ek ka naam bolo, main summarize kar dunga.",
      hi: "Recent memories mein workout, restaurant, business idea, trip aur book notes hain.",
      es: "Tus recuerdos recientes incluyen workout, restaurante, idea de negocio, viaje y notas de libro.",
      fr: "Tes souvenirs recents incluent sport, restaurant, idee business, voyage et notes de livre.",
      de: "Deine letzten Erinnerungen enthalten Training, Restaurant, Business-Idee, Reise und Buchnotizen.",
      pt: "Suas memorias recentes incluem treino, restaurante, ideia de negocio, viagem e notas de livro.",
    },
    cafe: {
      en: "Blue Bottle Cafe is saved as a focus-friendly cafe. You visited it 3 times in the last 2 weeks and it appears in Places and Map View.",
      "hi-en": "Blue Bottle Cafe focus-friendly cafe ke roop mein saved hai. Last 2 weeks mein 3 visits dikh rahi hain aur Places/Map View mein bhi linked hai.",
      hi: "Blue Bottle Cafe focus-friendly place ke roop mein saved hai.",
      es: "Blue Bottle Cafe esta guardado como un cafe bueno para enfoque.",
      fr: "Blue Bottle Cafe est enregistre comme cafe favorable au focus.",
      de: "Blue Bottle Cafe ist als fokusfreundliches Cafe gespeichert.",
      pt: "Blue Bottle Cafe esta salvo como cafe bom para foco.",
    },
    restaurant: {
      en: "You visited Sorrento Restaurant on Friday evening. The saved note says the pasta and ambience were great, with tiramisu worth trying.",
      "hi-en": "Friday evening tum Sorrento Restaurant gaye the. Saved note ke hisaab se pasta aur ambience great the, tiramisu try karne layak hai.",
      hi: "Friday evening Sorrento Restaurant visit saved hai.",
      es: "Visitaste Sorrento Restaurant el viernes por la noche.",
      fr: "Tu as visite Sorrento Restaurant vendredi soir.",
      de: "Du hast Sorrento Restaurant am Freitagabend besucht.",
      pt: "Voce visitou o Sorrento Restaurant na sexta a noite.",
    },
    workout: {
      en: "Your workout memory is Upper Body Workout, saved today at 8:30 PM. It is tagged Health and appears in Recent Memories.",
      "hi-en": "Tumhari workout memory Upper Body Workout hai, aaj 8:30 PM saved. Health tag ke saath Recent Memories mein hai.",
      hi: "Workout memory Upper Body Workout ke naam se saved hai.",
      es: "Tu memoria de entrenamiento es Upper Body Workout.",
      fr: "Ton souvenir sport est Upper Body Workout.",
      de: "Deine Trainings-Erinnerung ist Upper Body Workout.",
      pt: "Sua memoria de treino e Upper Body Workout.",
    },
    aiIdea: {
      en: "Your saved AI idea is an AI tutoring platform. NeuroNest connects it to an older note, so it appears as a Memory Connection.",
      "hi-en": "Tumhara saved AI idea AI tutoring platform hai. NeuroNest isse ek older note se connect karta hai, isliye Memory Connection mein dikhta hai.",
      hi: "Saved AI idea AI tutoring platform ke baare mein hai.",
      es: "Tu idea de IA guardada es una plataforma de tutoria con IA.",
      fr: "Ton idee IA sauvegardee est une plateforme de tutorat IA.",
      de: "Deine gespeicherte KI-Idee ist eine KI-Tutoring-Plattform.",
      pt: "Sua ideia de IA salva e uma plataforma de tutoria com IA.",
    },
    voice: {
      en: "You have 7 voice notes. The newest demo notes are Launch idea memo, Gym reflection, and Cafe ambience.",
      "hi-en": "Tumhare paas 7 voice notes hain. Newest demo notes Launch idea memo, Gym reflection aur Cafe ambience hain.",
      hi: "Aapke paas 7 voice notes hain.",
      es: "Tienes 7 notas de voz.",
      fr: "Tu as 7 notes vocales.",
      de: "Du hast 7 Sprachnotizen.",
      pt: "Voce tem 7 notas de voz.",
    },
    place: {
      en: "Map View highlights Blue Bottle Cafe and other visited spots. Places this week include Blue Bottle Cafe, Sorrento Restaurant, and Manali Trip.",
      "hi-en": "Map View Blue Bottle Cafe aur visited spots highlight karta hai. Is week ke places mein Blue Bottle Cafe, Sorrento Restaurant aur Manali Trip hain.",
      hi: "Map View visited places ko highlight karta hai.",
      es: "Map View resalta tus lugares visitados de esta semana.",
      fr: "Map View met en avant tes lieux visites cette semaine.",
      de: "Map View hebt deine besuchten Orte dieser Woche hervor.",
      pt: "Map View destaca seus lugares visitados nesta semana.",
    },
    trash: {
      en: "Trash currently has an old screenshot draft and a duplicate cafe note. Both are marked as restorable starter items.",
      "hi-en": "Trash mein abhi old screenshot draft aur duplicate cafe note hai. Dono restore ho sakte hain.",
      hi: "Trash mein old screenshot draft aur duplicate cafe note hai.",
      es: "La papelera tiene un borrador de screenshot y una nota de cafe duplicada.",
      fr: "La corbeille contient un brouillon de capture et une note cafe dupliquee.",
      de: "Der Papierkorb enthalt einen Screenshot-Entwurf und eine doppelte Cafe-Notiz.",
      pt: "A lixeira tem um rascunho de screenshot e uma nota duplicada de cafe.",
    },
    google: {
      en: "Google login is connected through the backend. If the button does not appear, add a real GOOGLE_CLIENT_ID in the .env file and restart the server.",
      "hi-en": "Google login backend se connected hai. Button na aaye to .env mein real GOOGLE_CLIENT_ID add karke server restart karo.",
      hi: "Google login backend se connected hai.",
      es: "El login de Google esta conectado por backend.",
      fr: "Le login Google est connecte par le backend.",
      de: "Google Login ist uber das Backend verbunden.",
      pt: "O login Google esta conectado pelo backend.",
    },
    thanks: {
      en: "Anytime. I will keep the important bits close by.",
      "hi-en": "Anytime. Main important cheezein close rakhunga.",
      hi: "Kabhi bhi. Main important baatein yaad rakhunga.",
      es: "Cuando quieras. Mantendre cerca lo importante.",
      fr: "Avec plaisir. Je garde l'important a portee.",
      de: "Gerne. Ich behalte das Wichtige nah bei dir.",
      pt: "Sempre. Vou manter o importante por perto.",
    },
    help: {
      en: "Try asking about your timeline, weekly recap, recent memories, cafe, workout, tags, voice notes, map, or trash.",
      "hi-en": "Timeline, weekly recap, recent memories, cafe, workout, tags, voice notes, map ya trash ke baare mein pooch sakte ho.",
      hi: "Aap timeline, weekly recap, recent memories, cafe, workout, tags, voice notes, map ya trash ke baare mein pooch sakte hain.",
      es: "Pregunta por timeline, resumen semanal, recuerdos recientes, cafe, entreno, tags, notas de voz, mapa o papelera.",
      fr: "Demande la timeline, recap hebdo, souvenirs recents, cafe, sport, tags, notes vocales, map ou corbeille.",
      de: "Frag nach Timeline, Wochenruckblick, Erinnerungen, Cafe, Training, Tags, Sprachnotizen, Karte oder Papierkorb.",
      pt: "Pergunte sobre timeline, resumo semanal, memorias recentes, cafe, treino, tags, voz, mapa ou lixeira.",
    },
    fallback: {
      en: "I saved your message in chat history. I am connecting it with your memories, places, routines, and patterns as the assistant grows.",
      "hi-en": "Maine tumhara message chat history mein save kar diya. Main isse memories, places, routines aur patterns ke saath connect kar raha hoon.",
      hi: "Maine aapka message chat history mein save kar diya. Main ise memories, places, routines aur patterns ke saath connect kar raha hoon.",
      es: "Guarde tu mensaje en el historial. Lo conectare con tus recuerdos, lugares, rutinas y patrones.",
      fr: "J'ai enregistre ton message dans l'historique. Je vais le relier a tes souvenirs, lieux, routines et schemas.",
      de: "Ich habe deine Nachricht gespeichert und verbinde sie mit Erinnerungen, Orten, Routinen und Mustern.",
      pt: "Salvei sua mensagem no historico e vou conecta-la com memorias, lugares, rotinas e padroes.",
    },
  };
  return copy[key]?.[language] || copy[key]?.en || copy.fallback.en;
}

function createBotReply(message, userName) {
  const language = detectMessageLanguage(message);
  const text = message.trim().toLowerCase();

  if (/^(hi|hello|hey|hii|helo)\b/.test(text)) {
    return mobileReply("greeting", language, userName);
  }

  if (text.includes("how are you")) {
    return mobileReply("status", language, userName);
  }

  if (
    text.includes("who are you") ||
    text.includes("what are you") ||
    text.includes("what can you do") ||
    text.includes("features")
  ) {
    return mobileReply("identity", language, userName);
  }

  if (text.includes("timeline") || text.includes("today")) {
    return mobileReply("timeline", language, userName);
  }

  if (text.includes("weekly") || text.includes("week") || text.includes("recap") || text.includes("summary")) {
    return mobileReply("weekly", language, userName);
  }

  if (text.includes("tag") || text.includes("tags") || text.includes("tagged")) {
    return mobileReply("tags", language, userName);
  }

  if (text.includes("memory") || text.includes("memories") || text.includes("recent")) {
    return mobileReply("memory", language, userName);
  }

  if (text.includes("cafe") || text.includes("blue bottle")) {
    return mobileReply("cafe", language, userName);
  }

  if (text.includes("restaurant") || text.includes("sorrento") || text.includes("friday")) {
    return mobileReply("restaurant", language, userName);
  }

  if (text.includes("workout") || text.includes("gym") || text.includes("fitness")) {
    return mobileReply("workout", language, userName);
  }

  if (
    text.includes("ai idea") ||
    text.includes("startup") ||
    text.includes("tutoring") ||
    text.includes("business idea") ||
    (text.includes("ai") && text.includes("save"))
  ) {
    return mobileReply("aiIdea", language, userName);
  }

  if (text.includes("voice") || text.includes("audio")) {
    return mobileReply("voice", language, userName);
  }

  if (text.includes("place") || text.includes("map") || text.includes("visited")) {
    return mobileReply("place", language, userName);
  }

  if (text.includes("trash") || text.includes("deleted") || text.includes("restore")) {
    return mobileReply("trash", language, userName);
  }

  if (text.includes("google") || text.includes("login") || text.includes("account")) {
    return mobileReply("google", language, userName);
  }

  if (text.includes("thank")) {
    return mobileReply("thanks", language, userName);
  }

  if (text.includes("help")) {
    return mobileReply("help", language, userName);
  }

  return mobileReply("fallback", language, userName);
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
  return sessions.get(sid) || null;
}

function setSession(res, user) {
  const sid = crypto.randomUUID();
  sessions.set(sid, { user, createdAt: Date.now() });
  res.setHeader(
    "Set-Cookie",
    `neuronest.sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,
  );
}

function clearSession(req, res) {
  const sid = parseCookies(req)["neuronest.sid"];
  if (sid) sessions.delete(sid);
  res.setHeader("Set-Cookie", "neuronest.sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 15_000_000) {
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
  if (!getGoogleClientIds().has(payload.aud)) {
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
  if (!getGoogleClientIds().size) {
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

  if (req.method === "GET" && (url.pathname === "/api/health" || url.pathname === "/api/mobile-health")) {
    return sendJson(res, 200, {
      ok: true,
      service: "neuronest-mobile",
      upstreamConfigured: Boolean(NEURONEST_API_BASE_URL),
      upstream: NEURONEST_API_BASE_URL ? "pc-neuronest-api" : "local-mobile-fallback",
    });
  }

  if (shouldProxyApi(req, url)) {
    try {
      await proxyApiRequest(req, res);
      return;
    } catch (error) {
      return sendJson(res, 502, {
        error: "Mobile app could not reach the main NeuroNest API.",
        detail: error.message,
      });
    }
  }

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
    return sendJson(res, 200, { user: session?.user || null });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/google") {
    try {
      const body = await readBody(req);
      if (!body.credential) return sendJson(res, 400, { error: "Missing Google credential." });

      const profile = await verifyGoogleCredential(body.credential);
      const user = upsertUser(profile);
      const safeUser = publicUser(user);
      setSession(res, safeUser);
      return sendJson(res, 200, { user: safeUser });
    } catch (error) {
      return sendJson(res, 401, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    clearSession(req, res);
    return sendJson(res, 200, { ok: true });
  }

  if (!session?.user) {
    return sendJson(res, 401, { error: "Please login first." });
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
      return sendJson(res, 201, { entry: createEntry(session.user.id, body) });
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

  if (req.method === "GET" && url.pathname === "/api/ai/memory-engine") {
    const records = allMemoryRecords(session.user.id);
    return sendJson(res, 200, {
      insights: buildInsightCards(records),
      counts: kindCounts(records),
      tags: topTags(records),
      focusWindow: productivityWindow(records),
      routines: [
        "Cafe and startup memories are strongly linked.",
        "Evening fitness entries often appear before reflection notes.",
        "Voice notes are becoming a high-signal capture channel.",
      ],
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
    return sendJson(res, 200, buildGraph(allMemoryRecords(session.user.id)));
  }

  if (req.method === "GET" && url.pathname === "/api/ai/recap") {
    return sendJson(res, 200, buildRecap(allMemoryRecords(session.user.id)));
  }

  if (req.method === "GET" && url.pathname === "/api/ai/journal") {
    return sendJson(res, 200, buildJournal(allMemoryRecords(session.user.id)));
  }

  if (req.method === "GET" && url.pathname === "/api/ai/predictions") {
    return sendJson(res, 200, { predictions: buildPredictions(allMemoryRecords(session.user.id)) });
  }

  if (req.method === "POST" && url.pathname === "/api/ai/search") {
    const body = await readBody(req);
    const query = String(body.query || "").trim();
    if (!query) return sendJson(res, 400, { error: "Search query is required." });

    return sendJson(res, 200, {
      query,
      results: rankSearch(allMemoryRecords(session.user.id), query),
    });
  }

  if (req.method === "POST" && url.pathname === "/api/ai/screenshot-memory") {
    try {
      const body = await readBody(req);
      const classification = classifyScreenshotText(String(body.text || ""), String(body.fileName || ""));
      const entry = createEntry(session.user.id, {
        kind: "memory",
        title: classification.title,
        body: classification.body,
        meta: classification.meta,
        tags: classification.tags.join(", "),
      });
      return sendJson(res, 201, { entry, classification });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    const body = await readBody(req);
    const message = String(body.message || "").trim();

    if (!message) return sendJson(res, 400, { error: "Message is required." });
    if (message.length > 1000) return sendJson(res, 400, { error: "Message is too long." });

    const userMessage = saveChatMessage(session.user.id, "user", message);
    const reply = createBotReply(message, session.user.name);
    const assistantMessage = saveChatMessage(session.user.id, "assistant", reply);

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
  if (!getGoogleClientId()) {
    console.log("Google login is not configured. Add GOOGLE_CLIENT_ID to .env.");
  }
});
