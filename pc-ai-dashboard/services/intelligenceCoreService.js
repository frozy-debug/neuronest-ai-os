import { predictBehavior } from "./behaviorPredictionEngine.js";
import { attachConfidence, evidenceFromMemory, scoreInsightConfidence, summarizeEvidence } from "./intelligenceConfidenceEngine.js";
import { detectLanguage } from "./languageIntelligenceService.js";
import { buildPersonalKnowledgeGraph } from "./personalKnowledgeGraphService.js";

function textOf(memory) {
  return `${memory.title} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""} ${memory.emotions?.join(" ") || ""}`.toLowerCase();
}

function countWhere(memories, pattern) {
  return memories.filter((memory) => pattern.test(textOf(memory)));
}

function percentage(value, max) {
  return Math.max(1, Math.min(99, Math.round((value / Math.max(1, max)) * 100)));
}

function buildPreferenceModels(memories = []) {
  const focus = countWhere(memories, /focus|deep work|productive|coding|study/);
  const creativity = countWhere(memories, /idea|startup|creative|design|ai/);
  const places = countWhere(memories, /cafe|coffee|restaurant|travel|place|map/);
  const emotion = countWhere(memories, /happy|excited|stress|tired|calm|journal|voice/);
  const learning = countWhere(memories, /learn|study|course|research|docs|tutorial/);
  const total = memories.length || 1;

  return {
    productivityModel: {
      score: percentage(focus.length + creativity.length * 0.5, total),
      summary: focus.length ? "Focus and productive work patterns are becoming visible." : "Productivity model is warming up.",
      evidence: focus.slice(0, 4).map((memory) => evidenceFromMemory(memory, "productivity habit")),
    },
    creativityModel: {
      score: percentage(creativity.length, total),
      summary: creativity.length ? "Creative and startup thinking are recurring memory themes." : "Creativity model needs more idea memories.",
      evidence: creativity.slice(0, 4).map((memory) => evidenceFromMemory(memory, "creative pattern")),
    },
    emotionalModel: {
      score: percentage(emotion.length, total),
      summary: emotion.length ? "Emotional signals are linked to notes, voice, and place memories." : "Emotional model is still sparse.",
      evidence: emotion.slice(0, 4).map((memory) => evidenceFromMemory(memory, "emotional signal")),
    },
    placeModel: {
      score: percentage(places.length, total),
      summary: places.length ? "Place intelligence is active across cafes, travel, and location memories." : "Add more places to strengthen location intelligence.",
      evidence: places.slice(0, 4).map((memory) => evidenceFromMemory(memory, "place preference")),
    },
    learningModel: {
      score: percentage(learning.length, total),
      summary: learning.length ? "Learning and research habits are being mapped." : "Learning model will improve with study or research memories.",
      evidence: learning.slice(0, 4).map((memory) => evidenceFromMemory(memory, "learning habit")),
    },
  };
}

function buildReasoningInsights({ memories = [], relationships = [], resurfacing = null }) {
  const cafeIdeas = countWhere(memories, /cafe|coffee|startup|idea|creative/);
  const workoutFocus = countWhere(memories, /gym|workout|fitness|focus|productive/);
  const voiceEmotion = countWhere(memories, /voice|journal|reflection|emotion|happy|stress|calm/);
  const insights = [
    cafeIdeas.length
      ? attachConfidence(
          {
            title: "Cafe and idea memories are connected",
            body: "Startup and creative memories often sit near cafe/place signals.",
            type: "hidden-relationship",
          },
          { evidence: cafeIdeas.slice(0, 5).map((memory) => evidenceFromMemory(memory, "cafe or idea signal")), relationships, memoryCount: memories.length },
        )
      : null,
    workoutFocus.length
      ? attachConfidence(
          {
            title: "Physical activity may support focus",
            body: "Workout, fitness, and focus memories appear together in your behavior graph.",
            type: "behavior-correlation",
          },
          { evidence: workoutFocus.slice(0, 5).map((memory) => evidenceFromMemory(memory, "workout/focus signal")), relationships, memoryCount: memories.length },
        )
      : null,
    voiceEmotion.length
      ? attachConfidence(
          {
            title: "Voice notes carry emotional context",
            body: "Voice and reflection memories are useful anchors for emotional pattern detection.",
            type: "emotional-intelligence",
          },
          { evidence: voiceEmotion.slice(0, 5).map((memory) => evidenceFromMemory(memory, "voice/emotion signal")), relationships, memoryCount: memories.length },
        )
      : null,
    resurfacing?.highlights?.[0]
      ? {
          title: "Resurfacing opportunity",
          body: resurfacing.highlights[0].aiExplanation,
          type: "proactive-recall",
          confidence: resurfacing.highlights[0].confidence,
          evidenceSources: resurfacing.highlights[0].relatedMemories || [],
          memoryReferences: [resurfacing.highlights[0].memoryId].filter(Boolean),
        }
      : null,
  ].filter(Boolean);

  if (!insights.length) {
    return [];
  }

  return insights;
}

