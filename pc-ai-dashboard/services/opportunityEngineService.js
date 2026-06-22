const INTEREST_PATTERNS = [
  ["AI", /\b(ai|openai|groq|gpt|llm|machine learning|model|embedding|vector|chatbot|assistant|agent|automation)\b/i],
  ["SaaS", /\b(saas|subscription|software as a service|pricing|mrr|product-led|customers?|dashboard)\b/i],
  ["Startup", /\b(startup|founder|launch|mvp|business|investor|market|customer|revenue|growth)\b/i],
  ["Coding", /\b(code|coding|bug|fix|github|render|deploy|server|api|frontend|backend|database|react|node)\b/i],
  ["Product Design", /\b(product design|ui|ux|figma|layout|animation|interface|brand|logo|mobile design|dashboard)\b/i],
  ["Fitness", /\b(gym|workout|fitness|run|training|health|weight|kg|diet|discipline)\b/i],
  ["Learning", /\b(study|learn|course|book|reading|notes|exam|practice|research|tutorial)\b/i],
  ["Productivity", /\b(productive|focus|deep work|routine|habit|task|mission|goal|momentum|execution)\b/i],
  ["Travel", /\b(travel|trip|hotel|airport|journey|visited|city|map|place|location)\b/i],
  ["Business", /\b(marketing|sales|offer|customer|client|strategy|brand|monetize|business plan)\b/i],
];

const SKILL_PATTERNS = [
  ["AI Engineering", /\b(ai|llm|embedding|vector|prompt|agent|openai|groq|model|semantic search|machine learning)\b/i],
  ["Full-stack Development", /\b(code|coding|react|node|server|api|frontend|backend|database|github|render|deploy|bug|fix)\b/i],
  ["Product Design", /\b(ui|ux|design|layout|animation|prototype|figma|dashboard|mobile design|glassmorphism)\b/i],
  ["Founder Execution", /\b(startup|founder|launch|mvp|saas|customer|pricing|business|roadmap|mission)\b/i],
  ["Productivity Systems", /\b(focus|deep work|habit|routine|mission|task|productivity|weekly review|goal)\b/i],
  ["Fitness Discipline", /\b(gym|workout|fitness|training|health|weight|run|discipline)\b/i],
  ["Research & Learning", /\b(research|study|learn|course|book|reading|notes|tutorial|practice)\b/i],
];

const PROJECT_PATTERNS = [
  ["NeuroNest", /\b(neuronest|ai memory os|second brain|memory operating system|life os|digital twin)\b/i],
  ["AI SaaS", /\b(ai saas|saas|startup|mvp|subscription|launch|customers?|pricing)\b/i],
  ["Mobile App", /\b(mobile|android|ios|app|responsive|phone|react native|mobile dashboard)\b/i],
  ["Place Intelligence", /\b(place hunter|google maps|places api|map|location|restaurant|cafe|gym|passive place)\b/i],
  ["Voice Assistant", /\b(voice assistant|speech|voice note|transcript|tts|stt|microphone|assistant voice)\b/i],
  ["Admin Platform", /\b(super admin|admin panel|security center|database explorer|analytics|admin dashboard)\b/i],
];

const CAREER_COMBOS = [
  {
    label: "AI SaaS builder",
    topics: ["AI", "SaaS", "Startup"],
    recommendation: "Turn the repeated AI plus SaaS signals into one small product experiment with a clear user problem.",
  },
  {
    label: "Full-stack AI product builder",
    topics: ["AI", "Coding", "Product Design"],
    recommendation: "Keep building full-stack AI features because your evidence connects model work, product UI, and shipping.",
  },
  {
    label: "Founder-operator path",
    topics: ["Startup", "Productivity", "Business"],
    recommendation: "Use your execution and business signals to define one weekly founder mission with measurable progress.",
  },
  {
    label: "Health-performance system",
    topics: ["Fitness", "Productivity"],
    recommendation: "Connect fitness routines with focus sessions and track whether workout days improve output.",
  },
];

