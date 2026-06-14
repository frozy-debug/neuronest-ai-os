function textOf(memory) {
  return `${memory.title} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""}`.toLowerCase();
}

function daysSince(memory) {
  return Math.max(0, Math.round((Date.now() - new Date(memory.createdAt || memory.timestamp).getTime()) / 86400000));
}

function goalStage(text) {
  if (/done|completed|finished|shipped|launched|solved/.test(text)) return "completed";
  if (/started|working|progress|building|draft|prototype/.test(text)) return "in-progress";
  if (/plan|goal|todo|want|should|need|roadmap|checklist|someday/.test(text)) return "planned";
  return "unknown";
}

export function detectUnfinishedGoals(memories = [], relationships = [], context = {}) {
  const contextText = `${context.activity || ""} ${context.project || ""} ${context.query || ""}`.toLowerCase();
  return memories
    .filter((memory) => /goal|plan|todo|project|roadmap|checklist|launch|build|habit|routine|finish|complete|start/.test(textOf(memory)))
    .map((memory) => {
      const text = textOf(memory);
      const stage = goalStage(text);
      const age = daysSince(memory);
      const related = relationships.filter((relationship) => relationship.sourceId === memory.id || relationship.targetId === memory.id);
      const contextOverlap = contextText
        ? contextText.split(/\s+/).filter((word) => word.length > 3 && text.includes(word)).length
        : 0;
      const abandoned = stage !== "completed" && age >= 7 && related.length <= 2;
      const score = Number(memory.importanceScore || 50) + age * 0.35 + contextOverlap * 12 + (abandoned ? 20 : 4);

      return {
        type: "goal-revival",
        memoryId: memory.id,
        title: memory.title,
        aiExplanation: abandoned
          ? `You planned this but the memory graph shows weak follow-up afterward.`
          : `This goal still connects to your current memory patterns.`,
        reason: abandoned ? "Abandoned project reminder" : "Goal reconnection",
        confidence: Math.min(98, Math.round(score)),
        memoryPreview: memory.summary || memory.content || "",
        relatedMemories: related.slice(0, 4).map((relationship) => ({
          id: relationship.sourceId === memory.id ? relationship.targetId : relationship.sourceId,
          title: relationship.sourceId === memory.id ? relationship.targetTitle : relationship.sourceTitle,
          confidence: relationship.confidence,
          reason: relationship.reason,
        })),
        suggestedAction: abandoned ? "Revive it with one tiny next action." : "Review progress and decide the next milestone.",
        stage,
        ageDays: age,
      };
    })
    .filter((item) => item.stage !== "completed" && item.confidence >= 54)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}
