const MONTHS = new Map([
  ["january", 0],
  ["february", 1],
  ["march", 2],
  ["april", 3],
  ["may", 4],
  ["june", 5],
  ["july", 6],
  ["august", 7],
  ["september", 8],
  ["october", 9],
  ["november", 10],
  ["december", 11],
]);

const TOPIC_PATTERNS = [
  ["AI", /\b(ai|openai|groq|llm|machine learning|model|embedding|chatbot|assistant|agent)\b/i],
  ["Startup", /\b(startup|saas|founder|business|customer|pricing|mvp|launch|neuronest)\b/i],
  ["Coding", /\b(code|coding|bug|fix|github|render|deploy|server|api|frontend|backend|database)\b/i],
  ["Fitness", /\b(gym|workout|fitness|run|training|health|weight|kg|diet)\b/i],
  ["Study", /\b(study|learn|course|book|reading|notes|exam|practice)\b/i],
  ["Design", /\b(design|ui|ux|logo|animation|figma|layout|profile|dashboard)\b/i],
  ["Travel", /\b(travel|trip|place|hotel|airport|journey|visited)\b/i],
  ["Productivity", /\b(productive|focus|deep work|routine|habit|task|mission|goal)\b/i],
];

const POSITIVE_WORDS = /\b(happy|calm|excited|motivated|great|good|amazing|proud|love|inspired|clear|best|win|peaceful)\b/i;
const STRESS_WORDS = /\b(stress|stressed|anxious|burnout|tired|drained|pressure|overwhelmed|argument|sad|angry|problem|blocked)\b/i;
const PRODUCTIVE_WORDS = /\b(productive|focus|deep work|built|build|fixed|ship|shipped|launch|launched|coding|study|learn|project|startup|deploy|tested)\b/i;
const IMPORTANT_WORDS = /\b(decided|decision|milestone|launch|completed|finished|fixed|important|best|breakthrough|reconnect|relationship|goal|startup|travel)\b/i;

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function nowIso() {
  return new Date().toISOString();
}

function stableId(...parts) {
  return parts
    .filter(Boolean)
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 150);
}

function asDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function monthRange(year, monthIndex) {
  return {
    from: new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0)),
    to: new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999)),
  };
}

function timestampOf(item = {}) {
  return item.timestamp || item.createdAt || item.createdDate || item.updatedAt || item.departureTime || item.arrivalTime || nowIso();
}

