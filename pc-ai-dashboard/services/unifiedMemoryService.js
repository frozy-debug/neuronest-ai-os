const TYPE_ALIASES = {
  note: "timeline",
  memory: "memory",
  place: "place",
  insight: "insight",
  tag: "insight",
  voice: "voice",
  screenshot: "screenshot",
  journal: "journal",
  workout: "workout",
  idea: "idea",
  focus: "focus",
  travel: "travel",
  recap: "recap",
  "ai-chat": "ai-chat",
  timeline: "timeline",
};

export const MEMORY_TYPES = new Set(Object.values(TYPE_ALIASES));

export function normalizeMemoryType(type) {
  return TYPE_ALIASES[String(type || "").toLowerCase()] || "memory";
}

export function splitTags(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  return String(tags || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function summarizeText(text, maxLength = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 1).trim()}...`;
}

export function inferEmotions(memoryText) {
  const text = String(memoryText || "").toLowerCase();
  const emotions = [];
  if (/(happy|love|great|good|joy|beautiful|excited|inspired|win|proud)/.test(text)) emotions.push("positive");
  if (/(focus|deep work|productive|coding|build|study|planning)/.test(text)) emotions.push("focused");
  if (/(idea|startup|creative|design|write|brainstorm)/.test(text)) emotions.push("creative");
  if (/(gym|workout|run|fitness|health|walk)/.test(text)) emotions.push("energized");
  if (/(stress|sad|angry|tired|blocked|bad|anxious)/.test(text)) emotions.push("heavy");
  if (/(travel|trip|explore|new place|journey)/.test(text)) emotions.push("exploratory");
  return emotions.length ? [...new Set(emotions)] : ["neutral"];
}

export function extractPeople(text) {
  const matches = String(text || "").match(/\b[A-Z][a-z]{2,}\b/g) || [];
  return [...new Set(matches)].filter((name) => !["Today", "Memory", "Google", "NeuroNest"].includes(name)).slice(0, 8);
}

export function memoryTextForEmbedding(memory) {
  return [
    memory.title,
    memory.content,
    memory.summary,
    memory.type,
    memory.tags?.join(" "),
    memory.emotions?.join(" "),
    memory.location?.label,
    memory.metadata?.ocrText,
    memory.metadata?.voiceTranscript,
    memory.metadata?.aiSummary,
    memory.metadata?.placeName,
  ]
    .filter(Boolean)
    .join("\n");
}

export function createUnifiedMemoryObject(record, userId, source = "entry") {
  const type = normalizeMemoryType(record.type || record.kind);
  const tags = splitTags(record.tags);
  const content = String(record.content || record.body || record.text || "").trim();
  const title = String(record.title || record.name || "Untitled memory").trim();
  const summary = record.summary || summarizeText(content || title);
  const rawText = `${title} ${content} ${record.meta || ""} ${tags.join(" ")}`;
  const createdAt = record.createdAt || record.timestamp || new Date().toISOString();

  return {
    id: String(record.id),
    userId,
    type,
    kind: record.kind || type,
    title,
    content,
    body: content,
    summary,
    timestamp: record.timestamp || createdAt,
    createdAt,
    updatedAt: record.updatedAt || createdAt,
    tags,
    emotions: record.emotions || inferEmotions(rawText),
    importanceScore: Number(record.importanceScore || record.score || 50),
    aiScore: Number(record.aiScore || record.score || 50),
    location: record.location || null,
    people: record.people || extractPeople(rawText),
    source,
    embeddingId: record.embeddingId || null,
    relatedMemories: record.relatedMemories || [],
    behaviorPatterns: record.behaviorPatterns || [],
    aiInsights: record.aiInsights || [],
    media: record.media || null,
    metadata: {
      meta: record.meta || "",
      source: record.source || source,
      deletedAt: record.deletedAt || null,
      ocrText: record.ocrText || "",
      voiceTranscript: record.voiceTranscript || "",
      aiSummary: record.aiSummary || "",
      placeName: record.placeName || "",
      originalKind: record.kind || type,
      ...(record.metadata || {}),
    },
  };
}

export function normalizeMemoryCollection(records, userId, source = "entry") {
  return records.map((record) => createUnifiedMemoryObject(record, userId, source));
}

export function createChatMemoryObject(message, userId) {
  return createUnifiedMemoryObject(
    {
      id: `chat-${message.id}`,
      kind: "ai-chat",
      title: message.role === "user" ? "User conversation memory" : "AI assistant response",
      body: message.content,
      tags: ["chat", message.role],
      createdAt: message.createdAt,
      meta: message.role,
    },
    userId,
    "ai-chat",
  );
}
