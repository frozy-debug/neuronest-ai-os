function timeLabel(date) {
  return new Date(date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function modeFilter(memory, mode) {
  const text = `${memory.title} ${memory.content} ${memory.tags?.join(" ")} ${memory.emotions?.join(" ")} ${memory.type}`.toLowerCase();
  if (mode === "deep-focus") return /focus|deep work|productive|coding|study/.test(text);
  if (mode === "creative") return /creative|idea|startup|ai|design|build/.test(text);
  if (mode === "travel") return /travel|trip|place|map|hotel|journey/.test(text);
  if (mode === "ai-idea") return /ai|startup|idea|prompt|automation|agent/.test(text);
  return true;
}

export function buildMemoryReplay(memories, relationships = [], range = "day", mode = "today") {
  const now = Date.now();
  const windowMs = range === "month" ? 31 * 24 * 60 * 60 * 1000 : range === "week" ? 7 * 24 * 60 * 60 * 1000 : 36 * 60 * 60 * 1000;
  const selected = memories
    .filter((memory) => now - new Date(memory.createdAt).getTime() <= windowMs)
    .filter((memory) => modeFilter(memory, mode))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-14);
  const fallback = selected.length ? selected : memories.filter((memory) => modeFilter(memory, mode)).slice(0, 8).reverse();

  const events = fallback.map((memory, index) => {
    const linked = relationships.filter((item) => item.sourceId === memory.id || item.targetId === memory.id).slice(0, 2);
    return {
      id: memory.id,
      index,
      time: timeLabel(memory.createdAt),
      timestamp: memory.createdAt,
      title: memory.title,
      type: memory.type,
      emotion: memory.emotions?.[0] || "neutral",
      importanceScore: memory.importanceScore || memory.aiScore || 60,
      productivityScore: /focus|productive|coding|study/i.test(`${memory.title} ${memory.content}`) ? 86 : 62,
      body: memory.summary || memory.content,
      narration: `${memory.title} enters the replay as a ${memory.emotions?.[0] || "neutral"} ${memory.type} memory.`,
      relationships: linked,
      isActive: index === 0,
    };
  });

  const emotionalArc = events.map((event) => event.emotion);
  const strongest = [...events].sort((a, b) => b.importanceScore - a.importanceScore)[0];
  const bestMoment = [...events].sort((a, b) => b.importanceScore + b.productivityScore - (a.importanceScore + a.productivityScore))[0];
  const deepFocus = events.find((event) => /focus|deep work|productive|coding/i.test(`${event.title} ${event.body}`));
  const creativeSpike = events.find((event) => /idea|startup|creative|ai/i.test(`${event.title} ${event.body}`));
  const relationshipMoment = events.find((event) => event.relationships.length);

  return {
    range,
    mode,
    title: `${range[0].toUpperCase()}${range.slice(1)} memory replay`,
    narration: strongest
      ? `Your ${range} moved through ${events.length} meaningful memory signals. The strongest moment was ${strongest.title}, carrying a ${strongest.emotion} signal.`
      : "No replayable memories yet. Add memories, places, voice notes, or screenshots to build a cinematic journey.",
    emotionalArc,
    events,
    highlights: [
      bestMoment ? { label: "Best moment", title: bestMoment.title, body: bestMoment.body } : null,
      deepFocus ? { label: "Deep focus period", title: deepFocus.title, body: deepFocus.body } : null,
      creativeSpike ? { label: "Creative spike detected", title: creativeSpike.title, body: creativeSpike.body } : null,
      relationshipMoment ? { label: "Memory relationship detected", title: relationshipMoment.title, body: relationshipMoment.relationships[0]?.reason || relationshipMoment.body } : null,
    ].filter(Boolean),
    controls: {
      modes: ["today", "weekly", "monthly", "deep-focus", "creative", "travel", "ai-idea"],
      speeds: [0.75, 1, 1.5, 2],
      fullscreen: true,
    },
    recap: {
      productivity: Math.round(events.reduce((sum, event) => sum + event.productivityScore, 0) / Math.max(1, events.length)),
      emotional: emotionalArc[0] || "neutral",
      placeJourney: events.filter((event) => event.type === "place").map((event) => event.title),
    },
  };
}
