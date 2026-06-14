import { buildMemoryScores } from "./memoryScoringEngine.js";
import { buildMemoryDnaProfile } from "./memoryDnaService.js";
import { detectTimelineStreaks, buildTimeline } from "./timelineEngine.js";
import { detectLifePatterns, forgottenMemorySuggestions } from "./patternAnalysisEngine.js";
import { buildContextChains } from "./contextFusionEngine.js";

function textOf(memory) {
  return `${memory.title} ${memory.content} ${memory.summary} ${memory.tags?.join(" ")} ${memory.emotions?.join(" ")} ${memory.type}`.toLowerCase();
}

function countWhere(memories, pattern) {
  return memories.filter((memory) => pattern.test(textOf(memory))).length;
}

function average(values, fallback = 0) {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : fallback;
}

function achievement(title, body, progress, tone = "violet") {
  return { title, body, progress: Math.min(100, Math.max(0, progress)), tone, unlocked: progress >= 70 };
}

export function buildProfileIdentity({ user, memories, relationships }) {
  const scores = buildMemoryScores(memories, relationships);
  const scoreByTitle = new Map(scores.map((item) => [item.title.toLowerCase(), item.score]));
  const timeline = buildTimeline({ memories, relationships, limit: 120 });
  const streaks = detectTimelineStreaks(timeline.events);
  const dna = buildMemoryDnaProfile(memories, relationships);
  const patterns = detectLifePatterns(memories, relationships);
  const chains = buildContextChains(memories, relationships);
  const resurfacing = forgottenMemorySuggestions(memories, relationships);

  const focusCount = countWhere(memories, /focus|deep work|productive|coding|study/);
  const creativeCount = countWhere(memories, /idea|startup|creative|ai|design|build/);
  const placeCount = memories.filter((memory) => memory.type === "place" || memory.location).length;
  const screenshotCount = memories.filter((memory) => memory.type === "screenshot").length;
  const voiceCount = memories.filter((memory) => memory.type === "voice").length;
  const insightCount = memories.filter((memory) => memory.type === "insight").length + patterns.length;
  const emotionalBalance = average(memories.map((memory) => (memory.emotions || []).includes("heavy") ? 42 : (memory.emotions || []).includes("positive") ? 88 : 68));
  const aiUnderstanding = memories.length ? Math.min(99, relationships.length * 2 + memories.length * 2) : 0;

  const stats = [
    { label: "Total memories", value: memories.length, suffix: "", score: Math.min(100, memories.length * 4) },
    { label: "Focus sessions", value: focusCount, suffix: "", score: Math.min(100, focusCount * 12) },
    { label: "Productivity", value: scoreByTitle.get("productivity") || 0, suffix: "%", score: scoreByTitle.get("productivity") || 0 },
    { label: "Creativity", value: scoreByTitle.get("creativity") || 0, suffix: "%", score: scoreByTitle.get("creativity") || 0 },
    { label: "Exploration", value: scoreByTitle.get("exploration") || 0, suffix: "%", score: scoreByTitle.get("exploration") || 0 },
    { label: "Emotional balance", value: emotionalBalance, suffix: "%", score: emotionalBalance },
    { label: "Memory streak", value: streaks.activeMemoryStreak || 0, suffix: "d", score: Math.min(100, (streaks.activeMemoryStreak || 0) * 14) },
    { label: "AI relationships", value: relationships.length, suffix: "", score: Math.min(100, relationships.length * 4) },
    { label: "Places visited", value: placeCount, suffix: "", score: Math.min(100, placeCount * 9) },
    { label: "Screenshots", value: screenshotCount, suffix: "", score: Math.min(100, screenshotCount * 10) },
    { label: "Voice memories", value: voiceCount, suffix: "", score: Math.min(100, voiceCount * 12) },
    { label: "AI insights", value: insightCount, suffix: "", score: Math.min(100, insightCount * 10) },
  ];

  const radar = [
    { label: "Focus", value: scoreByTitle.get("focus") || 0 },
    { label: "Creativity", value: scoreByTitle.get("creativity") || 0 },
    { label: "Exploration", value: scoreByTitle.get("exploration") || 0 },
    { label: "Consistency", value: scoreByTitle.get("consistency") || 0 },
    { label: "Emotion", value: emotionalBalance },
    { label: "AI Sync", value: aiUnderstanding },
  ];

  return {
    identity: {
      name: user?.name || user?.email || "NeuroNest User",
      email: user?.email || "",
      picture: user?.picture || "",
      title: memories.length ? dna.identity : "Identity learning",
      rank: memories.length ? (creativeCount >= focusCount ? "Creative Memory Architect" : "Deep Focus Builder") : "Not learned",
      badge: memories.length ? (aiUnderstanding > 82 ? "Neural Core Level 4" : "Neural Core Learning") : "No evidence yet",
    },
    stats,
    dna: {
      ...dna,
      focusArchetype: focusCount ? (focusCount > 2 ? "Deep Focus Explorer" : "Focus Builder") : "Not learned",
      creativityArchetype: creativeCount ? (creativeCount > 2 ? "Creative Night Thinker" : "Idea Mapper") : "Not learned",
      productivityIdentity: scoreByTitle.get("productivity") ? (scoreByTitle.get("productivity") > 80 ? "Pattern-Based Strategist" : "Rhythm Builder") : "Not learned",
      emotionalProfile: memories.length ? (emotionalBalance > 76 ? "Emotionally Balanced Creator" : "Reflective Stabilizer") : "Not learned",
      radar,
    },
    lifeAnalytics: {
      productivityTrend: scores,
      focusHeatmap: timeline.groups.map((group) => ({ label: group.label, value: group.stats.productivity })),
      emotionalGraph: timeline.groups.map((group) => ({ label: group.label, value: group.stats.emotional })),
      memoryDensity: timeline.groups.map((group) => ({ label: group.label, value: group.stats.count })),
      weeklySummary: patterns[0]?.body || "Not enough evidence for a weekly intelligence summary.",
      monthlyReport: patterns.slice(0, 3).map((pattern) => pattern.body).join(" "),
      aiActivityScore: aiUnderstanding,
      relationshipStrength: average(relationships.map((item) => item.confidence), 0),
    },
    achievements: [
      achievement("7-Day Deep Focus Streak", "Deep work rhythm is becoming visible.", (streaks.activeMemoryStreak || 0) * 18, "blue"),
      achievement("Creative Surge", "Idea memories are clustering with AI and product thinking.", creativeCount * 16, "violet"),
      achievement("Memory Architect", "Your second brain graph is gaining relationship density.", relationships.length * 5, "cyan"),
      achievement("Explorer Rank", "Location and place memories are expanding.", placeCount * 12, "green"),
      achievement("Productivity Pulse", "Focus and productivity events are active.", focusCount * 15, "orange"),
    ],
    evolution: {
      growth: [
        { label: "Memory expansion", value: Math.min(100, memories.length * 5) },
        { label: "Focus consistency", value: scoreByTitle.get("consistency") || 0 },
        { label: "Creative improvement", value: scoreByTitle.get("creativity") || 0 },
        { label: "AI understanding", value: aiUnderstanding },
      ],
      resurfacing,
      milestones: timeline.events.slice(0, 5).map((event) => ({ title: event.title, time: event.timestamp, score: event.importanceScore })),
    },
    companion: {
      conversations: memories.filter((memory) => memory.type === "ai-chat").length,
      favoriteTopics: ["AI", "focus", "places", "ideas", "voice"].filter((topic) => countWhere(memories, new RegExp(topic, "i"))),
      understandingLevel: aiUnderstanding,
      synchronizationLevel: memories.length ? Math.min(99, memories.length * 2 + chains.length * 6) : 0,
      emotionalCompatibility: emotionalBalance,
      chains,
    },
    settings: [
      { label: "Memory privacy", enabled: true },
      { label: "AI proactive insights", enabled: true },
      { label: "Replay cinematic mode", enabled: true },
      { label: "Voice memory capture", enabled: true },
      { label: "Timeline clustering", enabled: true },
      { label: "Ambient glow intensity", value: 74 },
    ],
  };
}
