import { buildContextRecallCards, normalizeRecallContext } from "./contextAwareRecallService.js";
import { buildEmotionalGrowth, buildEmotionalRecall } from "./emotionalRecallEngine.js";
import { detectForgottenIdeas, detectRecurringThoughts } from "./ideaRediscoveryService.js";
import { detectUnfinishedGoals } from "./goalReconnectionService.js";
import { buildProductivityRecall, discoverProductivityCorrelations } from "./productivityRecallEngine.js";

function textOf(memory) {
  return `${memory.title} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""}`.toLowerCase();
}

export function buildMemoryClusters(memories = [], relationships = []) {
  const clusterSeeds = [
    ["startup journey", /startup|business|launch|pricing|customer|revenue|saas/],
    ["learning cycle", /study|learn|course|research|notes|tutorial|docs/],
    ["deep focus arc", /focus|deep work|productive|code|build|task/],
    ["creative system", /idea|creative|design|brainstorm|ai|prompt/],
    ["fitness phase", /gym|workout|fitness|health|run|training/],
    ["travel arc", /travel|trip|hotel|map|route|place/],
    ["emotional period", /happy|sad|stress|calm|excited|mood|journal/],
  ];

  return clusterSeeds
    .map(([label, pattern]) => {
      const items = memories.filter((memory) => pattern.test(textOf(memory)));
      const relationshipStrength = relationships.filter((relationship) =>
        items.some((memory) => memory.id === relationship.sourceId || memory.id === relationship.targetId),
      ).length;
      return {
        id: label.replace(/\s+/g, "-"),
        label,
        count: items.length,
        strength: Math.min(99, items.length * 12 + relationshipStrength * 4),
        summary: items.length
          ? `${items.length} memories are forming a ${label} with ${relationshipStrength} relationship signals.`
          : `No strong ${label} detected yet.`,
        memoryIds: items.slice(0, 8).map((memory) => memory.id),
      };
    })
    .filter((cluster) => cluster.count > 0)
    .sort((a, b) => b.strength - a.strength);
}

