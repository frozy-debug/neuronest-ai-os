import { buildPersonalKnowledgeGraph } from "./personalKnowledgeGraphService.js";
import { evidenceFromMemory, scoreInsightConfidence } from "./intelligenceConfidenceEngine.js";

function textOf(memory) {
  return `${memory.title || ""} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""} ${memory.emotions?.join(" ") || ""}`.toLowerCase();
}

function countWhere(memories, pattern) {
  return memories.filter((memory) => pattern.test(textOf(memory)));
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function labelRisk(score) {
  if (score >= 74) return "High";
  if (score >= 46) return "Medium";
  return "Low";
}

function relatedFor(memory, relationships = []) {
  return relationships
    .filter((relationship) => relationship.sourceId === memory.id || relationship.targetId === memory.id)
    .slice(0, 4)
    .map((relationship) => ({
      id: relationship.sourceId === memory.id ? relationship.targetId : relationship.sourceId,
      title: relationship.sourceId === memory.id ? relationship.targetTitle : relationship.sourceTitle,
      confidence: relationship.confidence,
      reason: relationship.reason,
    }));
}

function scoreDimension(memories, pattern, base = 48) {
  const matches = countWhere(memories, pattern);
  if (!matches.length) return 0;
  const avgImportance = matches.length
    ? matches.reduce((sum, memory) => sum + Number(memory.aiScore || memory.importanceScore || 60), 0) / matches.length
    : base;
  return clamp(Math.min(base, 36) + matches.length * 7 + avgImportance * 0.22, 1, 98);
}

function buildStrengthMap(memories = []) {
  return [
    { label: "Creativity", score: scoreDimension(memories, /idea|startup|creative|design|brainstorm|ai/, 52) },
    { label: "Focus", score: scoreDimension(memories, /focus|deep work|productive|coding|study|task/, 50) },
    { label: "Learning", score: scoreDimension(memories, /learn|study|course|research|docs|tutorial|notes/, 48) },
    { label: "Consistency", score: scoreDimension(memories, /routine|habit|daily|weekly|streak|gym|planning/, 44) },
    { label: "Execution", score: scoreDimension(memories, /build|ship|deploy|finish|complete|launch|fix/, 46) },
    { label: "Problem Solving", score: scoreDimension(memories, /bug|solve|fix|debug|problem|issue|architecture/, 48) },
  ].filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
}

function buildWeaknessMap(memories = []) {
  const distraction = countWhere(memories, /scroll|distract|random|social|reels|shorts|doom/);
  const burnout = countWhere(memories, /tired|stress|burnout|blocked|anxious|overload|late night/);
  const abandoned = countWhere(memories, /abandoned|later|someday|unfinished|stopped|not completed|pending/);
  const inconsistent = countWhere(memories, /missed|inconsistent|skipped|break|gap|stopped/);
  const procrastination = countWhere(memories, /procrastinate|delay|later|pending|avoid|tomorrow/);
  return [
    ["Procrastination Risk", procrastination],
    ["Burnout Risk", burnout],
    ["Distraction Risk", distraction],
    ["Inconsistency Risk", inconsistent],
    ["Abandoned Project Tendency", abandoned],
  ]
    .filter(([, evidence]) => evidence.length)
    .map(([label, evidence]) => {
      const score = clamp(30 + evidence.length * 16);
      return { label, risk: labelRisk(score), confidence: clamp(45 + evidence.length * 12), score, evidenceCount: evidence.length };
    });
}

function buildGoals(memories = [], relationships = []) {
  const goalMemories = memories
    .filter((memory) => /goal|plan|project|startup|launch|learn|build|finish|routine|habit|roadmap/.test(textOf(memory)))
    .slice(0, 12);
  return goalMemories.map((memory) => ({
    id: memory.id,
    title: memory.title,
    status: /done|finished|completed|shipped|launched/.test(textOf(memory)) ? "completed" : /started|working|progress|building/.test(textOf(memory)) ? "active" : "planned",
    confidence: clamp(Number(memory.aiScore || memory.importanceScore || 58) + relatedFor(memory, relationships).length * 4),
    evidence: evidenceFromMemory(memory, "goal signal"),
    relatedMemories: relatedFor(memory, relationships),
  }));
}

function buildHabits(memories = []) {
  const habitRules = [
    ["Morning planning", /morning|planning|plan|goals|checklist/],
    ["Gym before focus sessions", /gym|workout|fitness|focus|productive/],
    ["Late-night creativity", /night|late|evening|idea|startup|creative/],
    ["Weekend project reviews", /weekend|review|project|roadmap|planning/],
    ["Cafe productivity", /cafe|coffee|workspace|startup|focus/],
    ["Voice reflection", /voice|reflection|journal|mood|note/],
  ];

  return habitRules
    .map(([label, pattern]) => {
      const evidence = countWhere(memories, pattern);
      return {
        label,
        strength: clamp(34 + evidence.length * 12),
        consistencyScore: clamp(40 + evidence.length * 10),
        evidenceCount: evidence.length,
        evidence: evidence.slice(0, 4).map((memory) => evidenceFromMemory(memory, label)),
      };
    })
    .filter((habit) => habit.evidenceCount > 0)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8);
}