function textOf(item = {}) {
  const metadata = item.metadata || {};
  return [
    item.title,
    item.content,
    item.body,
    item.summary,
    item.description,
    item.meta,
    item.type,
    item.kind,
    item.category,
    item.placeName,
    item.address,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags,
    Array.isArray(item.emotions) ? item.emotions.join(" ") : item.emotions,
    metadata.ocrText,
    metadata.extractedText,
    metadata.voiceTranscript,
    metadata.transcript,
    metadata.aiSummary,
    metadata.imageCaption,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(value, max = 190) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

function evidenceItem(item = {}, reason = "time-machine evidence") {
  return {
    id: String(item.id || item.entryId || item.memoryId || item.sourceId || stableId(item.title, timestampOf(item))),
    type: String(item.type || item.kind || item.sourceType || item.sourceBucket || "memory"),
    title: snippet(item.title || item.sourceTitle || item.placeName || item.content || item.body || "Evidence", 130),
    timestamp: timestampOf(item),
    reason,
  };
}

function uniqueBy(items = [], keyFn, limit = 1000) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeRecords({ memories = [], records = [], chats = [], places = [], goals = [], timeline = [] } = {}) {
  const rows = [
    ...memories.map((item) => ({ ...item, sourceBucket: "memory" })),
    ...records.map((item) => ({ ...item, sourceBucket: "record" })),
    ...chats.map((chat, index) => ({
      ...chat,
      id: chat.id || `chat_${index}`,
      title: chat.role === "user" ? "User conversation memory" : "AI assistant response",
      content: chat.content || chat.message || "",
      type: "ai-chat",
      timestamp: chat.createdAt || chat.timestamp,
      sourceBucket: "chat",
    })),
    ...places.map((place, index) => ({
      ...place,
      id: place.id || place.memoryId || `place_${index}`,
      title: place.placeName || place.title || "Place visit",
      content: [place.placeName, place.category, place.address].filter(Boolean).join(" "),
      type: "place",
      timestamp: place.departureTime || place.arrivalTime || place.createdAt,
      sourceBucket: "place",
    })),
    ...timeline.map((event, index) => ({
      ...event,
      id: event.id || `timeline_${index}`,
      title: event.title || "Timeline event",
      content: event.description || event.aiSummary || "",
      type: event.type || "timeline",
      timestamp: event.timestamp || event.createdAt,
      sourceBucket: "timeline",
    })),
    ...goals.map((goal) => ({
      ...goal,
      title: goal.title || "Goal",
      content: goal.description || "",
      type: "goal",
      timestamp: goal.updatedAt || goal.createdAt,
      sourceBucket: "goal",
    })),
  ].filter((item) => textOf(item) && asDate(timestampOf(item)));

  return uniqueBy(rows, (item) => String(item.memoryId || item.id || `${item.sourceBucket}_${textOf(item).slice(0, 60)}_${timestampOf(item)}`), 5000)
    .sort((a, b) => new Date(timestampOf(a)) - new Date(timestampOf(b)));
}

function parsePeriod({ query = "", from = "", to = "", now = new Date() } = {}) {
  const clean = String(query || "").toLowerCase();
  const explicitFrom = asDate(from);
  const explicitTo = asDate(to);
  if (explicitFrom || explicitTo) {
    const start = explicitFrom ? startOfDay(explicitFrom) : new Date(0);
    const end = explicitTo ? endOfDay(explicitTo) : now;
    return { label: `${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}`, from: start, to: end, mode: "custom" };
  }

  if (/\blast christmas\b|\bchristmas\b/.test(clean)) {
    const year = now.getUTCMonth() === 11 && now.getUTCDate() >= 25 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    return {
      label: `Christmas ${year}`,
      from: new Date(Date.UTC(year, 11, 24, 0, 0, 0, 0)),
      to: new Date(Date.UTC(year, 11, 26, 23, 59, 59, 999)),
      mode: "holiday",
    };
  }

  const agoMatch = clean.match(/\b(\d+)\s+(day|week|month|year)s?\s+ago\b/);
  if (agoMatch) {
    const amount = Number(agoMatch[1]);
    const unit = agoMatch[2];
    const target = new Date(now);
    if (unit === "day") target.setUTCDate(target.getUTCDate() - amount);
    if (unit === "week") target.setUTCDate(target.getUTCDate() - amount * 7);
    if (unit === "month") target.setUTCMonth(target.getUTCMonth() - amount);
    if (unit === "year") target.setUTCFullYear(target.getUTCFullYear() - amount);
    if (unit === "day") return { label: target.toISOString().slice(0, 10), from: startOfDay(target), to: endOfDay(target), mode: "relative-day" };
    if (unit === "week") {
      const start = new Date(target);
      start.setUTCDate(target.getUTCDate() - target.getUTCDay());
      const end = new Date(start);
      end.setUTCDate(start.getUTCDate() + 6);
      return { label: `Week of ${start.toISOString().slice(0, 10)}`, from: startOfDay(start), to: endOfDay(end), mode: "relative-week" };
    }
    if (unit === "month") return { label: target.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }), ...monthRange(target.getUTCFullYear(), target.getUTCMonth()), mode: "relative-month" };
    return { label: String(target.getUTCFullYear()), from: new Date(Date.UTC(target.getUTCFullYear(), 0, 1)), to: new Date(Date.UTC(target.getUTCFullYear(), 11, 31, 23, 59, 59, 999)), mode: "relative-year" };
  }

  const namedMonth = [...MONTHS.entries()].find(([name]) => clean.includes(name));
  const yearMatch = clean.match(/\b(20\d{2})\b/);
  if (namedMonth) {
    let year = yearMatch ? Number(yearMatch[1]) : now.getUTCFullYear();
    if (!yearMatch && namedMonth[1] > now.getUTCMonth()) year -= 1;
    return {
      label: `${namedMonth[0][0].toUpperCase()}${namedMonth[0].slice(1)} ${year}`,
      ...monthRange(year, namedMonth[1]),
      mode: "month",
    };
  }

  const isoMonth = clean.match(/\b(20\d{2})-(\d{1,2})\b/);
  if (isoMonth) {
    const year = Number(isoMonth[1]);
    const month = Math.max(0, Math.min(11, Number(isoMonth[2]) - 1));
    return { label: `${year}-${String(month + 1).padStart(2, "0")}`, ...monthRange(year, month), mode: "month" };
  }

  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return { label: String(year), from: new Date(Date.UTC(year, 0, 1)), to: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)), mode: "year" };
  }

  return { label: "All memory history", from: new Date(0), to: now, mode: "journey" };
}

