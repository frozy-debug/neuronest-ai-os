import { inferEmotions, splitTags, summarizeText } from "./unifiedMemoryService.js";

const TOPIC_RULES = [
  ["startup", /startup|business|pricing|launch|founder|market|customer|revenue|saas/i],
  ["ai", /\bai\b|openai|agent|prompt|model|automation|assistant|neural/i],
  ["coding", /code|github|render|deploy|bug|api|database|frontend|backend|server/i],
  ["study", /study|learn|course|notes|exam|research|paper|tutorial/i],
  ["design", /ui|ux|design|figma|layout|brand|logo|interface|animation/i],
  ["fitness", /gym|workout|run|fitness|health|training|protein/i],
  ["travel", /travel|trip|hotel|airport|route|map|journey|place/i],
  ["social", /chat|message|whatsapp|instagram|friend|call|dm/i],
  ["focus", /focus|deep work|productive|session|task|deadline|planning/i],
];

const INTENT_RULES = [
  ["idea-burst", /idea|startup|build|what if|concept|brainstorm|inspired/i],
  ["research", /research|compare|find|learn|article|paper|documentation|youtube/i],
  ["execution", /fix|build|ship|deploy|code|implement|finish|task/i],
  ["reflection", /feel|felt|mood|happy|sad|stress|journal|reflection/i],
  ["planning", /plan|todo|schedule|remind|deadline|checklist|goal/i],
  ["capture", /copy|screenshot|saved|note|snippet|quote/i],
];

function scoreByRules(text, rules, weights = {}) {
  return rules.reduce((score, [label, pattern]) => score + (pattern.test(text) ? weights[label] || 12 : 0), 0);
}

export function detectTopics(text) {
  const clean = String(text || "");
  return TOPIC_RULES.filter(([, pattern]) => pattern.test(clean)).map(([topic]) => topic);
}

export function classifyIntent(text, fallback = "capture") {
  const clean = String(text || "");
  return INTENT_RULES.find(([, pattern]) => pattern.test(clean))?.[0] || fallback;
}

export function scoreEmotion(text) {
  const clean = String(text || "").toLowerCase();
  if (/happy|love|excited|inspired|proud|great|win|beautiful/.test(clean)) return 88;
  if (/stress|sad|angry|tired|burnout|blocked|anxious|doom/.test(clean)) return 42;
  if (/calm|clear|steady|peace|quiet/.test(clean)) return 78;
  return 68;
}

export function scoreProductivityText(text, event = {}) {
  const clean = String(text || "").toLowerCase();
  const base = event.durationMs ? Math.min(28, Math.round(event.durationMs / 120000)) : 0;
  const focus = scoreByRules(clean, [["focus", /focus|deep work|productive|task|code|study|build|deploy/i]]);
  const distraction = /shorts|reels|scroll|doom|random|distract/i.test(clean) ? -22 : 0;
  return Math.max(12, Math.min(98, 56 + base + focus + distraction));
}

export function scoreFocusText(text, event = {}) {
  const clean = String(text || "").toLowerCase();
  const durationBoost = event.durationMs ? Math.min(32, Math.round(event.durationMs / 180000)) : 0;
  const focusBoost = /focus|deep work|coding|study|writing|planning|research/.test(clean) ? 22 : 0;
  const distractionPenalty = /social|scroll|reels|shorts|gaming|distract/.test(clean) ? -20 : 0;
  return Math.max(8, Math.min(98, 50 + durationBoost + focusBoost + distractionPenalty));
}

export function analyzeActivityEvent(event = {}, memories = []) {
  const source = String(event.source || "web").slice(0, 40);
  const type = String(event.type || "activity").slice(0, 48);
  const rawText = String(event.text || event.content || event.query || event.title || "").replace(/\s+/g, " ").trim();
  const context = String(event.context || event.url || event.view || "").replace(/\s+/g, " ").trim();
  const fullText = `${type} ${source} ${rawText} ${context}`.trim();
  const topics = detectTopics(fullText);
  const intent = classifyIntent(fullText, type === "focus-session" ? "execution" : "capture");
  const emotions = inferEmotions(fullText);
  const emotionalScore = scoreEmotion(fullText);
  const productivityScore = scoreProductivityText(fullText, event);
  const focusScore = scoreFocusText(fullText, event);
  const lengthScore = Math.min(22, Math.round(rawText.length / 24));
  const repeatBoost = memories.filter((memory) => {
    const haystack = `${memory.title} ${memory.content} ${memory.summary} ${memory.tags?.join(" ")}`.toLowerCase();
    return topics.some((topic) => haystack.includes(topic));
  }).length;
  const importanceScore = Math.max(15, Math.min(99, Math.round((productivityScore + focusScore + emotionalScore) / 3 + lengthScore + Math.min(16, repeatBoost * 2))));
  const confidence = Math.max(22, Math.min(98, 42 + topics.length * 9 + lengthScore + (event.durationMs ? 18 : 0)));
  const shouldCapture =
    event.force === true ||
    type === "focus-session" ||
    type === "voice-snippet" ||
    type === "screenshot" ||
    rawText.length >= 42 ||
    (topics.length >= 2 && confidence >= 58);

  const readableType = type
    .split(/[-_\s]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");

  return {
    id: event.id || `cap_${Date.now()}`,
    source,
    type,
    intent,
    title: summarizeText(event.title || `${readableType || "Activity"} detected`, 90),
    summary: summarizeText(rawText || context || "Passive NeuroNest activity signal detected.", 320),
    context: summarizeText(context, 220),
    topics,
    tags: [...new Set(["auto-capture", source, type, intent, ...topics, ...splitTags(event.tags)])].slice(0, 12),
    emotions,
    emotionalScore,
    productivityScore,
    focusScore,
    importanceScore,
    aiScore: Math.round((importanceScore + confidence) / 2),
    confidence,
    replayPriorityScore: Math.round((importanceScore + focusScore + emotionalScore) / 3),
    shouldCapture,
    privacyLevel: event.privacyLevel || (source === "clipboard" || type === "screenshot" ? "private" : "standard"),
    timestamp: event.timestamp || new Date().toISOString(),
    metadata: {
      url: event.url || "",
      app: event.app || "NeuroNest",
      view: event.view || "",
      durationMs: Number(event.durationMs || 0),
      captureMode: event.captureMode || "permission-based-web",
      rawLength: rawText.length,
    },
  };
}
