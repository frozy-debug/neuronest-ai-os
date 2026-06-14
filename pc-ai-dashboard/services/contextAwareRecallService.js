function textOf(memory) {
  return `${memory.title} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""} ${memory.emotions?.join(" ") || ""}`.toLowerCase();
}

export function normalizeRecallContext(input = {}) {
  const now = new Date();
  return {
    query: String(input.query || input.activity || input.project || "").trim(),
    activity: String(input.activity || "").trim(),
    project: String(input.project || "").trim(),
    locationLabel: String(input.locationLabel || input.location?.label || "").trim(),
    mood: String(input.mood || input.emotionalState || "").trim(),
    productivityState: String(input.productivityState || "").trim(),
    focusState: String(input.focusState || "").trim(),
    timeOfDay: input.timeOfDay || (now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening"),
  };
}

export function contextText(context = {}) {
  return [
    context.query,
    context.activity,
    context.project,
    context.locationLabel,
    context.mood,
    context.productivityState,
    context.focusState,
    context.timeOfDay,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function rankContextAwareMemories({ memories = [], relationships = [], context = {}, semanticMatches = [] }) {
  const normalized = normalizeRecallContext(context);
  const contextWords = contextText(normalized).split(/\s+/).filter((word) => word.length > 3);
  const semanticScores = new Map(semanticMatches.map((match) => [match.memory.id, match.score || Math.round((match.similarity || 0) * 100)]));

  return memories
    .map((memory) => {
      const text = textOf(memory);
      const overlap = contextWords.filter((word) => text.includes(word)).length;
      const relationshipCount = relationships.filter((relationship) => relationship.sourceId === memory.id || relationship.targetId === memory.id).length;
      const locationMatch = normalized.locationLabel && text.includes(normalized.locationLabel.toLowerCase()) ? 18 : 0;
      const moodMatch = normalized.mood && text.includes(normalized.mood.toLowerCase()) ? 14 : 0;
      const semanticScore = semanticScores.get(memory.id) || 0;
      const score = Number(memory.importanceScore || 50) + overlap * 8 + relationshipCount * 4 + locationMatch + moodMatch + semanticScore * 0.35;
      return {
        memory,
        score: Math.min(99, Math.round(score)),
        overlap,
        relationshipCount,
        semanticScore,
        reason: overlap
          ? "Current context match"
          : semanticScore
            ? "Vector similarity match"
            : relationshipCount
              ? "Relationship graph match"
              : "High-value memory",
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

export function buildContextRecallCards({ memories = [], relationships = [], context = {}, semanticMatches = [] }) {
  return rankContextAwareMemories({ memories, relationships, context, semanticMatches }).slice(0, 6).map((item) => ({
    type: "context-aware-recall",
    memoryId: item.memory.id,
    title: item.memory.title,
    aiExplanation: item.overlap
      ? "This memory is resurfacing because it matches your current context."
      : item.semanticScore
        ? "This memory is semantically close to what you are working on now."
        : "This memory has strong relationship density and may be useful right now.",
    reason: item.reason,
    confidence: item.score,
    memoryPreview: item.memory.summary || item.memory.content || "",
    relatedMemories: relationships
      .filter((relationship) => relationship.sourceId === item.memory.id || relationship.targetId === item.memory.id)
      .slice(0, 3)
      .map((relationship) => ({
        id: relationship.sourceId === item.memory.id ? relationship.targetId : relationship.sourceId,
        title: relationship.sourceId === item.memory.id ? relationship.targetTitle : relationship.sourceTitle,
        confidence: relationship.confidence,
        reason: relationship.reason,
      })),
    suggestedAction: "Open this memory or replay its surrounding timeline.",
  }));
}
