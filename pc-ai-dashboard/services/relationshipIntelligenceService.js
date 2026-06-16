const STOP_NAMES = new Set([
  "Ai",
  "API",
  "App",
  "Apple",
  "Chat",
  "Cloud",
  "Codex",
  "Dashboard",
  "Discord",
  "Facebook",
  "Friday",
  "Gemini",
  "Github",
  "Gmail",
  "Google",
  "Instagram",
  "Javascript",
  "Linkedin",
  "Monday",
  "NeuroNest",
  "OpenAI",
  "Places",
  "Render",
  "Saturday",
  "Slack",
  "Starbucks",
  "Sunday",
  "Supabase",
  "Telegram",
  "Thursday",
  "Tuesday",
  "Twitter",
  "Wednesday",
  "Whatsapp",
  "Youtube",
]);

const FAMILY_ALIASES = new Map([
  ["mom", "Mother"],
  ["mother", "Mother"],
  ["mummy", "Mother"],
  ["maa", "Mother"],
  ["mumma", "Mother"],
  ["dad", "Father"],
  ["father", "Father"],
  ["papa", "Father"],
  ["bro", "Brother"],
  ["brother", "Brother"],
  ["bhai", "Brother"],
  ["sister", "Sister"],
  ["sis", "Sister"],
  ["didi", "Sister"],
  ["girlfriend", "Girlfriend"],
  ["boyfriend", "Boyfriend"],
  ["wife", "Spouse"],
  ["husband", "Spouse"],
  ["spouse", "Spouse"],
  ["boss", "Boss"],
  ["mentor", "Mentor"],
  ["client", "Client"],
  ["investor", "Investor"],
]);

const POSITIVE_WORDS = /\b(amazing|best|happy|happiest|love|loved|great|good|calm|fun|support|supported|helped|inspired|motivated|excited|proud|win|beautiful|kind|productive|creative)\b/i;
const NEGATIVE_WORDS = /\b(argument|argued|fight|stress|stressed|sad|angry|bad|hurt|toxic|ignored|blocked|anxious|awkward|pressure|drained|tired|problem|issue)\b/i;
const PRODUCTIVE_WORDS = /\b(productive|focus|focused|deep work|startup|build|coding|study|project|launch|work session|brainstorm|idea)\b/i;
const IMPORTANT_CONTEXT_WORDS = /\b(travel|trip|journey|startup|project|launch|deep conversation|important|milestone|family|hospital|birthday|wedding|interview)\b/i;

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function daysBetween(a, b) {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
  return Math.max(0, Math.round(Math.abs(right - left) / 86_400_000));
}

function ageInDays(timestamp) {
  return daysBetween(timestamp, new Date().toISOString());
}

