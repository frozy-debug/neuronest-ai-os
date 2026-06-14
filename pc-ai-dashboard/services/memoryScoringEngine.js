function hourOf(memory) {
  return new Date(memory.createdAt || memory.timestamp || Date.now()).getHours();
}

function hasText(memory, pattern) {
  return pattern.test(`${memory.title} ${memory.content} ${memory.tags?.join(" ")} ${memory.emotions?.join(" ")}`);
}

export function scoreMemoryImportance(memory, relationships = []) {
  const density = relationships.filter((item) => item.sourceId === memory.id || item.targetId === memory.id).length;
  const emotionalWeight = (memory.emotions || []).reduce((score, emotion) => {
    if (["positive", "creative", "focused", "energized"].includes(emotion)) return score + 12;
    if (emotion === "heavy") return score + 14;
    return score + 4;
  }, 24);
  const tagWeight = Math.min(18, (memory.tags || []).length * 4);
  const lengthWeight = Math.min(14, Math.round(String(memory.content || "").length / 80));
  const sourceWeight = ["voice", "screenshot", "journal", "ai-chat"].includes(memory.type) ? 8 : 4;
  const placeWeight = memory.location ? 8 : 0;
  const revisitWeight = Math.min(18, density * 4);
  const importanceScore = Math.min(98, Math.round(34 + emotionalWeight * 0.36 + tagWeight + lengthWeight + sourceWeight + placeWeight + revisitWeight));

  return {
    importanceScore,
    emotionalWeight: Math.min(100, emotionalWeight + density * 5),
    replayPriority: Math.min(100, importanceScore + (memory.type === "place" ? 5 : 0)),
    memoryStrength: Math.min(100, importanceScore + tagWeight),
    nostalgiaIndex: Math.min(100, Math.max(28, emotionalWeight + (memory.type === "travel" ? 24 : 0) + density * 3)),
    relationshipDensity: density,
  };
}

export function scoreMemories(memories, relationships = []) {
  return memories.map((memory) => ({
    ...memory,
    ...scoreMemoryImportance(memory, relationships),
  }));
}

export function buildMemoryScores(memories, relationships = []) {
  const scored = scoreMemories(memories, relationships);
  const average = (values) => Math.round(values.reduce((sum, value) => sum + value, 0) / (values.length || 1));
  const focus = average(scored.filter((memory) => hasText(memory, /focus|productive|coding|study|planning/i)).map((memory) => memory.importanceScore || 64));
  const creativity = average(scored.filter((memory) => hasText(memory, /idea|startup|creative|ai|design|build/i)).map((memory) => memory.importanceScore || 66));
  const exploration = average(scored.filter((memory) => memory.location || hasText(memory, /place|travel|trip|cafe|restaurant/i)).map((memory) => memory.importanceScore || 62));
  const consistency = scored.length ? Math.min(94, new Set(scored.map((memory) => new Date(memory.createdAt).toDateString())).size * 7) : 0;
  const productivity = average(scored.filter((memory) => hourOf(memory) >= 9 && hourOf(memory) <= 18).map((memory) => memory.importanceScore || 60));

  return [
    { title: "Focus", score: focus, color: "#24c6ff", body: "Based on deep-work, planning, and productivity memories." },
    { title: "Creativity", score: creativity, color: "#7c3aed", body: "Based on idea density, AI notes, and creative locations." },
    { title: "Exploration", score: exploration, color: "#22d3ee", body: "Based on places, movement, travel, and location anchors." },
    { title: "Consistency", score: consistency, color: "#22c55e", body: "Based on memory cadence and repeated habit loops." },
    { title: "Productivity", score: productivity, color: "#f59e0b", body: "Based on daytime focus and relationship strength." },
  ].map((item) => ({ ...item, score: Math.min(98, item.score) }));
}
