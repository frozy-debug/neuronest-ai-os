const PRODUCTIVITY_WORDS = /\b(productive|focus|focused|deep work|built|build|fixed|ship|shipped|launch|launched|coding|study|learn|project|startup|workout|gym|practice|complete|completed|deploy|tested|research)\b/i;
const STRESS_WORDS = /\b(stress|stressed|anxious|burnout|burned out|tired|drained|pressure|overwhelmed|argument|fight|sad|angry|bad|hurt|problem|issue|blocked|late night|midnight)\b/i;
const POSITIVE_WORDS = /\b(happy|calm|excited|motivated|great|good|amazing|proud|love|loved|inspired|clear|peaceful|win|beautiful|best)\b/i;
const RECOVERY_WORDS = /\b(rest|sleep|walk|gym|workout|meditation|family|friend|break|recovery|relax|calm|travel|outside)\b/i;

const TOPIC_PATTERNS = [
  ["AI", /\b(ai|openai|groq|llm|machine learning|model|embedding|chatbot|assistant)\b/i],
  ["Startup", /\b(startup|saas|launch|founder|business|customer|pricing|mvp|product)\b/i],
  ["Coding", /\b(code|coding|bug|fix|github|render|deploy|server|api|frontend|backend|database)\b/i],
  ["Fitness", /\b(gym|workout|fitness|run|training|health|weight|kg|diet)\b/i],
  ["Study", /\b(study|learn|course|book|reading|notes|exam|practice)\b/i],
  ["Design", /\b(design|ui|ux|logo|animation|frontend|figma|layout)\b/i],
  ["Travel", /\b(travel|trip|place|hotel|airport|journey|visited)\b/i],
  ["Productivity", /\b(productive|focus|deep work|routine|habit|task|mission|goal)\b/i],
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
    .slice(0, 140);
}

function asDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function dayKey(value) {
  return asDate(value).toISOString().slice(0, 10);
}