function buildUnderstandingLevel({ memories = [], relationships = [], patterns = [], graph = null, resurfacing = null }) {
  const memoryScore = Math.min(28, memories.length * 1.8);
  const relationshipScore = Math.min(24, relationships.length * 1.6);
  const patternScore = Math.min(20, patterns.length * 5);
  const graphScore = Math.min(16, (graph?.nodes?.length || 0) * 0.45);
  const resurfacingScore = Math.min(12, (resurfacing?.feed?.length || 0) * 1.4);
  const level = memories.length
    ? Math.min(99, Math.round(memoryScore + relationshipScore + patternScore + graphScore + resurfacingScore))
    : 0;

  return {
    level,
    label: `NeuroNest currently understands ${level}% of your recurring routines.`,
    breakdown: {
      memoriesLearned: memories.length,
      relationshipsMapped: relationships.length,
      patternsDiscovered: patterns.length,
      graphNodes: graph?.nodes?.length || 0,
      resurfacingSignals: resurfacing?.feed?.length || 0,
    },
  };
}

export function buildIntelligenceCore({ user, memories = [], relationships = [], patterns = [], dna = null, resurfacing = null, languageInput = "", chatHistory = [] }) {
  const language = detectLanguage(languageInput, chatHistory);
  const knowledgeGraph = buildPersonalKnowledgeGraph({ user, memories, relationships, dna });
  const models = buildPreferenceModels(memories);
  const predictions = predictBehavior({ memories, relationships, resurfacing: resurfacing?.feed || [] });
  const insights = buildReasoningInsights({ memories, relationships, resurfacing });
  const understandingLevel = buildUnderstandingLevel({ memories, relationships, patterns, graph: knowledgeGraph, resurfacing });
  const confidence = scoreInsightConfidence({
    evidence: insights.flatMap((insight) => insight.evidenceSources || []),
    relationships,
    memoryCount: memories.length,
    semanticMatches: resurfacing?.feed || [],
  });

  return {
    version: "NeuroNest Intelligence Core v1",
    modelStrategy: {
      customLlmTraining: false,
      usesExistingAiModels: true,
      chatProvider: process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? "groq" : "openai"),
      chatModel: process.env.GROQ_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || "configured provider model",
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    },
    language,
    personality: {
      tone: "warm, calm, emotionally aware, futuristic, concise, supportive",
      instruction: language.instruction,
    },
    understandingLevel,
    knowledgeGraph,
    models,
    predictions,
    insights,
    proactiveIntelligence: {
      resurfacing: resurfacing?.highlights || [],
      suggestions: [
        "Review one rediscovered idea and decide its next action.",
        "Use your strongest focus window for deep work.",
        "Capture voice notes when emotions or ideas spike.",
      ],
    },
    confidence: {
      score: confidence,
      evidenceSummary: summarizeEvidence(insights.flatMap((insight) => insight.evidenceSources || [])),
    },
  };
}