function detectFilters(query = "") {
  const clean = String(query || "").toLowerCase();
  const topics = TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(clean)).map(([topic]) => topic);
  const types = [];
  if (/\bscreenshot|screenshots|image|images\b/.test(clean)) types.push("screenshot");
  if (/\bvoice|voice note|audio\b/.test(clean)) types.push("voice");
  if (/\bplace|places|visited|cafe|restaurant|gym|hotel|location\b/.test(clean)) types.push("place");
  if (/\bgoal|goals|mission|project\b/.test(clean)) types.push("goal");
  const people = [];
  const withMatch = clean.match(/\bwith\s+([a-z][a-z.'-]{2,}(?:\s+[a-z][a-z.'-]{2,})?)\b/i);
  if (withMatch) people.push(withMatch[1].replace(/\b\w/g, (char) => char.toUpperCase()));
  const journey = /\bjourney|phase|arc|startup phase|timeline\b/.test(clean);
  return { topics, types, people, journey };
}

function inPeriod(record, period) {
  const date = asDate(timestampOf(record));
  return date && date >= period.from && date <= period.to;
}

function matchesFilters(record, filters) {
  const text = textOf(record).toLowerCase();
  const type = String(record.type || record.kind || record.sourceBucket || "").toLowerCase();
  if (filters.topics.length && !filters.topics.some((topic) => text.includes(topic.toLowerCase()) || TOPIC_PATTERNS.find(([label]) => label === topic)?.[1].test(text))) return false;
  if (filters.types.length && !filters.types.some((wanted) => type.includes(wanted) || text.includes(wanted))) return false;
  if (filters.people.length && !filters.people.some((person) => text.includes(person.toLowerCase()))) return false;
  return true;
}

function scoreRecord(record) {
  const text = textOf(record);
  let score = Number(record.importanceScore || record.aiScore || 45);
  if (IMPORTANT_WORDS.test(text)) score += 22;
  if (PRODUCTIVE_WORDS.test(text)) score += 16;
  if (POSITIVE_WORDS.test(text)) score += 8;
  if (STRESS_WORDS.test(text)) score += 7;
  if (/place|voice|screenshot|goal|timeline/i.test(`${record.type} ${record.kind} ${record.sourceBucket}`)) score += 6;
  return clamp(score, 1, 100);
}

function timeBucket(timestamp) {
  const hour = new Date(timestamp).getUTCHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function eventFromRecord(record, reason = "matched period") {
  const timestamp = timestampOf(record);
  const text = textOf(record);
  return {
    id: String(record.id || stableId(record.title, timestamp)),
    type: String(record.type || record.kind || record.sourceBucket || "memory"),
    title: snippet(record.title || record.placeName || "Memory", 120),
    description: snippet(record.content || record.body || record.summary || record.description || text, 220),
    timestamp,
    bucket: timeBucket(timestamp),
    importanceScore: scoreRecord(record),
    emotionalSignal: POSITIVE_WORDS.test(text) ? "positive" : STRESS_WORDS.test(text) ? "stress" : "neutral",
    productivityScore: PRODUCTIVE_WORDS.test(text) ? 82 : 54,
    evidence: [evidenceItem(record, reason)],
  };
}

function countBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
}

function extractTopics(records) {
  return countBy(records.flatMap((record) => TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(textOf(record))).map(([topic]) => ({ topic }))), (item) => item.topic).slice(0, 8);
}

function buildPeople({ selected, relationships }) {
  const peopleFromRelationships = (relationships?.relationships || []).map((person) => {
    const events = (relationships?.events || []).filter((event) => {
      const date = asDate(event.timestamp);
      return event.personName === person.personName && selected.some((record) => String(record.id) === String(event.sourceId) || (date && Math.abs(new Date(timestampOf(record)).getTime() - date.getTime()) < 86_400_000));
    });
    return {
      name: person.personName,
      relationshipType: person.relationshipType || "Unknown",
      interactionCount: events.length || person.interactionCount || 0,
      strength: person.relationshipStrength || 0,
      evidence: events.slice(0, 5).map((event) => evidenceItem(event, "relationship event")),
    };
  }).filter((person) => person.interactionCount > 0 || selected.some((record) => textOf(record).toLowerCase().includes(person.name.toLowerCase())));

  return uniqueBy(peopleFromRelationships, (person) => person.name, 12);
}