function buildPersonality(memories = []) {
  const dimensions = [
    { label: "Builder", score: scoreDimension(memories, /build|ship|code|launch|deploy|create/, 50) },
    { label: "Creator", score: scoreDimension(memories, /idea|creative|design|write|brainstorm|startup/, 50) },
    { label: "Researcher", score: scoreDimension(memories, /research|learn|study|docs|tutorial|compare/, 46) },
    { label: "Explorer", score: scoreDimension(memories, /travel|place|map|cafe|new|explore/, 46) },
    { label: "Operator", score: scoreDimension(memories, /routine|system|process|workflow|checklist|execution/, 44) },
    { label: "Strategist", score: scoreDimension(memories, /strategy|plan|roadmap|business|goal|decision/, 48) },
  ].filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  return {
    primary: dimensions[0]?.label || "Not learned",
    secondary: dimensions[1]?.label || "Not learned",
    dimensions,
    summary: dimensions.length
      ? `${dimensions[0]?.label}${dimensions[1] ? `-${dimensions[1].label}` : ""} profile based on ${memories.length} memory signals.`
      : "Not enough memory evidence to infer a personality profile.",
  };
}

function buildGoalAlignment(memories = [], goals = [], strengths = []) {
  const goalText = goals.map((goal) => goal.title).join(" ").toLowerCase();
  const alignedMemories = memories.filter((memory) => {
    const text = textOf(memory);
    return /startup|build|learn|focus|project|routine|goal|launch|ai/.test(text) || goalText.split(/\s+/).some((word) => word.length > 4 && text.includes(word));
  });
  const score = goals.length
    ? clamp((alignedMemories.length / Math.max(1, memories.length)) * 70 + strengths.slice(0, 2).reduce((sum, item) => sum + item.score, 0) * 0.15, 0, 98)
    : 0;
  return {
    score,
    explanation: alignedMemories.length
      ? "Recent behavior aligns with startup development, learning, focus, and project-building signals in your memory graph."
      : "No evidence-backed goal alignment is available yet.",
    evidence: alignedMemories.slice(0, 5).map((memory) => evidenceFromMemory(memory, "goal alignment evidence")),
  };
}

function buildDecisionHistory(memories = []) {
  const decisionMemories = memories
    .filter((memory) => /decided|decision|should i|choose|changed|pursue|learn|build|start|stop|launch|switch/.test(textOf(memory)))
    .slice(0, 10);
  const projectMemories = countWhere(memories, /project|startup|build|launch|content|app|website|ai/);
  return {
    decisions: decisionMemories.map((memory) => ({
      id: memory.id,
      title: memory.title,
      outcome: /done|finished|launched|completed|success/.test(textOf(memory)) ? "success" : /abandoned|stopped|failed|drop/.test(textOf(memory)) ? "abandoned" : "open",
      confidence: clamp(Number(memory.aiScore || memory.importanceScore || 60)),
      evidence: evidenceFromMemory(memory, "decision memory"),
    })),
    patterns: projectMemories.length
      ? [{
            title: "AI/project consistency",
            body: `${projectMemories.length} stored project-related memories are available for decision analysis.`,
            confidence: clamp(45 + projectMemories.length * 7),
            evidenceCount: projectMemories.length,
          }]
      : [],
  };
}

