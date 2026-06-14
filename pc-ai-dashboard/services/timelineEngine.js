function dayKey(date) {
  return new Date(date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function weekKey(date) {
  const value = new Date(date);
  const start = new Date(value);
  start.setDate(value.getDate() - value.getDay());
  return `Week of ${start.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}`;
}

function monthKey(date) {
  return new Date(date).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function scoreEmotion(memory) {
  const emotions = memory.emotions || [];
  if (emotions.includes("positive") || emotions.includes("creative")) return 86;
  if (emotions.includes("focused") || emotions.includes("energized")) return 78;
  if (emotions.includes("heavy")) return 42;
  return 62;
}

function scoreProductivity(memory) {
  const text = `${memory.title} ${memory.content} ${memory.tags?.join(" ")} ${memory.type}`.toLowerCase();
  let score = 48;
  if (/focus|deep work|productive|coding|planning|study/.test(text)) score += 28;
  if (/idea|startup|ai|build|design/.test(text)) score += 18;
  if (/gym|workout|health/.test(text)) score += 10;
  if (/chat|conversation|social/.test(text)) score -= 4;
  return Math.max(20, Math.min(98, score));
}

function filterMatches(event, filter) {
  if (!filter || filter === "all") return true;
  const text = `${event.type} ${event.title} ${event.description} ${event.tags.join(" ")} ${event.emotions.join(" ")}`.toLowerCase();
  const map = {
    work: /work|coding|planning|productivity|task|meeting/,
    health: /health|gym|workout|fitness|run|energized/,
    "ai-ideas": /ai|idea|startup|creative|build|product/,
    places: /place|cafe|restaurant|travel|location|map/,
    focus: /focus|deep work|productive|study/,
    creativity: /creative|idea|design|startup|brainstorm/,
    voice: /voice|audio|transcript/,
    screenshots: /screenshot|ocr|ui|visual/,
    relationships: /relationship|linked|connection/,
    emotional: /positive|heavy|emotion|happy|stressed|calm/,
    productivity: /productive|productivity|work|focus|task/,
    "deep-work": /deep work|focus|coding|study/,
    conversations: /chat|conversation|assistant|message/,
  };
  return (map[filter] || new RegExp(filter.replace(/-/g, " "), "i")).test(text);
}

function searchMatches(event, query) {
  if (!query) return true;
  const text = `${event.title} ${event.description} ${event.aiSummary} ${event.tags.join(" ")} ${event.emotions.join(" ")}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => text.includes(word));
}

export function createTimelineEvent(memory, relationships = []) {
  const linked = relationships.filter((item) => item.sourceId === memory.id || item.targetId === memory.id).slice(0, 5);
  const emotionalScore = scoreEmotion(memory);
  const productivityScore = scoreProductivity(memory);
  const timestamp = memory.timestamp || memory.createdAt;

  return {
    id: `event_${memory.id}`,
    memoryId: memory.id,
    type: memory.type,
    title: memory.title,
    description: memory.content || memory.summary || "Memory captured.",
    timestamp,
    createdAt: memory.createdAt,
    emotionalScore,
    productivityScore,
    importanceScore: memory.importanceScore || memory.aiScore || 50,
    embeddingId: memory.embeddingId || null,
    location: memory.location || null,
    media: memory.media || memory.metadata?.media || null,
    tags: memory.tags || [],
    emotions: memory.emotions || [],
    linkedMemories: linked.map((item) => ({
      id: item.sourceId === memory.id ? item.targetId : item.sourceId,
      title: item.sourceId === memory.id ? item.targetTitle : item.sourceTitle,
      confidence: item.confidence,
      reason: item.reason,
    })),
    aiSummary: memory.summary || memory.content,
    replayNarration: `${memory.title} became a ${memory.emotions?.[0] || "neutral"} ${memory.type} signal with ${linked.length} memory connections.`,
    relationshipGraphConnections: linked,
    clusterKeys: {
      day: dayKey(timestamp),
      week: weekKey(timestamp),
      month: monthKey(timestamp),
    },
  };
}

export function buildTimeline({ memories, relationships = [], filter = "all", search = "", groupBy = "day", offset = 0, limit = 18 }) {
  const events = memories
    .map((memory) => createTimelineEvent(memory, relationships))
    .filter((event) => filterMatches(event, filter))
    .filter((event) => searchMatches(event, search))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const paged = events.slice(offset, offset + limit);
  const groups = [];
  const groupMap = new Map();

  paged.forEach((event) => {
    const key = event.clusterKeys[groupBy] || event.clusterKeys.day;
    if (!groupMap.has(key)) {
      groupMap.set(key, { id: key, label: key, events: [], summary: "", stats: { count: 0, productivity: 0, emotional: 0 } });
      groups.push(groupMap.get(key));
    }
    const group = groupMap.get(key);
    group.events.push(event);
    group.stats.count += 1;
    group.stats.productivity += event.productivityScore;
    group.stats.emotional += event.emotionalScore;
  });

  groups.forEach((group) => {
    group.stats.productivity = Math.round(group.stats.productivity / Math.max(1, group.stats.count));
    group.stats.emotional = Math.round(group.stats.emotional / Math.max(1, group.stats.count));
    group.summary = `${group.stats.count} memory events · ${group.stats.productivity}% productivity · ${group.stats.emotional}% emotional signal`;
  });

  return {
    filter,
    search,
    groupBy,
    offset,
    limit,
    total: events.length,
    hasMore: offset + limit < events.length,
    groups,
    events: paged,
    filters: [
      "all",
      "work",
      "health",
      "ai-ideas",
      "places",
      "focus",
      "creativity",
      "voice",
      "screenshots",
      "relationships",
      "emotional",
      "productivity",
      "deep-work",
      "conversations",
    ],
  };
}

export function detectTimelineStreaks(events) {
  const days = [...new Set(events.map((event) => new Date(event.timestamp).toDateString()))].sort(
    (a, b) => new Date(b) - new Date(a),
  );
  let streak = 0;
  let cursor = new Date();
  for (const day of days) {
    if (new Date(day).toDateString() === cursor.toDateString()) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
  }

  return {
    activeMemoryStreak: streak,
    totalActiveDays: days.length,
    strongestDay: events.reduce((best, event) => {
      const key = new Date(event.timestamp).toDateString();
      const score = event.importanceScore + event.productivityScore + event.emotionalScore;
      const next = { key, score: (best.byDay?.[key] || 0) + score, byDay: { ...(best.byDay || {}), [key]: (best.byDay?.[key] || 0) + score } };
      return !best.key || next.score > best.score ? next : { ...best, byDay: next.byDay };
    }, {}).key,
  };
}
