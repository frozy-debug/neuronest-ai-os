function textOf(memory) {
  return `${memory.title} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""}`.toLowerCase();
}

function routineLabel(text) {
  if (/cafe|coffee/.test(text)) return "Cafe productivity arc";
  if (/gym|workout|fitness/.test(text)) return "Workout to focus loop";
  if (/morning|10am|planning/.test(text)) return "Morning planning routine";
  if (/night|late|evening/.test(text)) return "Evening creative window";
  if (/focus|deep work|code|study/.test(text)) return "Deep work breakthrough";
  return "Productivity memory";
}

export function buildProductivityRecall(memories = [], relationships = [], context = {}) {
  const contextText = `${context.activity || ""} ${context.focusState || ""} ${context.project || ""}`.toLowerCase();
  return memories
    .filter((memory) => /focus|deep work|productive|routine|workflow|coding|study|planning|gym|cafe|workout/.test(textOf(memory)))
    .map((memory) => {
      const text = textOf(memory);
      const related = relationships.filter((relationship) => relationship.sourceId === memory.id || relationship.targetId === memory.id);
      const contextOverlap = contextText
        ? contextText.split(/\s+/).filter((word) => word.length > 3 && text.includes(word)).length
        : 0;
      const score = Number(memory.aiScore || memory.importanceScore || 55) + related.length * 5 + contextOverlap * 12 + (/deep work|focus/.test(text) ? 12 : 0);
      return {
        type: "productivity-recall",
        memoryId: memory.id,
        title: memory.title,
        aiExplanation: contextOverlap
          ? `This previous productivity memory matches your current activity.`
          : `This memory contains a workflow that previously improved focus or output.`,
        reason: routineLabel(text),
        confidence: Math.min(98, Math.round(score)),
        memoryPreview: memory.summary || memory.content || "",
        relatedMemories: related.slice(0, 4).map((relationship) => ({
          id: relationship.sourceId === memory.id ? relationship.targetId : relationship.sourceId,
          title: relationship.sourceId === memory.id ? relationship.targetTitle : relationship.sourceTitle,
          confidence: relationship.confidence,
          reason: relationship.reason,
        })),
        suggestedAction: "Reuse the routine or compare it with your current workflow.",
      };
    })
    .filter((item) => item.confidence >= 58)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

export function discoverProductivityCorrelations(memories = []) {
  const count = (pattern) => memories.filter((memory) => pattern.test(textOf(memory))).length;
  const cafeCount = count(/cafe|coffee/);
  const workoutCount = count(/gym|workout|fitness/);
  const ideaCount = count(/idea|startup|creative|ai/);
  const focusCount = count(/focus|deep work|productive|coding/);
  return [
    cafeCount && ideaCount
      ? { title: "Cafe visits overlap with startup planning", body: `${cafeCount} cafe memories and ${ideaCount} idea memories are available for correlation analysis.`, confidence: Math.min(94, 45 + (cafeCount + ideaCount) * 6), evidenceCount: cafeCount + ideaCount }
      : null,
    workoutCount && focusCount
      ? { title: "Physical activity overlaps with deep focus", body: `${workoutCount} workout memories and ${focusCount} focus memories are available for correlation analysis.`, confidence: Math.min(92, 45 + (workoutCount + focusCount) * 6), evidenceCount: workoutCount + focusCount }
      : null,
    ideaCount && focusCount
      ? { title: "Creative ideas overlap with focus windows", body: `${ideaCount} idea memories and ${focusCount} focus memories form a possible reusable work pattern.`, confidence: Math.min(94, 45 + (ideaCount + focusCount) * 6), evidenceCount: ideaCount + focusCount }
      : null,
  ].filter(Boolean);
}
