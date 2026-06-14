function isCloseInTime(a, b, hours = 10) {
  return Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) <= hours * 60 * 60 * 1000;
}

function sharedSignal(a, b) {
  const tags = (a.tags || []).filter((tag) => (b.tags || []).includes(tag));
  const emotions = (a.emotions || []).filter((emotion) => (b.emotions || []).includes(emotion));
  return { tags, emotions, count: tags.length + emotions.length };
}

export function buildContextChains(memories, relationships = []) {
  const sorted = [...memories].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const chains = [];

  sorted.forEach((memory) => {
    const nearby = sorted
      .filter((candidate) => candidate.id !== memory.id && isCloseInTime(memory, candidate))
      .filter((candidate) => sharedSignal(memory, candidate).count || relationships.some((item) =>
        (item.sourceId === memory.id && item.targetId === candidate.id) || (item.targetId === memory.id && item.sourceId === candidate.id),
      ))
      .slice(0, 5);

    if (!nearby.length) return;

    const chain = [memory, ...nearby].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    chains.push({
      id: `chain_${memory.id}`,
      title: `${chain[0].title} -> ${chain[chain.length - 1].title}`,
      memoryIds: chain.map((item) => item.id),
      steps: chain.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        timestamp: item.createdAt,
        emotion: item.emotions?.[0] || "neutral",
      })),
      summary: chain.map((item) => item.title).join(" -> "),
      confidence: Math.min(96, 55 + chain.length * 8),
    });
  });

  const seen = new Set();
  return chains
    .filter((chain) => {
      const key = chain.memoryIds.join("-");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

export function fuseAssistantContext({ semanticMatches = [], chains = [], patterns = [] }) {
  const topMatch = semanticMatches[0]?.memory;
  const chain = chains.find((item) => topMatch && item.memoryIds.includes(topMatch.id)) || chains[0];
  const pattern = patterns[0];

  return {
    topMemory: topMatch || null,
    chain: chain || null,
    pattern: pattern || null,
    summary: [
      topMatch ? `${topMatch.title} is the strongest memory match.` : "",
      chain ? `It belongs to a memory chain: ${chain.summary}.` : "",
      pattern ? `Current pattern: ${pattern.title}.` : "",
    ].filter(Boolean).join(" "),
  };
}