export function buildResurfacingSuggestions(memories = [], relationships = [], currentAnalysis = null) {
  const now = Date.now();
  const topics = currentAnalysis?.topics || [];
  const candidates = memories
    .map((memory) => {
      const ageDays = Math.max(0, Math.round((now - new Date(memory.createdAt || memory.timestamp).getTime()) / 86400000));
      const topicOverlap = topics.filter((topic) => textOf(memory).includes(topic)).length;
      const relationshipCount = relationships.filter((relationship) => relationship.sourceId === memory.id || relationship.targetId === memory.id).length;
      const nostalgia = Math.min(35, ageDays);
      const score = Number(memory.importanceScore || 50) + topicOverlap * 18 + relationshipCount * 5 + nostalgia * 0.4;
      return {
        id: memory.id,
        title: memory.title,
        body: topicOverlap
          ? `This relates to your current ${topics.slice(0, 2).join(" and ")} activity.`
          : `Worth resurfacing after ${ageDays || 1} day${ageDays === 1 ? "" : "s"}.`,
        ageDays,
        relationshipCount,
        score: Math.round(score),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return candidates;
}

export function buildResurfacingNotifications(memories = [], relationships = []) {
  const clusters = buildMemoryClusters(memories, relationships);
  const suggestions = buildResurfacingSuggestions(memories, relationships);
  return [
    clusters[0]
      ? {
          title: `${clusters[0].label} is growing`,
          body: clusters[0].summary,
          confidence: clusters[0].strength,
        }
      : null,
    suggestions[0]
      ? {
          title: "Forgotten memory resurfaced",
          body: `${suggestions[0].title}: ${suggestions[0].body}`,
          confidence: Math.min(94, suggestions[0].score),
    }
      : null,
    discoverProductivityCorrelations(memories)[0]
      ? {
          title: discoverProductivityCorrelations(memories)[0].title,
          body: discoverProductivityCorrelations(memories)[0].body,
          confidence: discoverProductivityCorrelations(memories)[0].confidence,
        }
      : null,
  ].filter(Boolean);
}

function cardKey(card) {
  return `${card.type}:${card.memoryId || card.title}`;
}

function normalizeCard(card) {
  return {
    id: card.id || cardKey(card),
    type: card.type || "memory-resurfacing",
    title: card.title,
    aiExplanation: card.aiExplanation || card.body || "This memory is worth revisiting.",
    reason: card.reason || "AI resurfacing",
    confidence: Math.max(1, Math.min(99, Number(card.confidence || card.score || 70))),
    memoryPreview: card.memoryPreview || card.summary || card.body || "",
    relatedMemories: card.relatedMemories || [],
    suggestedAction: card.suggestedAction || "Review this memory and connect it to your current work.",
    timelineShortcut: card.memoryId ? `timeline:${card.memoryId}` : "timeline",
    replayShortcut: card.memoryId ? `replay:${card.memoryId}` : "replay",
    ageDays: card.ageDays,
  };
}

export function buildSerendipityDiscoveries(memories = [], relationships = []) {
  const clusters = buildMemoryClusters(memories, relationships);
  const recurring = detectRecurringThoughts(memories);
  const productivity = discoverProductivityCorrelations(memories);
  return [
    ...productivity.map((item) => ({
      type: "serendipity",
      title: item.title,
      aiExplanation: item.body,
      reason: "Hidden life pattern",
      confidence: item.confidence,
      memoryPreview: item.body,
      suggestedAction: "Use this pattern intentionally this week.",
      relatedMemories: [],
    })),
    ...recurring.slice(0, 2).map((item) => ({
      type: "recurring-thought",
      title: item.title,
      aiExplanation: item.body,
      reason: "Recurring thought detected",
      confidence: item.confidence,
      memoryPreview: item.body,
      suggestedAction: "Decide whether this should become a project, habit, or archived idea.",
      relatedMemories: [],
    })),
    ...clusters.slice(0, 2).map((cluster) => ({
      type: "cluster-resurfacing",
      title: cluster.label,
      aiExplanation: cluster.summary,
      reason: "Memory cluster resurfaced",
      confidence: cluster.strength,
      memoryPreview: cluster.summary,
      suggestedAction: "Replay this cluster as a connected life arc.",
      relatedMemories: cluster.memoryIds.map((id) => ({ id, title: "Cluster memory", confidence: cluster.strength, reason: cluster.label })),
    })),
  ].slice(0, 8);
}

export function buildMemoryResurfacingFeed({ memories = [], relationships = [], context = {}, semanticMatches = [] } = {}) {
  const normalizedContext = normalizeRecallContext(context);
  const cards = [
    ...buildContextRecallCards({ memories, relationships, context: normalizedContext, semanticMatches }),
    ...detectForgottenIdeas(memories, relationships, normalizedContext),
    ...detectUnfinishedGoals(memories, relationships, normalizedContext),
    ...buildEmotionalRecall(memories, relationships, normalizedContext),
    ...buildProductivityRecall(memories, relationships, normalizedContext),
    ...buildSerendipityDiscoveries(memories, relationships),
  ];

  const uniqueCards = [];
  const seen = new Set();
  cards
    .map(normalizeCard)
    .sort((a, b) => b.confidence - a.confidence)
    .forEach((card) => {
      if (seen.has(card.id)) return;
      seen.add(card.id);
      uniqueCards.push(card);
    });

  const clusters = buildMemoryClusters(memories, relationships);
  const emotionalGrowth = buildEmotionalGrowth(memories);

  return {
    context: normalizedContext,
    feed: uniqueCards.slice(0, 14),
    highlights: uniqueCards.slice(0, 4),
    clusters,
    recurringThoughts: detectRecurringThoughts(memories),
    forgottenIdeas: detectForgottenIdeas(memories, relationships, normalizedContext).slice(0, 5),
    goals: detectUnfinishedGoals(memories, relationships, normalizedContext).slice(0, 5),
    emotionalGrowth,
    notifications: [
      uniqueCards[0]
        ? {
            title: "Memory rediscovered",
            body: `${uniqueCards[0].title}: ${uniqueCards[0].reason}`,
            confidence: uniqueCards[0].confidence,
          }
        : null,
      ...buildResurfacingNotifications(memories, relationships),
    ].filter(Boolean).slice(0, 4),
  };
}