function titleCaseName(value) {
  return String(value || "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizePersonName(value) {
  const raw = String(value || "").replace(/[^\p{L}\s.'-]/gu, " ").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (FAMILY_ALIASES.has(lower)) return FAMILY_ALIASES.get(lower);
  const name = titleCaseName(raw);
  if (name.length < 3 || name.length > 60) return "";
  if (STOP_NAMES.has(name)) return "";
  if (/^(today|tomorrow|yesterday|morning|evening|night|restaurant|cafe|gym|home|work|school)$/i.test(name)) return "";
  return name;
}

function sourceText(source) {
  const metadata = source.metadata || {};
  return [
    source.title,
    source.content,
    source.body,
    source.summary,
    source.meta,
    source.type,
    source.kind,
    source.tags?.join(" "),
    source.emotions?.join(" "),
    metadata.ocrText,
    metadata.extractedText,
    metadata.voiceTranscript,
    metadata.transcript,
    metadata.aiSummary,
    metadata.placeName,
    metadata.imageCaption,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(text, max = 180) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}...`;
}

function sourceTimestamp(source) {
  return source.timestamp || source.createdAt || source.createdDate || source.updatedAt || new Date().toISOString();
}

function sourceId(source, index) {
  return String(source.id || source.entryId || source.memoryId || `source_${index}`);
}

function sourceType(source) {
  return String(source.type || source.kind || source.source || "memory").toLowerCase();
}

function detectSentiment(text) {
  const positive = POSITIVE_WORDS.test(text);
  const negative = NEGATIVE_WORDS.test(text);
  if (positive && !negative) return "positive";
  if (negative && !positive) return "negative";
  if (positive && negative) return "mixed";
  return "neutral";
}

function detectInteractionType(text) {
  if (/\b(lunch|dinner|breakfast|meal|restaurant|food|coffee|cafe)\b/i.test(text)) return "meal";
  if (/\b(call|called|phone|voice|talk|spoke|chat|message|text|dm)\b/i.test(text)) return "conversation";
  if (/\b(meet|met|meeting|discussed|discussion)\b/i.test(text)) return "meeting";
  if (/\b(gym|workout|run|fitness|training)\b/i.test(text)) return "fitness";
  if (/\b(startup|project|coding|work|study|brainstorm|idea|build|launch)\b/i.test(text)) return "work";
  if (/\b(travel|trip|journey|visited|went)\b/i.test(text)) return "travel";
  if (/\b(argument|argued|fight|issue|problem)\b/i.test(text)) return "conflict";
  if (/\b(help|support|advice|mentor|guided)\b/i.test(text)) return "support";
  return "mention";
}

function contextImportance(text, type) {
  let score = 6;
  if (IMPORTANT_CONTEXT_WORDS.test(text)) score += 16;
  if (/\b(deep conversation|heart to heart|important talk|decision)\b/i.test(text)) score += 16;
  if (/\b(travel|trip|journey)\b/i.test(text)) score += 15;
  if (/\b(startup|project|launch|coding|investor|mentor)\b/i.test(text)) score += 13;
  if (/\b(lunch|dinner|coffee|cafe|meal)\b/i.test(text)) score += 9;
  if (/\b(gym|workout|fitness)\b/i.test(text)) score += 8;
  if (type === "voice" || type === "journal") score += 6;
  if (type === "screenshot") score += 4;
  if (type === "ai-chat") score += 3;
  return clamp(score, 1, 40);
}

function emotionalImpact(text, sentiment) {
  return {
    happiness: POSITIVE_WORDS.test(text) ? 1 : 0,
    stress: NEGATIVE_WORDS.test(text) ? 1 : 0,
    motivation: /\b(motivated|inspired|productive|focus|startup|idea|helped|support)\b/i.test(text) ? 1 : 0,
    energy: /\b(gym|workout|fitness|excited|energized|travel)\b/i.test(text) ? 1 : 0,
    trend: sentiment,
  };
}

function classifyRelationshipType(name, texts) {
  const joined = `${name} ${texts.join(" ")}`.toLowerCase();
  if (/\b(mother|mom|mummy|maa|father|dad|papa|brother|sister|bhai|didi|family)\b/.test(joined)) {
    if (/mother|mom|mummy|maa/.test(joined)) return "Mother";
    if (/father|dad|papa/.test(joined)) return "Father";
    if (/brother|bhai/.test(joined)) return "Brother";
    if (/sister|didi/.test(joined)) return "Sister";
    return "Family";
  }
  if (/\b(girlfriend|boyfriend|partner|spouse|wife|husband)\b/.test(joined)) {
    if (/girlfriend/.test(joined)) return "Girlfriend";
    if (/boyfriend/.test(joined)) return "Boyfriend";
    if (/wife|husband|spouse/.test(joined)) return "Spouse";
    return "Partner";
  }
  if (/\b(boss|coworker|client|investor|mentor|team|office|startup|meeting|work|project|linkedin)\b/.test(joined)) {
    if (/boss/.test(joined)) return "Boss";
    if (/client/.test(joined)) return "Client";
    if (/investor/.test(joined)) return "Investor";
    if (/mentor/.test(joined)) return "Mentor";
    if (/coworker|team|office/.test(joined)) return "Coworker";
    return "Professional";
  }
  if (/\b(best friend|close friend|friend|bro|buddy|hangout)\b/.test(joined)) {
    if (/best friend/.test(joined)) return "Best Friend";
    if (/close friend/.test(joined)) return "Close Friend";
    return "Friend";
  }
  if (/\b(contact|network|met|introduced|acquaintance)\b/.test(joined)) return "Contact";
  return "Unknown";
}

function extractFamilyAliases(text) {
  const found = [];
  const lower = String(text || "").toLowerCase();
  for (const [alias, canonical] of FAMILY_ALIASES.entries()) {
    const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (pattern.test(lower)) found.push({ name: canonical, raw: alias, confidence: 0.78 });
  }
  return found;
}

function splitCandidateNames(value) {
  return String(value || "")
    .replace(/\b(and|with|plus)\b/gi, ",")
    .split(/,|&|\+/)
    .map((part) => normalizePersonName(part))
    .filter(Boolean);
}

function extractExplicitNames(text) {
  const candidates = [];
  const patterns = [
    /\b(?:with|met|meet|meeting|called|call|texted|messaged|dm(?:ed)?|talked to|spoke with|lunch with|dinner with|coffee with|worked with|studied with|gym with|travel(?:ed)? with|hang(?:ing)? out with)\s+([A-Z][a-z]+(?:\s+(?:and\s+)?[A-Z][a-z]+){0,3})/g,
    /\b(?:friend|mentor|boss|client|investor|coworker|partner)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:helped|called|messaged|met|joined|visited|supported|inspired|argued|discussed|shared)\b/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      for (const name of splitCandidateNames(match[1])) {
        candidates.push({ name, raw: match[0], confidence: 0.86 });
      }
    }
  }
  return candidates;
}

function extractKnownNames(text, knownNames) {
  if (!knownNames?.size) return [];
  const matches = [];
  for (const name of knownNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\b`, "i");
    if (pattern.test(text)) matches.push({ name, raw: name, confidence: 0.66 });
  }
  return matches;
}

function hasInteractionContext(text) {
  return /\b(with|met|meet|called|texted|messaged|spoke|talked|lunch|dinner|coffee|gym|friend|mentor|boss|client|investor|coworker|family|mom|dad|mother|father|brother|sister|girlfriend|boyfriend|wife|husband|support|helped|argument|discussed)\b/i.test(text);
}

function buildSources({ memories = [], chats = [], places = [] }) {
  return [
    ...memories.map((memory, index) => ({ ...memory, sourceIndex: index })),
    ...chats.map((chat, index) => ({
      ...chat,
      id: chat.id || `chat_${index}`,
      type: "ai-chat",
      title: chat.role === "user" ? "User conversation memory" : "AI assistant response",
      content: chat.content || chat.message || "",
      timestamp: chat.createdAt || chat.timestamp,
      sourceIndex: memories.length + index,
    })),
    ...places.map((place, index) => ({
      ...place,
      id: place.memoryId || place.entryId || place.id || `place_${index}`,
      type: "place",
      title: place.placeName || place.title || "Place memory",
      content: [place.placeName, place.category, place.address, place.notes].filter(Boolean).join(" "),
      timestamp: place.departureTime || place.arrivalTime || place.createdAt,
      metadata: { ...(place.metadata || {}), passivePlaceVisit: true, placeName: place.placeName },
      sourceIndex: memories.length + chats.length + index,
    })),
  ];
}

function extractEventsFromSource(source, knownNames, index) {
  const text = sourceText(source);
  if (!text || !hasInteractionContext(text)) return [];
  const candidates = [
    ...extractFamilyAliases(text),
    ...extractExplicitNames(text),
    ...extractKnownNames(text, knownNames),
  ];
  const uniqueByName = new Map();
  for (const candidate of candidates) {
    if (!candidate.name) continue;
    const existing = uniqueByName.get(candidate.name);
    if (!existing || candidate.confidence > existing.confidence) uniqueByName.set(candidate.name, candidate);
  }

  const sentiment = detectSentiment(text);
  const type = sourceType(source);
  const timestamp = sourceTimestamp(source);
  const interactionType = detectInteractionType(text);
  const contextScore = contextImportance(text, type);
  const impact = emotionalImpact(text, sentiment);

  return [...uniqueByName.values()].map((candidate) => ({
    id: `relationship_event_${sourceId(source, index)}_${candidate.name.replace(/\s+/g, "_").toLowerCase()}`,
    userId: source.userId,
    personName: candidate.name,
    sourceType: type,
    sourceId: sourceId(source, index),
    sourceTitle: source.title || candidate.name,
    interactionType,
    sentiment,
    timestamp,
    metadata: {
      confidence: candidate.confidence,
      snippet: snippet(text),
      sourceTags: source.tags || [],
      sourceEmotions: source.emotions || [],
      contextImportance: contextScore,
      emotionalImpact: impact,
      location: source.location || source.metadata?.placeName || null,
    },
  }));
}

function buildKnownNames(sources) {
  const names = new Set();
  for (const source of sources) {
    const text = sourceText(source);
    if (!hasInteractionContext(text)) continue;
    for (const candidate of [...extractFamilyAliases(text), ...extractExplicitNames(text)]) {
      if (candidate.name) names.add(candidate.name);
    }
  }
  return names;
}

function relationshipStatus(strength) {
  if (strength >= 80) return "Core Relationship";
  if (strength >= 60) return "Strong";
  if (strength >= 40) return "Active";
  if (strength >= 20) return "Casual";
  return "Weak";
}

function relationshipHealth({ strength, positiveScore, negativeScore, daysSince, interactionCount }) {
  if (strength >= 70 && positiveScore >= negativeScore && daysSince <= 45) return "Excellent";
  if (strength >= 45 && daysSince <= 60 && positiveScore >= negativeScore * 0.8) return "Healthy";
  if (interactionCount >= 2 && (daysSince > 60 || negativeScore > positiveScore)) return "Needs Attention";
  return "Weak";
}

function aggregateProfile(userId, personName, events) {
  const sorted = [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const firstSeen = sorted[0]?.timestamp;
  const lastSeen = sorted.at(-1)?.timestamp;
  const interactionCount = sorted.length;
  const spanDays = Math.max(1, daysBetween(firstSeen, lastSeen) || 1);
  const frequency = Number(((interactionCount / spanDays) * 30).toFixed(2));
  const positiveEvents = sorted.filter((event) => event.sentiment === "positive" || event.sentiment === "mixed");
  const negativeEvents = sorted.filter((event) => event.sentiment === "negative" || event.sentiment === "mixed");
  const positiveScore = clamp((positiveEvents.length / interactionCount) * 100);
  const negativeScore = clamp((negativeEvents.length / interactionCount) * 100);
  const daysSince = ageInDays(lastSeen);
  const durationScore = clamp(Math.min(22, spanDays / 12));
  const recencyScore = clamp(daysSince <= 7 ? 24 : daysSince <= 30 ? 18 : daysSince <= 60 ? 12 : daysSince <= 120 ? 7 : 2, 0, 24);
  const frequencyScore = clamp(Math.min(26, Math.log2(interactionCount + 1) * 9 + Math.min(8, frequency * 2)), 0, 26);
  const contextScore = clamp(sorted.reduce((sum, event) => sum + Number(event.metadata?.contextImportance || 0), 0) / interactionCount, 0, 24);
  const diversityScore = clamp(new Set(sorted.map((event) => event.interactionType)).size * 3, 0, 12);
  const sentimentScore = clamp(positiveScore * 0.12 - negativeScore * 0.1 + 8, 0, 12);
  const strength = clamp(frequencyScore + recencyScore + durationScore + contextScore * 0.65 + diversityScore + sentimentScore);
  const relationshipType = classifyRelationshipType(personName, sorted.map((event) => `${event.sourceTitle} ${event.metadata?.snippet || ""}`));
  const impact = sorted.reduce(
    (acc, event) => {
      const item = event.metadata?.emotionalImpact || {};
      acc.happiness += Number(item.happiness || 0);
      acc.stress += Number(item.stress || 0);
      acc.motivation += Number(item.motivation || 0);
      acc.energy += Number(item.energy || 0);
      return acc;
    },
    { happiness: 0, stress: 0, motivation: 0, energy: 0 },
  );
  const normalizedImpact = {
    happiness: clamp((impact.happiness / interactionCount) * 100),
    stress: clamp((impact.stress / interactionCount) * 100),
    motivation: clamp((impact.motivation / interactionCount) * 100),
    energy: clamp((impact.energy / interactionCount) * 100),
  };
  const trustScore = clamp(54 + positiveScore * 0.28 - negativeScore * 0.22 + Math.min(16, interactionCount * 2) - Math.max(0, daysSince - 90) * 0.12);
  const importanceScore = clamp(strength * 0.55 + contextScore * 1.4 + Math.min(18, interactionCount * 2));
  const reconnectScore = strength >= 35 && daysSince >= 45 ? clamp((strength * 0.5) + Math.min(42, daysSince * 0.45) + contextScore * 0.6) : 0;
  const status = relationshipStatus(strength);

  return {
    id: `relationship_${userId}_${personName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    userId,
    personName,
    relationshipType,
    firstSeen,
    lastSeen,
    interactionCount,
    interactionFrequency: frequency,
    relationshipStrength: strength,
    positiveScore,
    negativeScore,
    emotionalImpact: normalizedImpact,
    trustScore,
    importanceScore,
    reconnectScore,
    relationshipStatus: status,
    relationshipHealth: relationshipHealth({ strength, positiveScore, negativeScore, daysSince, interactionCount }),
    daysSinceLastInteraction: daysSince,
    evidence: sorted.slice(-6).reverse().map((event) => ({
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      title: event.sourceTitle,
      timestamp: event.timestamp,
      snippet: event.metadata?.snippet || "",
      confidence: event.metadata?.confidence || 0.7,
    })),
    createdAt: firstSeen || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildInsights(userId, profiles, events) {
  const insights = [];
  const addInsight = (relationship, type, text, confidence, evidenceEvents) => {
    if (!relationship || !evidenceEvents?.length) return;
    insights.push({
      id: `relationship_insight_${relationship.id}_${type}`.replace(/[^a-zA-Z0-9_]/g, "_"),
      userId,
      relationshipId: relationship.id,
      insightType: type,
      insightText: text,
      confidence: clamp(confidence),
      evidence: evidenceEvents.slice(0, 5).map((event) => ({
        sourceId: event.sourceId,
        sourceType: event.sourceType,
        title: event.sourceTitle,
        timestamp: event.timestamp,
        snippet: event.metadata?.snippet || "",
      })),
      createdAt: new Date().toISOString(),
    });
  };

  for (const profile of profiles) {
    const personEvents = events.filter((event) => event.personName === profile.personName);
    const positive = personEvents.filter((event) => event.sentiment === "positive" || event.metadata?.emotionalImpact?.happiness);
    const negative = personEvents.filter((event) => event.sentiment === "negative" || event.metadata?.emotionalImpact?.stress);
    const productive = personEvents.filter((event) => PRODUCTIVE_WORDS.test(`${event.sourceTitle} ${event.metadata?.snippet || ""}`));
    const important = personEvents.filter((event) => IMPORTANT_CONTEXT_WORDS.test(`${event.sourceTitle} ${event.metadata?.snippet || ""}`));
    if (positive.length >= 2) {
      addInsight(profile, "positive-impact", `You appear happiest around ${profile.personName} in ${positive.length} stored interactions.`, 62 + positive.length * 8, positive);
    }
    if (productive.length >= 2) {
      addInsight(profile, "productivity-impact", `${profile.personName} appears during ${productive.length} productive or startup-related memories.`, 60 + productive.length * 7, productive);
    }
    if (negative.length >= 2) {
      addInsight(profile, "stress-impact", `${profile.personName} appears in ${negative.length} stressful or difficult memories.`, 58 + negative.length * 7, negative);
    }
    if (important.length >= 2) {
      addInsight(profile, "life-milestone", `${profile.personName} has been present during major life or project milestones.`, 64 + important.length * 7, important);
    }
    if (profile.reconnectScore >= 45) {
      addInsight(profile, "reconnect", `You have not interacted with ${profile.personName} in ${profile.daysSinceLastInteraction} days.`, profile.reconnectScore, personEvents.slice(-3).reverse());
    }
  }

  return insights.sort((a, b) => b.confidence - a.confidence).slice(0, 60);
}

function clusterForEvent(event) {
  const text = `${event.sourceTitle} ${event.metadata?.snippet || ""}`.toLowerCase();
  if (/\b(mom|dad|mother|father|family|brother|sister|wife|husband)\b/.test(text)) return "Family Circle";
  if (/\b(startup|project|coding|mentor|investor|client|work|office|meeting)\b/.test(text)) return "Startup / Work Circle";
  if (/\b(gym|workout|fitness|run|training)\b/.test(text)) return "Fitness Circle";
  if (/\b(cafe|coffee|dinner|lunch|hangout|friend|party)\b/.test(text)) return "Social Circle";
  if (/\b(travel|trip|journey|hotel|airport)\b/.test(text)) return "Travel Circle";
  return "Memory Circle";
}

function buildClusters(userId, profiles, events) {
  const clusterMap = new Map();
  for (const event of events) {
    const name = clusterForEvent(event);
    const cluster = clusterMap.get(name) || { name, members: new Map(), eventCount: 0 };
    const member = cluster.members.get(event.personName) || { personName: event.personName, evidenceCount: 0, relationshipId: profiles.find((p) => p.personName === event.personName)?.id };
    member.evidenceCount += 1;
    cluster.members.set(event.personName, member);
    cluster.eventCount += 1;
    clusterMap.set(name, cluster);
  }

  return [...clusterMap.values()]
    .filter((cluster) => cluster.members.size >= 1 && cluster.eventCount >= 1)
    .map((cluster) => ({
      id: `relationship_cluster_${userId}_${cluster.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
      userId,
      clusterName: cluster.name,
      members: [...cluster.members.values()].sort((a, b) => b.evidenceCount - a.evidenceCount),
      confidence: clamp(45 + cluster.eventCount * 8 + cluster.members.size * 5),
      createdAt: new Date().toISOString(),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 24);
}

function buildGraph(profiles, events, clusters) {
  const nodes = profiles.slice(0, 18).map((profile, index) => ({
    id: profile.id,
    label: profile.personName,
    relationshipType: profile.relationshipType,
    strength: profile.relationshipStrength,
    health: profile.relationshipHealth,
    x: 260 + Math.cos(index * 0.82) * (110 + (index % 4) * 18),
    y: 160 + Math.sin(index * 0.82) * (80 + (index % 3) * 20),
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = [];
  for (const cluster of clusters) {
    const members = (cluster.members || [])
      .map((member) => profiles.find((profile) => profile.personName === member.personName))
      .filter((profile) => profile && nodeIds.has(profile.id));
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        edges.push({
          source: members[i].id,
          target: members[j].id,
          reason: cluster.clusterName,
          strength: Math.min(98, Math.round((members[i].relationshipStrength + members[j].relationshipStrength + cluster.confidence) / 3)),
        });
      }
    }
  }
  if (!edges.length && nodes.length > 1) {
    for (let i = 1; i < Math.min(nodes.length, 6); i += 1) {
      edges.push({ source: nodes[0].id, target: nodes[i].id, reason: "shared relationship graph", strength: Math.min(nodes[0].strength, nodes[i].strength) });
    }
  }
  return { nodes, edges: edges.slice(0, 32) };
}

function buildOverview(profiles, insights) {
  const core = profiles.filter((profile) => profile.relationshipStrength >= 80).length;
  const newRelationships = profiles.filter((profile) => ageInDays(profile.firstSeen) <= 30).length;
  const reconnect = profiles.filter((profile) => profile.reconnectScore >= 45).length;
  const averageStrength = profiles.length
    ? clamp(profiles.reduce((sum, profile) => sum + profile.relationshipStrength, 0) / profiles.length)
    : 0;
  return {
    totalRelationships: profiles.length,
    coreRelationships: core,
    newRelationships,
    reconnectCandidates: reconnect,
    averageStrength,
    insightsGenerated: insights.length,
  };
}

export function buildRelationshipIntelligence({ userId, memories = [], chats = [], places = [] }) {
  const sources = buildSources({ memories, chats, places }).filter((source) => !source.deletedAt && !source.metadata?.deletedAt);
  const knownNames = buildKnownNames(sources);
  const events = sources.flatMap((source, index) => extractEventsFromSource(source, knownNames, index)).filter((event) => event.userId || userId).map((event) => ({ ...event, userId }));
  const grouped = events.reduce((map, event) => {
    map.set(event.personName, [...(map.get(event.personName) || []), event]);
    return map;
  }, new Map());
  const profiles = [...grouped.entries()]
    .map(([personName, personEvents]) => aggregateProfile(userId, personName, personEvents))
    .sort((a, b) => b.relationshipStrength - a.relationshipStrength);
  const insights = buildInsights(userId, profiles, events);
  const clusters = buildClusters(userId, profiles, events);
  const graph = buildGraph(profiles, events, clusters);
  const reconnect = profiles
    .filter((profile) => profile.reconnectScore >= 45)
    .sort((a, b) => b.reconnectScore - a.reconnectScore)
    .map((profile) => ({
      relationshipId: profile.id,
      personName: profile.personName,
      daysSinceLastInteraction: profile.daysSinceLastInteraction,
      reconnectScore: profile.reconnectScore,
      reason: `Strong historical relationship with ${profile.daysSinceLastInteraction} days of silence.`,
      lastInteraction: profile.lastSeen,
      evidence: profile.evidence.slice(0, 3),
    }));

  return {
    version: "NeuroNest Relationship Intelligence v1",
    userId,
    generatedAt: new Date().toISOString(),
    overview: buildOverview(profiles, insights),
    relationships: profiles,
    events: events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    insights,
    clusters,
    graph,
    reconnect,
    topPeople: profiles.slice(0, 10),
  };
}

export function findRelationshipById(snapshot, idOrName) {
  const lookup = String(idOrName || "").toLowerCase();
  return (snapshot?.relationships || []).find(
    (relationship) => relationship.id.toLowerCase() === lookup || relationship.personName.toLowerCase() === lookup,
  );
}

export function buildRelationshipTimeline(snapshot, relationshipId) {
  const relationship = findRelationshipById(snapshot, relationshipId);
  if (!relationship) return null;
  const events = (snapshot.events || [])
    .filter((event) => event.personName === relationship.personName)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const milestones = [];
  if (events[0]) {
    milestones.push({
      type: "first-seen",
      title: `First known interaction with ${relationship.personName}`,
      timestamp: events[0].timestamp,
      body: events[0].metadata?.snippet || events[0].sourceTitle,
    });
  }
  events
    .filter((event) => Number(event.metadata?.contextImportance || 0) >= 18)
    .slice(0, 8)
    .forEach((event) => milestones.push({
      type: "milestone",
      title: event.sourceTitle || `${relationship.personName} milestone`,
      timestamp: event.timestamp,
      body: event.metadata?.snippet || "",
    }));
  if (relationship.daysSinceLastInteraction >= 45) {
    milestones.push({
      type: "silence",
      title: `${relationship.daysSinceLastInteraction} days since last interaction`,
      timestamp: relationship.lastSeen,
      body: "Reconnect recommendation is based on stored relationship strength and recent silence.",
    });
  }
  return { relationship, events, milestones };
}

export function answerRelationshipQuery(query, snapshot) {
  const text = String(query || "").toLowerCase();
  const relationships = snapshot?.relationships || [];
  if (!relationships.length) {
    return {
      matched: /who|friend|relationship|spoken|mood|reconnect|people|person/i.test(query || ""),
      answer: "I do not have enough evidence-backed relationship memories yet.",
      confidence: 0,
      evidence: [],
    };
  }
  let selected = [];
  let answer = "";
  if (/most time|most|strongest|matters|top people|appears most/.test(text)) {
    selected = relationships.slice(0, 5);
    answer = `Your strongest relationship signals are ${selected.map((item) => `${item.personName} (${item.relationshipStrength})`).join(", ")}.`;
  } else if (/not spoken|recently|reconnect|disappearing|fading|silence/.test(text)) {
    selected = snapshot.reconnect.slice(0, 5).map((item) => relationships.find((rel) => rel.id === item.relationshipId)).filter(Boolean);
    answer = selected.length
      ? `Reconnect candidates: ${selected.map((item) => `${item.personName} (${item.daysSinceLastInteraction} days)`).join(", ")}.`
      : "No evidence-backed reconnect candidates yet.";
  } else if (/mood|happy|happiest|positive|stress|negative/.test(text)) {
    selected = [...relationships]
      .sort((a, b) => {
        const left = /stress|negative/.test(text) ? b.emotionalImpact.stress - a.emotionalImpact.stress : b.emotionalImpact.happiness - a.emotionalImpact.happiness;
        return left || b.interactionCount - a.interactionCount;
      })
      .slice(0, 5);
    answer = /stress|negative/.test(text)
      ? `Stress-linked relationship signals: ${selected.map((item) => `${item.personName} (${item.emotionalImpact.stress}%)`).join(", ")}.`
      : `Positive mood-linked relationship signals: ${selected.map((item) => `${item.personName} (${item.emotionalImpact.happiness}%)`).join(", ")}.`;
  } else if (/startup|work|productive|helped|phase/.test(text)) {
    selected = relationships
      .filter((relationship) => (snapshot.events || []).some((event) => event.personName === relationship.personName && PRODUCTIVE_WORDS.test(`${event.sourceTitle} ${event.metadata?.snippet || ""}`)))
      .slice(0, 5);
    answer = selected.length
      ? `${selected.map((item) => item.personName).join(", ")} appear in productive/startup-related relationship evidence.`
      : "I do not have evidence-backed productive relationship signals yet.";
  } else {
    return { matched: false, answer: "", confidence: 0, evidence: [] };
  }
  const evidence = selected.flatMap((relationship) => relationship.evidence || []).slice(0, 6);
  return {
    matched: true,
    answer,
    confidence: clamp(45 + evidence.length * 8 + selected.length * 4),
    evidence,
  };
}