function ageInDays(value) {
  const date = asDate(value);
  if (date.getTime() === 0) return 9999;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
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

function timestampOf(item = {}) {
  return item.timestamp || item.createdAt || item.createdDate || item.updatedAt || item.departureTime || item.arrivalTime || nowIso();
}

function evidenceItem(item = {}, reason = "matched evidence") {
  return {
    id: String(item.id || item.entryId || item.memoryId || item.sourceId || stableId(item.title, timestampOf(item))),
    type: String(item.type || item.kind || item.sourceType || "memory"),
    title: String(item.title || item.sourceTitle || item.placeName || item.content || item.body || "Evidence").slice(0, 140),
    timestamp: timestampOf(item),
    reason,
  };
}

function uniqueEvidence(items = [], limit = 8) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = `${item.id}_${item.timestamp}_${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function confidenceFromEvidence(evidenceCount, spanDays, trendStrength = 0) {
  if (!evidenceCount) return 0;
  return clamp(38 + evidenceCount * 8 + Math.min(spanDays, 45) * 0.45 + trendStrength * 0.28, 42, 96);
}

function riskLabel(score) {
  if (score >= 85) return "Critical";
  if (score >= 68) return "High";
  if (score >= 42) return "Moderate";
  return "Low";
}

function groupBy(items, fn) {
  const map = new Map();
  for (const item of items) {
    const key = fn(item);
    if (!key) continue;
    map.set(key, [...(map.get(key) || []), item]);
  }
  return map;
}

function recordTextMatches(record, pattern) {
  return pattern.test(textOf(record));
}

function normalizeRecords({ memories = [], records = [], chats = [], places = [] } = {}) {
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
  const merged = [...fromMemories, ...fromRecords, ...fromChats, ...fromPlaces].filter((item) => textOf(item));
  const byId = new Map();
  for (const item of merged) {
    const key = String(item.id || item.entryId || `${item.sourceBucket}_${textOf(item).slice(0, 40)}_${timestampOf(item)}`);
    if (!byId.has(key)) byId.set(key, item);
  }
  return [...byId.values()].sort((a, b) => asDate(b.timestamp || b.createdAt) - asDate(a.timestamp || a.createdAt));
}

function keywordsForGoal(goal = {}) {
  const raw = `${goal.title || ""} ${goal.description || ""} ${Array.isArray(goal.tags) ? goal.tags.join(" ") : ""}`.toLowerCase();
  const words = raw
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !["goal", "with", "this", "that", "from", "have"].includes(word));
  const boost = [];
  if (/neuronest|startup|saas|launch|app|build|deploy/.test(raw)) boost.push("neuronest", "startup", "saas", "launch", "build", "deploy", "code");
  if (/gym|fitness|weight|kg|health|workout/.test(raw)) boost.push("gym", "fitness", "workout", "health");
  if (/learn|study|book|course|read|ai/.test(raw)) boost.push("learn", "study", "notes", "ai");
  return [...new Set([...words, ...boost])].slice(0, 18);
}

function recordsForKeywords(records, keywords) {
  if (!keywords.length) return [];
  return records.filter((record) => {
    const text = textOf(record).toLowerCase();
    return keywords.some((keyword) => text.includes(keyword));
  });
}

function splitRecentPrevious(items, days = 14) {
  const recent = [];
  const previous = [];
  for (const item of items) {
    if (ageInDays(timestampOf(item)) <= days) recent.push(item);
    else previous.push(item);
  }
  return { recent, previous };
}

function trendPercent(recentCount, previousCount) {
  if (!previousCount && !recentCount) return 0;
  if (!previousCount) return clamp(recentCount * 18, 0, 100);
  return clamp(((recentCount - previousCount) / Math.max(1, previousCount)) * 100, -100, 100);
}

function buildPrediction({ userId, type, title, summary, score, confidence, riskLevel = "Low", evidence = [], reasoning = "", recommendation = "", horizon = "next 7 days", metadata = {} }) {
  const cleanEvidence = uniqueEvidence(evidence);
  if (!cleanEvidence.length) return null;
  return {
    id: `prediction_${stableId(userId, type, title)}`,
    userId,
    type,
    title,
    summary,
    predictionScore: clamp(score),
    confidence: clamp(confidence),
    riskLevel,
    evidence: cleanEvidence,
    evidenceCount: cleanEvidence.length,
    reasoning,
    recommendation,
    horizon,
    status: "active",
    generatedAt: nowIso(),
    validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    metadata,
  };
}

function buildGoalPredictions({ userId, records, goals }) {
  const activeGoals = (goals || []).filter((goal) => goal.status !== "completed");
  const predictions = [];
  for (const goal of activeGoals) {
    const keywords = keywordsForGoal(goal);
    const related = recordsForKeywords(records, keywords);
    if (related.length < 2) continue;
    const { recent, previous } = splitRecentPrevious(related, 14);
    const days = new Set(related.map((item) => dayKey(timestampOf(item)))).size;
    const progress = Number(goal.progress || 0);
    const momentum = clamp(recent.length * 12 + days * 7 + progress * 0.35);
    const completion = clamp(progress * 0.42 + momentum * 0.46 + Math.min(related.length, 12) * 3);
    const staleDays = Math.min(...related.map((item) => ageInDays(timestampOf(item))));
    const failureRisk = clamp(100 - completion + (staleDays > 10 ? 18 : 0));
    const confidence = confidenceFromEvidence(related.length, days, Math.abs(trendPercent(recent.length, previous.length)));
    predictions.push(buildPrediction({
      userId,
      type: "goal",
      title: `${goal.title} completion forecast`,
      summary: `${completion}% completion probability based on ${related.length} related activity signals across ${days} active day${days === 1 ? "" : "s"}.`,
      score: completion,
      confidence,
      riskLevel: riskLabel(failureRisk),
      evidence: related.slice(0, 8).map((item) => evidenceItem(item, "goal-related activity")),
      reasoning: `${recent.length} recent signals, ${previous.length} older signals, ${progress}% declared progress, ${staleDays} days since the latest related activity.`,
      recommendation: failureRisk >= 68 ? "Protect one small daily mission for this goal before adding new work." : "Keep the current momentum and capture the next concrete progress note.",
      metadata: { goalId: goal.id, goalTitle: goal.title, completionProbability: completion, failureRisk, momentum, recentSignals: recent.length, totalSignals: related.length },
    }));
  }
  return predictions.filter(Boolean).sort((a, b) => b.predictionScore - a.predictionScore);
}

function buildHabitPredictions({ userId, records }) {
  const habitPatterns = [
    ["Gym habit", /\b(gym|workout|fitness|training|run)\b/i],
    ["Coding habit", /\b(code|coding|bug|fix|github|deploy|api|server|frontend|backend)\b/i],
    ["Study habit", /\b(study|learn|course|book|read|notes|practice)\b/i],
    ["Journal habit", /\b(journal|reflection|recap|voice note|note)\b/i],
    ["Startup habit", /\b(startup|saas|founder|business|launch|mvp|customer)\b/i],
  ];
  const predictions = [];
  for (const [label, pattern] of habitPatterns) {
    const related = records.filter((record) => recordTextMatches(record, pattern));
    if (related.length < 3) continue;
    const { recent, previous } = splitRecentPrevious(related, 14);
    const activeDays = new Set(related.map((item) => dayKey(timestampOf(item)))).size;
    const lastGap = Math.min(...related.map((item) => ageInDays(timestampOf(item))));
    const trend = trendPercent(recent.length, previous.length);
    const continuation = clamp(42 + recent.length * 9 + activeDays * 7 + Math.max(0, trend) * 0.22 - Math.max(0, lastGap - 4) * 6);
    const abandonment = clamp(100 - continuation + (lastGap >= 10 ? 18 : 0));
    const state = continuation >= 75 ? "stable habit" : trend >= 30 ? "forming habit" : abandonment >= 58 ? "breaking habit" : "active habit";
    predictions.push(buildPrediction({
      userId,
      type: "habit",
      title: `${label} is ${state}`,
      summary: `${continuation}% probability of continuing based on ${related.length} real activity signals.`,
      score: continuation,
      confidence: confidenceFromEvidence(related.length, activeDays, Math.abs(trend)),
      riskLevel: riskLabel(abandonment),
      evidence: related.slice(0, 8).map((item) => evidenceItem(item, label)),
      reasoning: `${recent.length} recent signals vs ${previous.length} older signals; latest signal ${lastGap} days ago.`,
      recommendation: abandonment >= 58 ? "Shrink this habit into a small next action today." : "Keep this habit visible with one captured proof point this week.",
      metadata: { habit: label, state, continuationProbability: continuation, abandonmentRisk: abandonment, trend },
    }));
  }
  return predictions.filter(Boolean).sort((a, b) => b.predictionScore - a.predictionScore);
}

function buildProductivityPredictions({ userId, records }) {
  const productive = records.filter((record) => PRODUCTIVITY_WORDS.test(textOf(record)));
  if (productive.length < 3) return [];
  const byHour = groupBy(productive, (record) => asDate(timestampOf(record)).getHours());
  const bestHour = [...byHour.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const byDay = groupBy(productive, (record) => asDate(timestampOf(record)).toLocaleDateString("en-US", { weekday: "long" }));
  const bestDay = [...byDay.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const locationRecords = productive.filter((record) => /cafe|coffee|gym|office|home|library|restaurant|place|travel/i.test(textOf(record)));
  const locationTopic = locationRecords.length ? "place-linked productivity" : "memory-linked productivity";
  const hourLabel = bestHour ? `${String(bestHour[0]).padStart(2, "0")}:00-${String((Number(bestHour[0]) + 2) % 24).padStart(2, "0")}:00` : "not enough evidence";
  const confidence = confidenceFromEvidence(productive.length, new Set(productive.map((item) => dayKey(timestampOf(item)))).size, bestHour?.[1]?.length || 0);
  return [
    buildPrediction({
      userId,
      type: "productivity",
      title: `Next focus opportunity: ${hourLabel}`,
      summary: `${hourLabel} is your strongest observed productivity window from ${productive.length} productive signals.`,
      score: clamp(45 + (bestHour?.[1]?.length || 0) * 13 + productive.length * 3),
      confidence,
      riskLevel: "Low",
      evidence: (bestHour?.[1] || productive).slice(0, 8).map((item) => evidenceItem(item, "productive timing signal")),
      reasoning: `${bestHour?.[1]?.length || 0} productive records cluster around this hour; strongest day is ${bestDay?.[0] || "not established"}.`,
      recommendation: "Use this window for one demanding task and save a progress note after.",
      horizon: "next matching time window",
      metadata: { bestHour: bestHour?.[0], bestDay: bestDay?.[0], locationTopic },
    }),
  ].filter(Boolean);
}

function buildRelationshipPredictions({ userId, relationships }) {
  const people = relationships?.relationships || [];
  if (!people.length) return [];
  return people
    .filter((person) => Number(person.interactionCount || 0) >= 2)
    .map((person) => {
      const daysSilent = ageInDays(person.lastSeen);
      const strength = Number(person.relationshipStrength || 0);
      const reconnect = Number(person.reconnectScore || 0);
      const fadingRisk = clamp(reconnect + Math.max(0, daysSilent - 21) * 1.4 + (strength >= 60 ? 10 : 0));
      const growing = daysSilent <= 14 && strength >= 50;
      return buildPrediction({
        userId,
        type: "relationship",
        title: growing ? `${person.personName} relationship is growing` : `${person.personName} relationship needs attention`,
        summary: growing
          ? `${person.personName} has recent repeated relationship signals with ${strength}% strength.`
          : `${person.personName} has ${daysSilent} days of silence and ${fadingRisk}% fading risk.`,
        score: growing ? strength : fadingRisk,
        confidence: confidenceFromEvidence(person.interactionCount, Math.max(1, 90 - daysSilent), Math.abs(reconnect)),
        riskLevel: growing ? "Low" : riskLabel(fadingRisk),
        evidence: (relationships.events || [])
          .filter((event) => event.personName === person.personName)
          .slice(0, 8)
          .map((event) => evidenceItem(event, "relationship event")),
        reasoning: `${person.interactionCount} interaction signals, ${strength}% relationship strength, last seen ${daysSilent} days ago.`,
        recommendation: growing ? "Keep the connection active with a real follow-up." : "Reconnect within 14 days if this relationship still matters.",
        metadata: { personName: person.personName, interactionTrend: growing ? "growing" : "fading-risk", daysSilent, fadingRisk, strength },
      });
    })
    .filter(Boolean)
    .sort((a, b) => b.predictionScore - a.predictionScore)
    .slice(0, 10);
}

function buildMoodPredictions({ userId, records, relationships }) {
  const emotional = records.filter((record) => POSITIVE_WORDS.test(textOf(record)) || STRESS_WORDS.test(textOf(record)) || /mood|feel|felt|emotion|journal/i.test(textOf(record)));
  if (emotional.length < 3) return [];
  const recent = emotional.filter((record) => ageInDays(timestampOf(record)) <= 14);
  const positive = recent.filter((record) => POSITIVE_WORDS.test(textOf(record))).length;
  const stress = recent.filter((record) => STRESS_WORDS.test(textOf(record))).length;
  const relationshipStress = (relationships?.relationships || []).reduce((sum, person) => sum + Number(person.emotionalImpact?.stress || 0), 0);
  const moodScore = clamp(50 + positive * 9 - stress * 10 - relationshipStress * 2);
  const stressTrend = clamp(stress * 14 + relationshipStress * 3);
  return [
    buildPrediction({
      userId,
      type: "mood",
      title: moodScore >= 60 ? "Mood trend is improving" : "Mood stability needs attention",
      summary: `${moodScore}% emotional stability based on ${emotional.length} emotional memory signals.`,
      score: moodScore,
      confidence: confidenceFromEvidence(emotional.length, new Set(emotional.map((item) => dayKey(timestampOf(item)))).size, Math.abs(positive - stress) * 12),
      riskLevel: riskLabel(stressTrend),
      evidence: emotional.slice(0, 8).map((item) => evidenceItem(item, "emotional signal")),
      reasoning: `${positive} positive recent signals and ${stress} stress signals in the recent emotional evidence set.`,
      recommendation: stressTrend >= 58 ? "Add recovery activity and avoid stacking high-pressure sessions without breaks." : "Keep capturing mood-linked memories to improve the forecast.",
      metadata: { moodScore, stressTrend, positiveRecentSignals: positive, stressRecentSignals: stress },
    }),
  ].filter(Boolean);
}

function buildBurnoutPredictions({ userId, records, goals }) {
  const active = records.filter((record) => PRODUCTIVITY_WORDS.test(textOf(record)));
  const stress = records.filter((record) => STRESS_WORDS.test(textOf(record)));
  const recovery = records.filter((record) => RECOVERY_WORDS.test(textOf(record)));
  const recentActive = active.filter((record) => ageInDays(timestampOf(record)) <= 14);
  const recentStress = stress.filter((record) => ageInDays(timestampOf(record)) <= 14);
  const recentRecovery = recovery.filter((record) => ageInDays(timestampOf(record)) <= 14);
  if (recentActive.length + recentStress.length < 4) return [];
  const goalPressure = (goals || []).filter((goal) => goal.status !== "completed").length * 5;
  const burnoutRisk = clamp(recentActive.length * 8 + recentStress.length * 14 + goalPressure - recentRecovery.length * 9);
  const evidence = [...recentStress, ...recentActive, ...recentRecovery].slice(0, 10);
  return [
    buildPrediction({
      userId,
      type: "burnout",
      title: `Burnout risk: ${riskLabel(burnoutRisk)}`,
      summary: `${burnoutRisk}% burnout risk from workload, stress, goals, and recovery signals.`,
      score: burnoutRisk,
      confidence: confidenceFromEvidence(evidence.length, new Set(evidence.map((item) => dayKey(timestampOf(item)))).size, recentStress.length * 18),
      riskLevel: riskLabel(burnoutRisk),
      evidence: evidence.map((item) => evidenceItem(item, PRODUCTIVITY_WORDS.test(textOf(item)) ? "workload signal" : "stress/recovery signal")),
      reasoning: `${recentActive.length} recent activity signals, ${recentStress.length} stress signals, ${recentRecovery.length} recovery signals, ${(goals || []).filter((goal) => goal.status !== "completed").length} active goals.`,
      recommendation: burnoutRisk >= 68 ? "Reduce scope for 24 hours and add recovery before another deep work block." : "Maintain recovery signals while continuing focused work.",
      horizon: "next 7 days",
      metadata: { burnoutRisk, recentActive: recentActive.length, recentStress: recentStress.length, recentRecovery: recentRecovery.length },
    }),
  ].filter(Boolean);
}

function buildLearningPredictions({ userId, records, learningProfile }) {
  const predictions = [];
  for (const [topic, pattern] of TOPIC_PATTERNS) {
    const related = records.filter((record) => recordTextMatches(record, pattern));
    if (related.length < 3) continue;
    const { recent, previous } = splitRecentPrevious(related, 14);
    const trend = trendPercent(recent.length, previous.length);
    const score = clamp(45 + recent.length * 10 + Math.max(0, trend) * 0.35);
    predictions.push(buildPrediction({
      userId,
      type: "learning",
      title: `${topic} interest ${trend >= 20 ? "is growing" : trend <= -20 ? "is cooling" : "is stable"}`,
      summary: `${topic} has ${trend >= 0 ? "+" : ""}${trend}% recent trend from ${related.length} evidence signals.`,
      score,
      confidence: confidenceFromEvidence(related.length, new Set(related.map((item) => dayKey(timestampOf(item)))).size, Math.abs(trend)),
      riskLevel: trend <= -35 ? "Moderate" : "Low",
      evidence: related.slice(0, 8).map((item) => evidenceItem(item, `${topic} learning/interest signal`)),
      reasoning: `${recent.length} recent ${topic} signals vs ${previous.length} older signals.`,
      recommendation: trend >= 20 ? `Keep investing in ${topic}; it is gaining evidence-backed momentum.` : `Capture one concrete ${topic} output to test whether the interest is still alive.`,
      metadata: { topic, trend, learningProfileTopicScore: learningProfile?.topics?.[topic] || null },
    }));
  }
  return predictions.filter(Boolean).sort((a, b) => b.predictionScore - a.predictionScore).slice(0, 10);
}

function buildOpportunityPredictions({ userId, records, goals, learningPredictions }) {
  const opportunities = [];
  const strongLearning = (learningPredictions || []).filter((prediction) => prediction.predictionScore >= 65);
  for (const prediction of strongLearning.slice(0, 5)) {
    const topic = prediction.metadata?.topic || prediction.title.split(" ")[0];
    const matchingGoals = (goals || []).filter((goal) => textOf(goal).toLowerCase().includes(String(topic).toLowerCase()));
    const related = records.filter((record) => textOf(record).toLowerCase().includes(String(topic).toLowerCase()));
    if (related.length < 3) continue;
    opportunities.push(buildPrediction({
      userId,
      type: "opportunity",
      title: `${topic} is an evidence-backed opportunity`,
      summary: `${topic} combines repeated activity with ${matchingGoals.length} matching goal${matchingGoals.length === 1 ? "" : "s"}.`,
      score: clamp(prediction.predictionScore + matchingGoals.length * 8),
      confidence: prediction.confidence,
      riskLevel: "Low",
      evidence: related.slice(0, 8).map((item) => evidenceItem(item, `${topic} opportunity signal`)),
      reasoning: `${related.length} ${topic} signals and ${matchingGoals.length} related declared goals.`,
      recommendation: `Create a concrete ${topic} mission for the next 7 days.`,
      metadata: { topic, relatedGoalCount: matchingGoals.length },
    }));
  }
  return opportunities.filter(Boolean).sort((a, b) => b.predictionScore - a.predictionScore);
}

function evaluatePredictionAccuracy(previousPredictions = [], records = []) {
  const settled = [];
  const now = Date.now();
  for (const prediction of previousPredictions || []) {
    const validUntil = new Date(prediction.validUntil || prediction.generatedAt || 0).getTime();
    if (!Number.isFinite(validUntil) || validUntil > now) continue;
    const topic = prediction.metadata?.topic || prediction.metadata?.habit || prediction.metadata?.goalTitle || prediction.metadata?.personName || "";
    if (!topic) continue;
    const evidenceAfter = records.filter((record) => {
      const ts = new Date(timestampOf(record)).getTime();
      return ts >= new Date(prediction.generatedAt || 0).getTime() && textOf(record).toLowerCase().includes(String(topic).toLowerCase());
    });
    if (!evidenceAfter.length) continue;
    settled.push({
      id: `prediction_history_${stableId(prediction.id, "outcome")}`,
      userId: prediction.userId,
      predictionId: prediction.id,
      predictionType: prediction.type,
      outcome: evidenceAfter.length >= 1 ? "supported" : "not-supported",
      success: evidenceAfter.length >= 1,
      evidence: evidenceAfter.slice(0, 5).map((item) => evidenceItem(item, "outcome evidence")),
      evaluatedAt: nowIso(),
      confidence: prediction.confidence,
    });
  }
  const successCount = settled.filter((item) => item.success).length;
  return {
    history: settled,
    accuracy: settled.length ? clamp((successCount / settled.length) * 100) : 0,
    evaluatedCount: settled.length,
    reliability: settled.length >= 5 ? "calibrating" : "insufficient history",
  };
}

function buildModels(userId, predictions) {
  const byType = groupBy(predictions, (prediction) => prediction.type);
  return [...byType.entries()].map(([type, rows]) => ({
    id: `prediction_model_${stableId(userId, type)}`,
    userId,
    modelType: type,
    evidenceCount: rows.reduce((sum, row) => sum + row.evidenceCount, 0),
    predictionCount: rows.length,
    averageConfidence: clamp(rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length),
    averageScore: clamp(rows.reduce((sum, row) => sum + row.predictionScore, 0) / rows.length),
    updatedAt: nowIso(),
  }));
}

function buildOverview(predictions, accuracy) {
  const active = predictions.length;
  const highRisk = predictions.filter((prediction) => ["High", "Critical"].includes(prediction.riskLevel)).length;
  const averageConfidence = active ? clamp(predictions.reduce((sum, prediction) => sum + prediction.confidence, 0) / active) : 0;
  const topOpportunity = predictions.find((prediction) => prediction.type === "opportunity") || null;
  const nextFocus = predictions.find((prediction) => prediction.type === "productivity") || null;
  return {
    activePredictions: active,
    highRiskPredictions: highRisk,
    averageConfidence,
    predictionAccuracy: accuracy.accuracy,
    reliability: accuracy.reliability,
    topOpportunity: topOpportunity?.title || "",
    nextFocusWindow: nextFocus?.title || "",
  };
}

export function buildFuturePredictionEngine({
  userId,
  memories = [],
  records = [],
  chats = [],
  places = [],
  goals = [],
  relationshipIntelligence = null,
  learningProfile = null,
  previousPredictions = [],
} = {}) {
  const allRecords = normalizeRecords({ memories, records, chats, places });
  if (!userId || (!allRecords.length && !goals.length && !(relationshipIntelligence?.relationships || []).length)) {
    return {
      version: "NeuroNest Future Prediction Engine v1",
      userId,
      generatedAt: nowIso(),
      overview: buildOverview([], { accuracy: 0, reliability: "insufficient history" }),
      predictions: [],
      byType: {},
      models: [],
      history: [],
      accuracy: { accuracy: 0, evaluatedCount: 0, reliability: "insufficient history" },
      evidencePolicy: "No predictions are generated without real user evidence.",
    };
  }

  const goal = buildGoalPredictions({ userId, records: allRecords, goals });
  const habit = buildHabitPredictions({ userId, records: allRecords });
  const productivity = buildProductivityPredictions({ userId, records: allRecords });
  const relationship = buildRelationshipPredictions({ userId, relationships: relationshipIntelligence });
  const mood = buildMoodPredictions({ userId, records: allRecords, relationships: relationshipIntelligence });
  const burnout = buildBurnoutPredictions({ userId, records: allRecords, goals });
  const learning = buildLearningPredictions({ userId, records: allRecords, learningProfile });
  const opportunity = buildOpportunityPredictions({ userId, records: allRecords, goals, learningPredictions: learning });
  const predictions = [...goal, ...habit, ...productivity, ...relationship, ...mood, ...burnout, ...learning, ...opportunity]
    .filter(Boolean)
    .filter((prediction) => prediction.evidenceCount > 0 && prediction.confidence > 0)
    .sort((a, b) => b.confidence + b.predictionScore - (a.confidence + a.predictionScore));
  const accuracy = evaluatePredictionAccuracy(previousPredictions, allRecords);
  const byType = {
    goals: goal,
    habits: habit,
    productivity,
    relationships: relationship,
    mood,
    burnout,
    learning,
    opportunities: opportunity,
  };
  return {
    version: "NeuroNest Future Prediction Engine v1",
    userId,
    generatedAt: nowIso(),
    overview: buildOverview(predictions, accuracy),
    predictions,
    byType,
    models: buildModels(userId, predictions),
    history: accuracy.history,
    accuracy,
    evidencePolicy: "Every prediction includes real evidence from memories, chats, goals, places, relationships, or timeline activity.",
  };
}

export function answerPredictionQuery(query = "", snapshot = {}) {
  const text = String(query || "").toLowerCase();
  if (!/\b(predict|prediction|likely|future|next week|next|focus on|burnout|habit|goal.*succeed|relationship.*fad|mood|stress|opportunity|complete|abandon)\b/i.test(text)) {
    return { matched: false };
  }
  const predictions = snapshot.predictions || [];
  if (!predictions.length) {
    return {
      matched: true,
      confidence: 0,
      answer: "I do not have enough real evidence to make a prediction yet. Add memories, goals, voice notes, screenshots, or relationship signals first.",
      evidence: [],
    };
  }
  let filtered = predictions;
  if (/goal|complete|succeed|abandon/.test(text)) filtered = predictions.filter((item) => item.type === "goal");
  else if (/habit|forming|continu/.test(text)) filtered = predictions.filter((item) => item.type === "habit");
  else if (/relationship|friend|fading|reconnect/.test(text)) filtered = predictions.filter((item) => item.type === "relationship");
  else if (/burnout|stress|pressure/.test(text)) filtered = predictions.filter((item) => item.type === "burnout" || item.type === "mood");
  else if (/focus|productive|productivity/.test(text)) filtered = predictions.filter((item) => item.type === "productivity");
  else if (/opportunity|should.*focus|worth/.test(text)) filtered = predictions.filter((item) => item.type === "opportunity" || item.type === "learning");
  const best = (filtered.length ? filtered : predictions)[0];
  return {
    matched: true,
    confidence: best.confidence,
    answer: `${best.title}: ${best.summary} Confidence ${best.confidence}%. Evidence: ${best.evidenceCount} real signal${best.evidenceCount === 1 ? "" : "s"}. Reasoning: ${best.reasoning}`,
    evidence: best.evidence,
    prediction: best,
  };
}