function buildPlaces(selected) {
  const places = selected
    .filter((record) => /place|cafe|restaurant|gym|hotel|location|visited/i.test(`${record.type} ${record.kind} ${record.sourceBucket} ${textOf(record)}`))
    .map((record) => ({
      id: String(record.id || stableId(record.placeName || record.title, timestampOf(record))),
      name: record.placeName || record.metadata?.placeName || record.title || "Place",
      category: record.category || record.metadata?.category || record.type || "place",
      address: record.address || record.metadata?.address || "",
      timestamp: timestampOf(record),
      evidence: [evidenceItem(record, "place memory")],
    }));
  return uniqueBy(places, (place) => `${place.name}_${place.timestamp}`, 20);
}

function buildGoals(selected, goals) {
  return (goals || []).map((goal) => {
    const goalText = textOf(goal).toLowerCase();
    const words = goalText.split(/\s+/).filter((word) => word.length > 4).slice(0, 16);
    const related = selected.filter((record) => {
      const text = textOf(record).toLowerCase();
      return words.some((word) => text.includes(word));
    });
    if (!related.length && !selected.some((record) => record.id === goal.id)) return null;
    return {
      id: goal.id,
      title: goal.title,
      status: goal.status || "active",
      progress: goal.progress || 0,
      relatedEventCount: related.length,
      evidence: uniqueBy([
        evidenceItem({ ...goal, type: "goal", timestamp: goal.updatedAt || goal.createdAt }, "goal record"),
        ...related.slice(0, 5).map((record) => evidenceItem(record, "goal activity")),
      ], (item) => item.id, 6),
    };
  }).filter(Boolean).slice(0, 12);
}

function buildEmotionalTrend(selected) {
  const positive = selected.filter((record) => POSITIVE_WORDS.test(textOf(record))).length;
  const stress = selected.filter((record) => STRESS_WORDS.test(textOf(record))).length;
  const neutral = Math.max(0, selected.length - positive - stress);
  return {
    positive,
    stress,
    neutral,
    label: positive > stress ? "positive leaning" : stress > positive ? "stress-aware" : "balanced",
    score: clamp(55 + positive * 9 - stress * 8),
  };
}

function buildReplay(events) {
  const buckets = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  events.forEach((event) => {
    buckets[event.bucket]?.push(event);
  });
  return Object.entries(buckets).map(([bucket, bucketEvents]) => ({
    bucket,
    label: bucket[0].toUpperCase() + bucket.slice(1),
    summary: bucketEvents.length
      ? `${bucketEvents.length} real event${bucketEvents.length === 1 ? "" : "s"} in this part of the day.`
      : "No real events captured for this part of the day.",
    events: bucketEvents.slice(0, 10),
  }));
}

function buildStory({ period, selected, topics, people, places, goals, emotionalTrend }) {
  if (!selected.length) return "";
  const topTopic = topics[0]?.label || "your memories";
  const placeText = places.length ? ` You visited or captured ${places.slice(0, 3).map((place) => place.name).join(", ")}.` : "";
  const peopleText = people.length ? ` People connected to this period included ${people.slice(0, 3).map((person) => person.name).join(", ")}.` : "";
  const goalText = goals.length ? ` Goals in motion: ${goals.slice(0, 3).map((goal) => goal.title).join(", ")}.` : "";
  return `In ${period.label}, your memory history shows ${selected.length} real signal${selected.length === 1 ? "" : "s"} around ${topTopic}. The emotional trend was ${emotionalTrend.label}.${placeText}${peopleText}${goalText}`;
}