export function isDecisionQuestion(message = "") {
  return /should i|kya mujhe|karu|pursue|build this|learn|change my routine|start this|stop this|is it worth|decision|choose/i.test(String(message));
}

export function buildDecisionRecommendation({ question = "", twin, memories = [], relationships = [] }) {
  const strengths = twin?.strengths || [];
  const weaknesses = twin?.weaknesses || [];
  const topStrength = strengths[0]?.label || "no established strength yet";
  const topRisk = weaknesses.sort((a, b) => b.score - a.score)[0];
  const evidence = memories
    .filter((memory) => /startup|build|learn|project|goal|focus|routine|decision|ai/.test(textOf(memory)))
    .slice(0, 5)
    .map((memory) => evidenceFromMemory(memory, "decision context"));
  const confidence = scoreInsightConfidence({ evidence, relationships, memoryCount: memories.length });
  return {
    recommendation: confidence > 70 ? "yes, but with a small test first" : "test it before committing fully",
    confidence,
    reasoning: `Your Digital Twin currently shows ${topStrength}. The main evidence-backed watch-out is ${topRisk?.label || "not established yet"}${topRisk ? ` (${topRisk.risk})` : ""}.`,
    suggestedNextAction: "Run a 7-day experiment, capture outcomes in NeuroNest, then decide with stronger evidence.",
    evidence,
    question,
  };
}

export function buildDigitalTwin({ user, memories = [], relationships = [], intelligenceCore = null, dna = null }) {
  const strengths = buildStrengthMap(memories);
  const weaknesses = buildWeaknessMap(memories);
  const goals = buildGoals(memories, relationships);
  const habits = buildHabits(memories);
  const personality = buildPersonality(memories);
  const goalAlignment = buildGoalAlignment(memories, goals, strengths);
  const decisionHistory = buildDecisionHistory(memories);
  const graph = buildPersonalKnowledgeGraph({ user, memories, relationships, dna });
  const understanding = intelligenceCore?.understandingLevel || {
    level: memories.length ? clamp(memories.length * 2 + relationships.length * 1.6 + habits.length * 5 + goals.length * 4) : 0,
    breakdown: {},
  };

  return {
    version: "NeuroNest Digital Twin v1",
    updatedAt: new Date().toISOString(),
    user: {
      id: user?.id,
      name: user?.name || user?.email || "NeuroNest User",
      picture: user?.picture || "",
    },
    understandingLevel: {
      overall: understanding.level,
      label: `NeuroNest Understanding Level ${understanding.level}%`,
      memoriesAnalyzed: memories.length,
      relationshipsDiscovered: relationships.length,
      habitsLearned: habits.length,
      goalsIdentified: goals.length,
    },
    strengths,
    weaknesses,
    goals,
    habits,
    personality,
    goalAlignment,
    decisionHistory,
    knowledgeGraph: {
      ...graph,
      connections: {
        user: "goals, habits, places, emotions, ideas, activities, people, decisions",
      },
    },
    profileIntegration: {
      memoryCount: memories.length,
      placesVisited: countWhere(memories, /place|cafe|restaurant|travel/).length,
      voiceNotes: memories.filter((memory) => memory.type === "voice").length,
      screenshotsAnalyzed: memories.filter((memory) => memory.type === "screenshot").length,
      aiConversations: memories.filter((memory) => memory.type === "ai-chat").length,
      memoryDnaType: dna?.identity || intelligenceCore?.dna?.identity || personality.summary,
      weeklySummary: goalAlignment.explanation,
      topStrengths: strengths.slice(0, 3),
      activeGoals: goals.filter((goal) => goal.status !== "completed").slice(0, 4),
    },
  };
}