const LEARNING_PATTERNS = [
  ["AI learning", /\b(ai|llm|embedding|vector|agent|openai|groq|machine learning|prompt)\b/i],
  ["Coding learning", /\b(code|coding|javascript|react|node|api|database|github|deploy|debug)\b/i],
  ["Design learning", /\b(ui|ux|design|animation|layout|prototype|figma|mobile design)\b/i],
  ["Business learning", /\b(startup|business|customer|pricing|sales|marketing|saas|launch)\b/i],
  ["Fitness learning", /\b(gym|workout|fitness|nutrition|diet|training|health)\b/i],
];

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
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function timestampOf(item = {}) {
  return item.timestamp || item.createdAt || item.createdDate || item.updatedAt || item.departureTime || item.arrivalTime || nowIso();
}

function dayKey(value) {
  return asDate(value).toISOString().slice(0, 10);
}

function ageInDays(value) {
  const time = asDate(value).getTime();
  if (!time) return 9999;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

function textOf(item = {}) {
  const metadata = item.metadata || {};
  return [
    item.title,
    item.content,
    item.body,
    item.summary,
    item.meta,
    item.type,
    item.kind,
    item.category,
    item.placeName,
    item.address,
    item.decision,
    item.reason,
    item.expectedOutcome,
    item.actualOutcome,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags,
    Array.isArray(item.emotions) ? item.emotions.join(" ") : item.emotions,
    metadata.ocrText,
    metadata.extractedText,
    metadata.voiceTranscript,
    metadata.transcript,
    metadata.aiSummary,
    metadata.imageCaption,
    metadata.visualLabels,
    metadata.topics,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceItem(item = {}, reason = "opportunity evidence") {
  return {
    id: String(item.id || item.entryId || item.memoryId || item.sourceId || stableId(item.title, timestampOf(item))),
    type: String(item.type || item.kind || item.sourceType || item.sourceBucket || "memory"),
    title: String(item.title || item.sourceTitle || item.placeName || item.content || item.body || "Evidence").slice(0, 140),
    timestamp: timestampOf(item),
    reason,
  };
}

function uniqueBy(items = [], keyFn, limit = 20) {
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

function uniqueEvidence(items = [], limit = 10) {
  return uniqueBy(items, (item) => `${item.id}_${item.timestamp}_${item.reason}`, limit);
}

function groupBy(items = [], keyFn) {
  const map = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    map[key] ||= [];
    map[key].push(item);
  }
  return map;
}

function confidenceFromEvidence(evidenceCount, distinctDays, growthPercent = 0, goalCount = 0) {
  if (!evidenceCount) return 0;
  return clamp(36 + evidenceCount * 7 + Math.min(distinctDays, 45) * 0.55 + Math.max(0, growthPercent) * 0.22 + goalCount * 5, 38, 95);
}

function splitRecentPrevious(items = [], days = 14) {
  const recent = [];
  const previous = [];
  for (const item of items) {
    if (ageInDays(timestampOf(item)) <= days) recent.push(item);
    else previous.push(item);
  }
  return { recent, previous };
}

function trendPercent(recentCount, previousCount) {
  if (!recentCount && !previousCount) return 0;
  if (!previousCount) return clamp(recentCount * 18, 0, 100);
  return clamp(((recentCount - previousCount) / Math.max(1, previousCount)) * 100, -100, 100);
}

function normalizeRecords({ memories = [], records = [], chats = [], places = [], goals = [], relationships = [], searchSignals = [] } = {}) {
  const fromMemories = memories.map((memory) => ({ ...memory, sourceBucket: "memory" }));
  const fromRecords = records.map((record) => ({ ...record, sourceBucket: "record" }));
  const fromChats = chats.map((chat, index) => ({
    ...chat,
    id: chat.id || `chat_${index}`,
    title: chat.role === "user" ? "User conversation" : "AI conversation",
    content: chat.content || chat.message || "",
    type: "ai-chat",
    sourceBucket: "chat",
  }));
  const fromPlaces = places.map((place, index) => ({
    ...place,
    id: place.id || place.memoryId || `place_${index}`,
    title: place.placeName || place.title || "Place visit",
    content: [place.placeName, place.category, place.address].filter(Boolean).join(" "),
    type: "place",
    timestamp: place.departureTime || place.arrivalTime || place.createdAt,
    sourceBucket: "place",
  }));
  const fromGoals = goals.map((goal, index) => ({
    ...goal,
    id: goal.id || `goal_${index}`,
    title: goal.title || "Goal",
    content: [goal.title, goal.description, Array.isArray(goal.tags) ? goal.tags.join(" ") : ""].filter(Boolean).join(" "),
    type: "goal",
    timestamp: goal.updatedAt || goal.createdAt,
    sourceBucket: "goal",
  }));
  const fromRelationships = relationships.map((relationship, index) => ({
    ...relationship,
    id: relationship.id || `relationship_${index}`,
    title: relationship.personName || relationship.title || "Relationship",
    content: [
      relationship.personName,
      relationship.relationshipType,
      relationship.relationshipStatus,
      relationship.insightText,
      relationship.summary,
    ].filter(Boolean).join(" "),
    type: "relationship",
    timestamp: relationship.lastSeen || relationship.createdAt,
    sourceBucket: "relationship",
  }));
  const fromSearches = searchSignals.map((signal, index) => ({
    ...signal,
    id: signal.id || `search_${index}`,
    title: signal.title || "Search activity",
    content: signal.query || signal.content || signal.text || "",
    type: "search",
    timestamp: signal.createdAt || signal.timestamp,
    sourceBucket: "search",
  }));

  const merged = [...fromMemories, ...fromRecords, ...fromChats, ...fromPlaces, ...fromGoals, ...fromRelationships, ...fromSearches]
    .filter((item) => !item.deletedAt && !item.metadata?.deletedAt && textOf(item));
  const byId = new Map();
  for (const item of merged) {
    const key = String(item.id || item.entryId || `${item.sourceBucket}_${textOf(item).slice(0, 50)}_${timestampOf(item)}`);
    if (!byId.has(key)) byId.set(key, item);
  }
  return [...byId.values()].sort((a, b) => asDate(timestampOf(b)) - asDate(timestampOf(a)));
}

function matchingGoals(topic, goals = []) {
  const pattern = new RegExp(`\\b${String(topic).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return goals.filter((goal) => pattern.test(textOf(goal)));
}

function matchedRecords(records, pattern) {
  return records.filter((record) => pattern.test(textOf(record)));
}

function buildOpportunity({ userId, category, label, summary, recommendation, related, relatedGoals = [], growthPercent = 0, confidenceBoost = 0, nextActions = [], metadata = {} }) {
  const distinctDays = new Set(related.map((record) => dayKey(timestampOf(record)))).size;
  const evidence = uniqueEvidence([
    ...related.slice(0, 8).map((record) => evidenceItem(record, `${label} signal`)),
    ...relatedGoals.slice(0, 2).map((goal) => evidenceItem({ ...goal, type: "goal" }, "declared goal signal")),
  ]);
  if (evidence.length < 2) return null;
  const confidence = clamp(confidenceFromEvidence(evidence.length, distinctDays, growthPercent, relatedGoals.length) + confidenceBoost);
  const opportunityScore = clamp(confidence * 0.55 + Math.max(0, growthPercent) * 0.25 + Math.min(evidence.length, 10) * 4 + relatedGoals.length * 6);
  return {
    id: `opportunity_${stableId(userId, category, label)}`,
    userId,
    type: "opportunity",
    category,
    title: label,
    summary,
    recommendation,
    predictionScore: opportunityScore,
    opportunityScore,
    confidence,
    riskLevel: "Low",
    growthPercent,
    evidence,
    evidenceCount: evidence.length,
    reasoning: `${related.length} real signal${related.length === 1 ? "" : "s"} across ${distinctDays} day${distinctDays === 1 ? "" : "s"}${relatedGoals.length ? ` plus ${relatedGoals.length} matching declared goal${relatedGoals.length === 1 ? "" : "s"}` : ""}.`,
    nextActions: nextActions.filter(Boolean).slice(0, 4),
    createdAt: nowIso(),
    metadata,
  };
}

function buildGrowingInterestOpportunities({ userId, records, goals }) {
  return INTEREST_PATTERNS.map(([topic, pattern]) => {
    const related = matchedRecords(records, pattern);
    if (related.length < 3) return null;
    const { recent, previous } = splitRecentPrevious(related);
    const growth = trendPercent(recent.length, previous.length);
    if (growth < 20 && related.length < 5) return null;
    const relatedGoals = matchingGoals(topic, goals);
    return buildOpportunity({
      userId,
      category: "growing-interest",
      label: `${topic} interest is growing`,
      summary: `${topic} has ${growth >= 0 ? "+" : ""}${growth}% recent momentum from real user activity.`,
      recommendation: `Create one concrete ${topic} output this week so NeuroNest can test whether this interest is becoming a real direction.`,
      related,
      relatedGoals,
      growthPercent: growth,
      nextActions: [`Save one finished ${topic} result`, `Review the strongest ${topic} memory`, relatedGoals[0] ? `Move goal "${relatedGoals[0].title}" one step forward` : ""],
      metadata: { topic, recentSignals: recent.length, previousSignals: previous.length },
    });
  }).filter(Boolean);
}

function buildGrowingSkillOpportunities({ userId, records, goals }) {
  return SKILL_PATTERNS.map(([skill, pattern]) => {
    const related = matchedRecords(records, pattern);
    if (related.length < 3) return null;
    const { recent, previous } = splitRecentPrevious(related);
    const growth = trendPercent(recent.length, previous.length);
    const relatedGoals = (goals || []).filter((goal) => pattern.test(textOf(goal)));
    return buildOpportunity({
      userId,
      category: "growing-skill",
      label: `${skill} skill is strengthening`,
      summary: `${skill} appears repeatedly in your real activity, with ${related.length} evidence signals.`,
      recommendation: `Treat ${skill} as a compounding skill and turn the next session into a saved proof of progress.`,
      related,
      relatedGoals,
      growthPercent: growth,
      confidenceBoost: related.length >= 5 ? 4 : 0,
      nextActions: [`Do one ${skill} practice block`, `Capture what improved`, `Connect it to an active goal`],
      metadata: { skill, recentSignals: recent.length, previousSignals: previous.length },
    });
  }).filter(Boolean);
}

function buildProjectOpportunities({ userId, records, goals }) {
  return PROJECT_PATTERNS.map(([project, pattern]) => {
    const related = matchedRecords(records, pattern);
    const relatedGoals = (goals || []).filter((goal) => pattern.test(textOf(goal)));
    const nonGoalSignals = related.filter((record) => record.sourceBucket !== "goal");
    if (related.length < 3 && !(nonGoalSignals.length >= 2 && relatedGoals.length)) return null;
    const { recent, previous } = splitRecentPrevious(related);
    const growth = trendPercent(recent.length, previous.length);
    return buildOpportunity({
      userId,
      category: "high-potential-project",
      label: `${project} has high project potential`,
      summary: `${project} has ${related.length} linked signals${relatedGoals.length ? ` and ${relatedGoals.length} matching goal${relatedGoals.length === 1 ? "" : "s"}` : ""}.`,
      recommendation: `Define the next shippable ${project} milestone and keep all related evidence attached to one project chain.`,
      related,
      relatedGoals,
      growthPercent: growth,
      confidenceBoost: relatedGoals.length ? 6 : 0,
      nextActions: [`Choose one ${project} milestone`, "Set a 7-day execution checkpoint", "Save progress after each work session"],
      metadata: { project, recentSignals: recent.length, previousSignals: previous.length, goalCount: relatedGoals.length },
    });
  }).filter(Boolean);
}

function buildCareerOpportunities({ userId, records, goals, relationships }) {
  const byTopic = new Map(INTEREST_PATTERNS.map(([topic, pattern]) => [topic, matchedRecords(records, pattern)]));
  const professionalSignals = (relationships || []).filter((item) =>
    /mentor|client|investor|boss|coworker|professional|founder|team/i.test(textOf(item)),
  );
  return CAREER_COMBOS.map((combo) => {
    const related = uniqueBy(combo.topics.flatMap((topic) => byTopic.get(topic) || []), (item) => item.id || `${textOf(item)}_${timestampOf(item)}`, 20);
    const representedTopics = combo.topics.filter((topic) => (byTopic.get(topic) || []).length >= 2);
    if (representedTopics.length < Math.min(2, combo.topics.length) || related.length < 4) return null;
    const relatedGoals = (goals || []).filter((goal) => combo.topics.some((topic) => textOf(goal).toLowerCase().includes(topic.toLowerCase())));
    const relationshipRecords = professionalSignals.slice(0, 2).map((item) => ({
      ...item,
      title: item.personName ? `${item.personName} relationship signal` : item.title,
      type: "relationship",
      timestamp: item.lastSeen || item.createdAt,
    }));
    const combined = uniqueBy([...related, ...relationshipRecords], (item) => item.id || item.title, 20);
    const { recent, previous } = splitRecentPrevious(combined);
    const growth = trendPercent(recent.length, previous.length);
    return buildOpportunity({
      userId,
      category: "career-opportunity",
      label: `${combo.label} opportunity`,
      summary: `${combo.label} is supported by repeated ${representedTopics.join(", ")} evidence.`,
      recommendation: combo.recommendation,
      related: combined,
      relatedGoals,
      growthPercent: growth,
      confidenceBoost: representedTopics.length * 3,
      nextActions: ["Write one opportunity hypothesis", "Choose a small proof project", "Review evidence after 7 days"],
      metadata: { careerPath: combo.label, representedTopics, professionalSignalCount: professionalSignals.length },
    });
  }).filter(Boolean);
}

function buildLearningOpportunities({ userId, records, goals }) {
  const learningRecords = records.filter((record) => /\b(learn|study|course|book|research|tutorial|practice|notes|exam)\b/i.test(textOf(record)));
  return LEARNING_PATTERNS.map(([learningPath, pattern]) => {
    const related = matchedRecords(records, pattern).filter((record) => learningRecords.includes(record) || /\b(learn|study|research|tutorial|practice|notes|course)\b/i.test(textOf(record)));
    if (related.length < 2) return null;
    const relatedGoals = (goals || []).filter((goal) => pattern.test(textOf(goal)));
    const { recent, previous } = splitRecentPrevious(related);
    const growth = trendPercent(recent.length, previous.length);
    return buildOpportunity({
      userId,
      category: "learning-opportunity",
      label: `${learningPath} is ready to compound`,
      summary: `${learningPath} has ${related.length} learning evidence signal${related.length === 1 ? "" : "s"}.`,
      recommendation: `Convert ${learningPath} into a short learning loop: study, build, save proof, review.`,
      related,
      relatedGoals,
      growthPercent: growth,
      nextActions: [`Pick one ${learningPath} lesson`, "Build a tiny output", "Save the result as a memory"],
      metadata: { learningPath, recentSignals: recent.length, previousSignals: previous.length },
    });
  }).filter(Boolean);
}

function buildOverview(opportunities = [], records = []) {
  const byCategory = groupBy(opportunities, (item) => item.category);
  const evidenceIds = new Set(opportunities.flatMap((item) => item.evidence || []).map((item) => item.id));
  const averageConfidence = opportunities.length
    ? clamp(opportunities.reduce((sum, item) => sum + item.confidence, 0) / opportunities.length)
    : 0;
  const top = opportunities[0] || null;
  return {
    totalOpportunities: opportunities.length,
    growingSkillCount: byCategory["growing-skill"]?.length || 0,
    growingInterestCount: byCategory["growing-interest"]?.length || 0,
    highPotentialProjectCount: byCategory["high-potential-project"]?.length || 0,
    careerOpportunityCount: byCategory["career-opportunity"]?.length || 0,
    learningOpportunityCount: byCategory["learning-opportunity"]?.length || 0,
    averageConfidence,
    evidenceCount: evidenceIds.size,
    sourceRecordCount: records.length,
    topOpportunity: top?.title || "",
    topRecommendation: top?.recommendation || "",
  };
}

export function buildOpportunityEngine({
  userId = "",
  memories = [],
  records = [],
  chats = [],
  places = [],
  goals = [],
  relationshipIntelligence = null,
  searchSignals = [],
} = {}) {
  const relationshipSignals = [
    ...(relationshipIntelligence?.relationships || []),
    ...(relationshipIntelligence?.insights || []),
    ...(relationshipIntelligence?.events || []),
  ];
  const allRecords = normalizeRecords({ memories, records, chats, places, goals, relationships: relationshipSignals, searchSignals });
  if (!userId || (!allRecords.length && !goals.length && !relationshipSignals.length)) {
    return {
      version: "NeuroNest Opportunity Engine v1",
      userId,
      generatedAt: nowIso(),
      empty: true,
      overview: buildOverview([], []),
      opportunities: [],
      byType: {},
      evidencePolicy: "No opportunities are generated without real user evidence.",
    };
  }

  const opportunities = uniqueBy([
    ...buildGrowingSkillOpportunities({ userId, records: allRecords, goals }),
    ...buildGrowingInterestOpportunities({ userId, records: allRecords, goals }),
    ...buildProjectOpportunities({ userId, records: allRecords, goals }),
    ...buildCareerOpportunities({ userId, records: allRecords, goals, relationships: relationshipSignals }),
    ...buildLearningOpportunities({ userId, records: allRecords, goals }),
  ], (item) => item.id, 40)
    .filter((item) => item.evidenceCount > 0 && item.confidence > 0)
    .sort((a, b) => b.opportunityScore + b.confidence - (a.opportunityScore + a.confidence));

  return {
    version: "NeuroNest Opportunity Engine v1",
    userId,
    generatedAt: nowIso(),
    empty: opportunities.length === 0,
    overview: buildOverview(opportunities, allRecords),
    opportunities,
    byType: groupBy(opportunities, (item) => item.category),
    sourceRecords: allRecords.slice(0, 200),
    evidencePolicy: "Every opportunity is generated only from real user memories, chats, goals, screenshots, voice notes, places, relationships, or learning/search signals. Empty accounts return no opportunities.",
  };
}

function filterForQuestion(text, opportunities) {
  if (/skill|skills|growing fastest|strength/i.test(text)) return opportunities.filter((item) => item.category === "growing-skill");
  if (/project|highest potential|potential/i.test(text)) return opportunities.filter((item) => item.category === "high-potential-project");
  if (/career|job|work path|profession/i.test(text)) return opportunities.filter((item) => item.category === "career-opportunity");
  if (/learn|learning|study|course/i.test(text)) return opportunities.filter((item) => item.category === "learning-opportunity");
  if (/interest|growing interest/i.test(text)) return opportunities.filter((item) => item.category === "growing-interest");
  return opportunities;
}

export function answerOpportunityQuery(query = "", snapshot = {}) {
  const text = String(query || "").toLowerCase();
  if (!/\b(what should i focus|opportunit|missing|skills?.*growing|growing.*skills?|highest potential|project.*potential|focus on|career|learning opportunity|worth pursuing)\b/i.test(text)) {
    return { matched: false };
  }
  const opportunities = snapshot.opportunities || [];
  if (!opportunities.length) {
    return {
      matched: true,
      confidence: 0,
      answer: "I do not have enough real evidence to recommend an opportunity yet. Add memories, goals, searches, screenshots, voice notes, or relationship signals first.",
      evidence: [],
    };
  }
  const filtered = filterForQuestion(text, opportunities);
  const best = (filtered.length ? filtered : opportunities)[0];
  const evidenceTitles = (best.evidence || []).slice(0, 3).map((item) => item.title).filter(Boolean).join("; ");
  return {
    matched: true,
    confidence: best.confidence,
    answer: `${best.title}: ${best.recommendation} Confidence ${best.confidence}%. Evidence: ${best.evidenceCount} real signal${best.evidenceCount === 1 ? "" : "s"}${evidenceTitles ? ` (${evidenceTitles})` : ""}. Reasoning: ${best.reasoning}`,
    evidence: best.evidence || [],
    opportunity: best,
  };
}