export function buildMemoryTimeMachine({
  user,
  query = "",
  from = "",
  to = "",
  memories = [],
  records = [],
  chats = [],
  places = [],
  relationships = null,
  goals = [],
  timeline = [],
  predictions = null,
  now = new Date(),
} = {}) {
  const userId = user?.id || "";
  const period = parsePeriod({ query, from, to, now });
  const filters = detectFilters(query);
  const allRecords = normalizeRecords({ memories, records, chats, places, goals, timeline });
  const periodRecords = allRecords.filter((record) => inPeriod(record, period));
  let selected = periodRecords.filter((record) => matchesFilters(record, filters));
  if (!selected.length && period.mode === "journey") {
    selected = allRecords.filter((record) => matchesFilters(record, filters));
  }

  const events = selected
    .map((record) => eventFromRecord(record, filters.topics.length || filters.types.length || filters.people.length ? "query match" : "period match"))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const importantEvents = [...events].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, 12);
  const people = buildPeople({ selected, relationships });
  const placeList = buildPlaces(selected);
  const goalList = buildGoals(selected, goals);
  const screenshots = selected
    .filter((record) => /screenshot/i.test(`${record.type} ${record.kind} ${record.sourceBucket} ${textOf(record)}`))
    .map((record) => ({ ...eventFromRecord(record, "screenshot memory"), preview: record.media?.url || record.fileUrl || record.imageUrl || "" }))
    .slice(0, 20);
  const voiceNotes = selected
    .filter((record) => /voice|audio/i.test(`${record.type} ${record.kind} ${record.sourceBucket} ${textOf(record)}`))
    .map((record) => eventFromRecord(record, "voice memory"))
    .slice(0, 20);
  const topics = extractTopics(selected);
  const emotionalTrend = buildEmotionalTrend(selected);
  const predictionMatches = (predictions?.predictions || []).filter((prediction) => selected.some((record) => textOf(record).toLowerCase().includes(String(prediction.metadata?.topic || prediction.metadata?.goalTitle || "").toLowerCase()))).slice(0, 8);
  const replay = buildReplay(events);
  const story = buildStory({ period, selected, topics, people, places: placeList, goals: goalList, emotionalTrend });

  return {
    version: "NeuroNest Memory Time Machine v1",
    userId,
    generatedAt: nowIso(),
    query,
    empty: selected.length === 0,
    evidencePolicy: "Only real memories, screenshots, voice notes, places, relationships, goals, timeline events, and predictions are used. No fabricated events.",
    period: {
      label: period.label,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      mode: period.mode,
    },
    filters,
    summary: {
      totalEvents: events.length,
      importantEvents: importantEvents.length,
      peopleCount: people.length,
      placeCount: placeList.length,
      goalCount: goalList.length,
      screenshotCount: screenshots.length,
      voiceNoteCount: voiceNotes.length,
      topicCount: topics.length,
      predictionCount: predictionMatches.length,
    },
    story,
    timelineReplay: replay,
    visualTimeline: events.map((event, index) => ({
      ...event,
      position: events.length <= 1 ? 50 : clamp((index / (events.length - 1)) * 100),
    })),
    importantEvents,
    people,
    places: placeList,
    goals: goalList,
    screenshots,
    voiceNotes,
    emotionalTrend,
    topics,
    predictions: predictionMatches.map((prediction) => ({
      id: prediction.id,
      type: prediction.type,
      title: prediction.title,
      confidence: prediction.confidence,
      evidenceCount: prediction.evidenceCount,
      evidence: prediction.evidence || [],
    })),
    searchResults: selected.slice(0, 40).map((record) => ({
      id: String(record.id || stableId(record.title, timestampOf(record))),
      type: String(record.type || record.kind || record.sourceBucket || "memory"),
      title: record.title || record.placeName || "Memory",
      summary: snippet(record.content || record.body || record.summary || textOf(record), 220),
      timestamp: timestampOf(record),
      evidence: [evidenceItem(record, "search result")],
    })),
  };
}

export function answerMemoryTimeMachineQuery(query = "", snapshot = {}) {
  const text = String(query || "").toLowerCase();
  if (!/\b(take me back|time machine|what was i doing|show me last|show my .*journey|show memories|show places|show screenshots|months? ago|christmas|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text)) {
    return { matched: false };
  }
  if (snapshot.empty) {
    return {
      matched: true,
      confidence: 0,
      answer: `I could not find real memories for ${snapshot.period?.label || "that period"}. I will not invent events.`,
      evidence: [],
    };
  }
  const confidence = clamp(45 + snapshot.summary.totalEvents * 5 + snapshot.summary.importantEvents * 3);
  return {
    matched: true,
    confidence,
    answer: `${snapshot.story} I found ${snapshot.summary.totalEvents} real event${snapshot.summary.totalEvents === 1 ? "" : "s"}, ${snapshot.summary.placeCount} place signal${snapshot.summary.placeCount === 1 ? "" : "s"}, ${snapshot.summary.peopleCount} people signal${snapshot.summary.peopleCount === 1 ? "" : "s"}, ${snapshot.summary.screenshotCount} screenshot${snapshot.summary.screenshotCount === 1 ? "" : "s"}, and ${snapshot.summary.voiceNoteCount} voice note${snapshot.summary.voiceNoteCount === 1 ? "" : "s"}.`,
    evidence: snapshot.importantEvents.flatMap((event) => event.evidence || []).slice(0, 8),
    snapshot,
  };
}
