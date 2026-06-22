import crypto from "node:crypto";

const SUCCESS_WORDS = /\b(success|successful|worked|working|completed|finished|shipped|launched|grew|won|improved|good|great|best|positive|achieved|solved|built)\b/i;
const FAILURE_WORDS = /\b(failed|failure|bad|blocked|stuck|abandoned|quit|stopped|missed|delayed|problem|issue|wrong|regret|loss|lost|didn't work|not working)\b/i;
const EMOTIONAL_WORDS = /\b(freedom|happy|happiness|fear|stress|angry|sad|excited|love|passion|pressure|anxious|dream|heart|feel|felt)\b/i;
const LOGICAL_WORDS = /\b(data|logic|reason|because|roi|money|business|users|market|evidence|plan|strategy|research|compare|cost|benefit|metrics)\b/i;
const RUSHED_WORDS = /\b(rushed|quickly|suddenly|instant|immediately|without thinking|impulse|urgent|panic|last minute)\b/i;
const CAREFUL_WORDS = /\b(after research|researched|planned|compared|thought|tested|experiment|reviewed|validated|slowly|carefully)\b/i;

const TOPIC_PATTERNS = [
  ["Startup", /\b(startup|saas|founder|business|launch|mvp|customer|pricing|neuronest)\b/i],
  ["Coding", /\b(code|coding|github|render|api|backend|frontend|database|bug|deploy|app|website)\b/i],
  ["Fitness", /\b(gym|workout|fitness|health|diet|run|training|weight)\b/i],
  ["Study", /\b(study|learn|course|book|exam|college|school|practice)\b/i],
  ["Relationship", /\b(friend|family|alex|sarah|relationship|partner|team|mentor|client)\b/i],
  ["Money", /\b(money|cost|price|pricing|buy|bought|invest|investment|revenue|profit)\b/i],
  ["Lifestyle", /\b(routine|habit|sleep|travel|move|city|life|career)\b/i],
];

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function nowIso() {
  return new Date().toISOString();
}

function snippet(value, max = 180) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
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

function textOf(item = {}) {
  const metadata = item.metadata || {};
  return [
    item.decision,
    item.reason,
    item.expectedOutcome,
    item.actualOutcome,
    item.title,
    item.content,
    item.body,
    item.summary,
    item.description,
    item.meta,
    item.category,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags,
    metadata.ocrText,
    metadata.voiceTranscript,
    metadata.transcript,
    metadata.aiSummary,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function timestampOf(item = {}) {
  return item.decidedAt || item.createdAt || item.timestamp || item.updatedAt || nowIso();
}

function evidenceItem(item = {}, reason = "decision evidence") {
  return {
    id: String(item.id || item.entryId || item.memoryId || stableId(item.decision || item.title, timestampOf(item))),
    type: String(item.type || item.kind || item.sourceType || "decision"),
    title: snippet(item.decision || item.title || item.content || item.body || "Decision evidence", 120),
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

function detectOutcomeStatus(actualOutcome = "", explicitStatus = "") {
  const status = String(explicitStatus || "").toLowerCase();
  const text = String(actualOutcome || "");
  if (["success", "successful", "completed", "positive"].includes(status) || SUCCESS_WORDS.test(text)) return "success";
  if (["failure", "failed", "abandoned", "negative"].includes(status) || FAILURE_WORDS.test(text)) return "failure";
  if (text.trim()) return "mixed";
  return "open";
}

function detectDecisionSpeed(decision = {}) {
  const explicit = String(decision.decisionSpeed || decision.speed || decision.metadata?.decisionSpeed || "").toLowerCase();
  if (["rushed", "fast", "quick"].includes(explicit)) return "rushed";
  if (["slow", "careful", "considered"].includes(explicit)) return "considered";
  const text = textOf(decision);
  if (RUSHED_WORDS.test(text)) return "rushed";
  if (CAREFUL_WORDS.test(text)) return "considered";
  return "measured";
}

function detectDecisionStyle(decision = {}) {
  const text = textOf(decision);
  const speed = detectDecisionSpeed(decision);
  const emotional = EMOTIONAL_WORDS.test(text);
  const logical = LOGICAL_WORDS.test(text);
  if (speed === "rushed") return "rushed";
  if (emotional && !logical) return "emotional";
  if (logical && !emotional) return "logical";
  if (logical && emotional) return "balanced";
  return "unclear";
}

function detectTopics(decision = {}) {
  const text = textOf(decision);
  return TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

function qualityScore(decision = {}) {
  const outcomeStatus = detectOutcomeStatus(decision.actualOutcome, decision.outcomeStatus);
  const style = detectDecisionStyle(decision);
  let score = outcomeStatus === "success" ? 78 : outcomeStatus === "failure" ? 30 : outcomeStatus === "mixed" ? 55 : 44;
  if (decision.reason) score += 7;
  if (decision.expectedOutcome) score += 7;
  if (decision.actualOutcome) score += 8;
  if (style === "logical" || style === "balanced") score += 6;
  if (style === "rushed") score -= 12;
  return clamp(score, 1, 100);
}

function confidenceFromEvidence(count, hasOutcome = false) {
  if (!count) return 0;
  return clamp(38 + count * 9 + (hasOutcome ? 18 : 0), 40, 96);
}

function relatedEvidenceFor(decision, records = [], goals = []) {
  const text = textOf(decision).toLowerCase();
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]+/g, ""))
    .filter((word) => word.length > 4)
    .slice(0, 20);
  const relatedRecords = records
    .filter((record) => {
      const recordText = textOf(record).toLowerCase();
      return words.some((word) => recordText.includes(word));
    })
    .slice(0, 5)
    .map((record) => evidenceItem(record, "related memory context"));
  const relatedGoals = goals
    .filter((goal) => {
      const goalText = textOf(goal).toLowerCase();
      return words.some((word) => goalText.includes(word));
    })
    .slice(0, 3)
    .map((goal) => evidenceItem({ ...goal, type: "goal", timestamp: goal.updatedAt || goal.createdAt }, "related goal context"));
  return uniqueBy([...relatedRecords, ...relatedGoals], (item) => item.id, 8);
}

export function normalizeDecisionInput(data = {}, existing = null) {
  const decision = snippet(data.decision || data.title || existing?.decision || "", 160);
  if (!decision) throw new Error("Decision is required.");
  const now = nowIso();
  const actualOutcome = snippet(data.actualOutcome ?? existing?.actualOutcome ?? "", 240);
  const outcomeStatus = detectOutcomeStatus(actualOutcome, data.outcomeStatus || existing?.outcomeStatus || "");
  return {
    id: existing?.id || data.id || crypto.randomUUID(),
    userId: existing?.userId || data.userId || "",
    decision,
    reason: snippet(data.reason ?? existing?.reason ?? "", 240),
    expectedOutcome: snippet(data.expectedOutcome ?? existing?.expectedOutcome ?? "", 240),
    actualOutcome,
    outcomeStatus,
    decisionSpeed: detectDecisionSpeed({ ...existing, ...data, actualOutcome }),
    tags: Array.isArray(data.tags)
      ? data.tags.slice(0, 8)
      : String(data.tags || existing?.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 8),
    metadata: { ...(existing?.metadata || {}), ...(data.metadata || {}) },
    decidedAt: data.decidedAt && !Number.isNaN(new Date(data.decidedAt).getTime())
      ? new Date(data.decidedAt).toISOString()
      : existing?.decidedAt || now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    outcomeUpdatedAt: actualOutcome && actualOutcome !== existing?.actualOutcome ? now : existing?.outcomeUpdatedAt || null,
  };
}

function analyzeDecision(decision, records = [], goals = []) {
  const related = relatedEvidenceFor(decision, records, goals);
  const evidence = uniqueBy([evidenceItem(decision, "explicit decision record"), ...related], (item) => `${item.id}_${item.reason}`, 10);
  const style = detectDecisionStyle(decision);
  const status = detectOutcomeStatus(decision.actualOutcome, decision.outcomeStatus);
  const score = qualityScore(decision);
  return {
    ...decision,
    topics: detectTopics(decision),
    decisionStyle: style,
    decisionSpeed: detectDecisionSpeed(decision),
    outcomeStatus: status,
    qualityScore: score,
    success: status === "success",
    failure: status === "failure",
    confidence: confidenceFromEvidence(evidence.length, status !== "open"),
    evidence,
  };
}

function buildPatterns(decisions = []) {
  const patternDefs = [
    ["emotional decisions", (item) => item.decisionStyle === "emotional"],
    ["logical decisions", (item) => item.decisionStyle === "logical"],
    ["balanced decisions", (item) => item.decisionStyle === "balanced"],
    ["rushed decisions", (item) => item.decisionStyle === "rushed" || item.decisionSpeed === "rushed"],
    ["successful decisions", (item) => item.outcomeStatus === "success"],
    ["failed decisions", (item) => item.outcomeStatus === "failure"],
  ];
  return patternDefs
    .map(([label, predicate]) => {
      const matches = decisions.filter(predicate);
      if (!matches.length) return null;
      return {
        id: `decision-pattern-${stableId(label)}`,
        title: label.charAt(0).toUpperCase() + label.slice(1),
        body: `${matches.length} decision${matches.length === 1 ? "" : "s"} match this pattern.`,
        count: matches.length,
        averageQuality: clamp(matches.reduce((sum, item) => sum + item.qualityScore, 0) / matches.length),
        confidence: confidenceFromEvidence(matches.flatMap((item) => item.evidence).length, matches.some((item) => item.outcomeStatus !== "open")),
        evidence: matches.flatMap((item) => item.evidence).slice(0, 8),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.count - a.count || b.averageQuality - a.averageQuality);
}

function buildInsights(decisions = [], patterns = []) {
  if (!decisions.length) return [];
  const completed = decisions.filter((item) => item.outcomeStatus !== "open");
  const successes = decisions.filter((item) => item.outcomeStatus === "success");
  const failures = decisions.filter((item) => item.outcomeStatus === "failure");
  const best = [...successes].sort((a, b) => b.qualityScore - a.qualityScore || b.confidence - a.confidence)[0];
  const riskyPattern = patterns.find((pattern) => /rushed|failed/i.test(pattern.title));
  const dominant = patterns[0];
  return [
    best
      ? {
          id: "biggest-successful-decision",
          title: "Biggest successful decision",
          body: `${best.decision} has the strongest successful outcome evidence.`,
          confidence: best.confidence,
          evidence: best.evidence,
        }
      : null,
    riskyPattern
      ? {
          id: "repeated-decision-risk",
          title: "Repeated decision risk",
          body: `${riskyPattern.title} appear repeatedly and average ${riskyPattern.averageQuality}% quality.`,
          confidence: riskyPattern.confidence,
          evidence: riskyPattern.evidence,
        }
      : null,
    dominant
      ? {
          id: "decision-style",
          title: "How you make decisions",
          body: `${dominant.title} is your strongest current decision pattern from stored evidence.`,
          confidence: dominant.confidence,
          evidence: dominant.evidence,
        }
      : null,
    completed.length
      ? {
          id: "decision-success-rate",
          title: "Decision outcome rate",
          body: `${successes.length} successful and ${failures.length} failed decision outcomes are recorded.`,
          confidence: confidenceFromEvidence(completed.flatMap((item) => item.evidence).length, true),
          evidence: completed.flatMap((item) => item.evidence).slice(0, 8),
        }
      : null,
  ].filter(Boolean);
}

export function buildDecisionIntelligence({ userId = "", decisions = [], memories = [], records = [], chats = [], goals = [] } = {}) {
  const sourceRecords = [
    ...memories.map((item) => ({ ...item, sourceType: "memory" })),
    ...records.map((item) => ({ ...item, sourceType: "record" })),
    ...chats.map((item) => ({ ...item, title: item.role === "user" ? "User conversation" : "Assistant conversation", body: item.content || "", sourceType: "chat" })),
  ];
  const analyzed = decisions
    .map((decision) => analyzeDecision(decision, sourceRecords, goals))
    .sort((a, b) => asDate(b.updatedAt || b.decidedAt) - asDate(a.updatedAt || a.decidedAt));
  const completed = analyzed.filter((item) => item.outcomeStatus !== "open");
  const successes = analyzed.filter((item) => item.outcomeStatus === "success");
  const failures = analyzed.filter((item) => item.outcomeStatus === "failure");
  const patterns = buildPatterns(analyzed);
  const insights = buildInsights(analyzed, patterns);
  const averageQuality = analyzed.length
    ? clamp(analyzed.reduce((sum, item) => sum + item.qualityScore, 0) / analyzed.length)
    : 0;
  const averageSpeed = analyzed.length
    ? clamp(analyzed.reduce((sum, item) => sum + (item.decisionSpeed === "rushed" ? 35 : item.decisionSpeed === "considered" ? 85 : 62), 0) / analyzed.length)
    : 0;

  return {
    version: "NeuroNest Decision Intelligence v1",
    generatedAt: nowIso(),
    userId,
    empty: analyzed.length === 0,
    overview: {
      totalDecisions: analyzed.length,
      completedDecisions: completed.length,
      successfulDecisions: successes.length,
      failedDecisions: failures.length,
      openDecisions: analyzed.length - completed.length,
      decisionQuality: averageQuality,
      decisionSpeed: averageSpeed,
      successRate: completed.length ? clamp((successes.length / completed.length) * 100) : 0,
      failureRate: completed.length ? clamp((failures.length / completed.length) * 100) : 0,
      patternCount: patterns.length,
      evidenceCount: analyzed.reduce((sum, item) => sum + item.evidence.length, 0),
    },
    decisions: analyzed,
    patterns,
    insights,
    digitalTwinFeed: {
      decisionStyle: patterns[0]?.title || "Not learned",
      decisionQuality: averageQuality,
      decisionSpeed: averageSpeed,
      successRate: completed.length ? clamp((successes.length / completed.length) * 100) : 0,
      failureRate: completed.length ? clamp((failures.length / completed.length) * 100) : 0,
      strongestPattern: patterns[0] || null,
      biggestSuccessfulDecision: insights.find((item) => item.id === "biggest-successful-decision") || null,
      repeatedMistakePattern: insights.find((item) => item.id === "repeated-decision-risk") || null,
    },
    evidencePolicy: "Decision Intelligence uses explicit stored decisions plus related user-owned memory, goal, chat, and timeline evidence. It does not fabricate outcomes.",
  };
}

export function answerDecisionQuery(query = "", intelligence = {}) {
  const text = String(query || "").toLowerCase();
  if (!/\b(decision|decisions|mistakes|mistake|successful decision|changed my life|how do i make decisions|repeat|biggest successful)\b/i.test(text)) {
    return { matched: false, confidence: 0, answer: "", evidence: [] };
  }
  if (intelligence.empty || !intelligence.decisions?.length) {
    return {
      matched: true,
      confidence: 0,
      answer: "Decision Intelligence has no explicit stored decisions yet. Add a decision with reason, expected outcome, and actual outcome first.",
      evidence: [],
    };
  }

  const best = intelligence.insights?.find((item) => item.id === "biggest-successful-decision");
  const mistakes = intelligence.insights?.find((item) => item.id === "repeated-decision-risk");
  const style = intelligence.insights?.find((item) => item.id === "decision-style");
  if (/biggest successful|successful decision/.test(text) && best) {
    return { matched: true, confidence: best.confidence, answer: `${best.body} Confidence: ${best.confidence}%.`, evidence: best.evidence };
  }
  if (/mistakes|mistake|repeat/.test(text) && mistakes) {
    return { matched: true, confidence: mistakes.confidence, answer: `${mistakes.body} Confidence: ${mistakes.confidence}%.`, evidence: mistakes.evidence };
  }
  if (/how do i make decisions|decision style|make decisions/.test(text) && style) {
    return { matched: true, confidence: style.confidence, answer: `${style.body} Confidence: ${style.confidence}%.`, evidence: style.evidence };
  }
  if (/changed my life|life most|most impact/.test(text)) {
    const candidate = [...intelligence.decisions].sort((a, b) => b.qualityScore + b.evidence.length * 3 - (a.qualityScore + a.evidence.length * 3))[0];
    return {
      matched: true,
      confidence: candidate.confidence,
      answer: `${candidate.decision} currently has the strongest impact signal because it has ${candidate.evidence.length} evidence link${candidate.evidence.length === 1 ? "" : "s"} and ${candidate.qualityScore}% quality.`,
      evidence: candidate.evidence,
    };
  }

  const overview = intelligence.overview || {};
  return {
    matched: true,
    confidence: clamp(45 + (overview.evidenceCount || 0) * 4),
    answer: `You have ${overview.totalDecisions || 0} stored decisions, ${overview.successRate || 0}% success rate, ${overview.failureRate || 0}% failure rate, and ${overview.decisionQuality || 0}% average decision quality.`,
    evidence: intelligence.decisions.flatMap((item) => item.evidence).slice(0, 8),
  };
}
