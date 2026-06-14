function textOf(memory) {
  return `${memory.title} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.emotions?.join(" ") || ""} ${memory.tags?.join(" ") || ""}`.toLowerCase();
}

function dominantEmotion(memory) {
  return memory.emotions?.[0] || (/happy|excited|inspired/.test(textOf(memory)) ? "positive" : /stress|sad|tired/.test(textOf(memory)) ? "heavy" : "neutral");
}

export function buildEmotionalRecall(memories = [], relationships = [], context = {}) {
  const contextMood = String(context.mood || context.emotionalState || "").toLowerCase();
  return memories
    .map((memory) => {
      const emotion = dominantEmotion(memory);
      const sameMood = contextMood && emotion.includes(contextMood);
      const positivePeriod = /positive|creative|inspired|energized|happy/.test(emotion);
      const related = relationships.filter((relationship) => relationship.sourceId === memory.id || relationship.targetId === memory.id);
      const score = Number(memory.importanceScore || 50) + (sameMood ? 24 : 0) + (positivePeriod ? 12 : 0) + related.length * 4;
      return {
        type: "emotional-recall",
        memoryId: memory.id,
        title: memory.title,
        aiExplanation: sameMood
          ? `Your current emotional context matches this previous memory.`
          : positivePeriod
            ? `This memory was captured during a high-positive emotional period.`
            : `This memory may help explain an emotional pattern in your timeline.`,
        reason: sameMood ? "Mood match" : "Emotional timeline rediscovery",
        confidence: Math.min(97, Math.round(score)),
        memoryPreview: memory.summary || memory.content || "",
        relatedMemories: related.slice(0, 3).map((relationship) => ({
          id: relationship.sourceId === memory.id ? relationship.targetId : relationship.sourceId,
          title: relationship.sourceId === memory.id ? relationship.targetTitle : relationship.sourceTitle,
          confidence: relationship.confidence,
          reason: relationship.reason,
        })),
        suggestedAction: positivePeriod ? "Revisit what made this moment work." : "Compare this emotion with your current state.",
        emotion,
      };
    })
    .filter((item) => item.confidence >= 60)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 6);
}

export function buildEmotionalGrowth(memories = []) {
  const counts = memories.reduce((map, memory) => {
    const emotion = dominantEmotion(memory);
    map[emotion] = (map[emotion] || 0) + 1;
    return map;
  }, {});
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return {
    dominantEmotion: top?.[0] || "neutral",
    signalCount: top?.[1] || 0,
    summary: top ? `Your strongest emotional memory cluster is ${top[0]} with ${top[1]} signals.` : "Not enough emotional signals yet.",
  };
}
