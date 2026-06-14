function memoryText(memory) {
  return `${memory.title} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""}`.toLowerCase();
}

function ageDays(memory) {
  return Math.max(0, Math.round((Date.now() - new Date(memory.createdAt || memory.timestamp).getTime()) / 86400000));
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

export function detectForgottenIdeas(memories = [], relationships = [], context = {}) {
  const contextText = `${context.activity || ""} ${context.project || ""} ${context.query || ""}`.toLowerCase();
  return memories
    .filter((memory) => /idea|startup|business|concept|build|launch|product|ai|project/.test(memoryText(memory)))
    .map((memory) => {
      const text = memoryText(memory);
      const days = ageDays(memory);
      const related = relatedFor(memory, relationships);
      const contextOverlap = contextText
        ? contextText.split(/\s+/).filter((word) => word.length > 3 && text.includes(word)).length
        : 0;
      const unfinished = !/done|finished|completed|shipped|launched|closed/.test(text);
      const score =
        Number(memory.importanceScore || memory.aiScore || 50) +
        Math.min(24, days * 0.5) +
        related.length * 6 +
        contextOverlap * 10 +
        (unfinished ? 14 : 0);

      return {
        type: "forgotten-idea",
        memoryId: memory.id,
        title: memory.title,
        aiExplanation: contextOverlap
          ? `This older idea strongly overlaps with what you are doing right now.`
          : `This idea has high memory value but has not been revisited recently.`,
        reason: unfinished ? "Unfinished idea detected" : "Old creative insight rediscovered",
        confidence: Math.min(98, Math.round(score)),
        memoryPreview: memory.summary || memory.content || "",
        relatedMemories: related,
        suggestedAction: unfinished ? "Turn this into a next-step checklist." : "Compare this with your current project.",
        ageDays: days,
      };
    })
    .filter((item) => item.confidence >= 58)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

export function detectRecurringThoughts(memories = []) {
  const phraseCounts = new Map();
  memories.forEach((memory) => {
    const words = memoryText(memory).split(/\s+/).filter((word) => word.length > 4);
    words.forEach((word) => phraseCounts.set(word, (phraseCounts.get(word) || 0) + 1));
  });

  return [...phraseCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, count]) => ({
      topic,
      count,
      title: `Recurring thought: ${topic}`,
      body: `You have revisited "${topic}" ${count} times across your memory graph.`,
      confidence: Math.min(96, 56 + count * 9),
    }));
}
