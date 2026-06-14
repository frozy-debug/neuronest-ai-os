function textOf(memory) {
  return `${memory.title} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""} ${memory.emotions?.join(" ") || ""}`.toLowerCase();
}

function addNode(map, id, label, type, score = 70) {
  if (!map.has(id)) map.set(id, { id, label, type, score, count: 0 });
  const node = map.get(id);
  node.count += 1;
  node.score = Math.max(node.score, score);
  return node;
}

function addEdge(edges, source, target, label, confidence = 70) {
  const id = `${source}->${target}:${label}`;
  const existing = edges.get(id);
  if (existing) {
    existing.weight += 1;
    existing.confidence = Math.min(98, Math.max(existing.confidence, confidence + existing.weight * 3));
    return;
  }
  edges.set(id, { id, source, target, label, confidence, weight: 1 });
}

export function buildPersonalKnowledgeGraph({ user, memories = [], relationships = [], dna = null }) {
  const nodes = new Map();
  const edges = new Map();
  const userId = `person:${user?.id || "user"}`;
  addNode(nodes, userId, user?.name || "You", "person", 100);

  const categoryRules = [
    ["habit:deep-focus", "Deep Focus", "habit", /focus|deep work|productive|coding|study/],
    ["habit:creative-work", "Creative Work", "habit", /idea|startup|creative|design|brainstorm|ai/],
    ["habit:fitness", "Fitness", "habit", /gym|workout|fitness|health|run/],
    ["habit:reflection", "Reflection", "habit", /journal|voice|note|reflection|mood/],
    ["goal:startup", "Startup Goals", "goal", /startup|business|launch|pricing|customer|revenue/],
    ["goal:learning", "Learning Goals", "goal", /study|learn|course|research|docs|tutorial/],
    ["activity:cafe-work", "Cafe Work", "activity", /cafe|coffee|workspace/],
    ["activity:travel", "Travel", "activity", /travel|trip|hotel|map|journey/],
  ];

  memories.forEach((memory) => {
    const memoryId = `memory:${memory.id}`;
    const text = textOf(memory);
    addNode(nodes, memoryId, memory.title, memory.type || "memory", memory.importanceScore || memory.aiScore || 60);
    addEdge(edges, userId, memoryId, "remembered", memory.importanceScore || 65);

    (memory.tags || []).slice(0, 5).forEach((tag) => {
      const tagId = `tag:${tag}`;
      addNode(nodes, tagId, tag, "tag", 64);
      addEdge(edges, memoryId, tagId, "tagged", 68);
    });

    (memory.emotions || []).slice(0, 3).forEach((emotion) => {
      const emotionId = `emotion:${emotion}`;
      addNode(nodes, emotionId, emotion, "emotion", 72);
      addEdge(edges, memoryId, emotionId, "felt", 72);
    });

    if (memory.location?.label) {
      const placeId = `place:${memory.location.label}`;
      addNode(nodes, placeId, memory.location.label, "place", 76);
      addEdge(edges, memoryId, placeId, "happened at", 76);
    }

    categoryRules.forEach(([id, label, type, pattern]) => {
      if (!pattern.test(text)) return;
      addNode(nodes, id, label, type, 78);
      addEdge(edges, userId, id, type === "goal" ? "pursues" : "shows", 78);
      addEdge(edges, id, memoryId, "evidence", 72);
    });
  });

  relationships.slice(0, 30).forEach((relationship) => {
    addEdge(edges, `memory:${relationship.sourceId}`, `memory:${relationship.targetId}`, relationship.reason, relationship.confidence);
  });

  if (dna?.identity) {
    addNode(nodes, `identity:${dna.identity}`, dna.identity, "identity", 86);
    addEdge(edges, userId, `identity:${dna.identity}`, "identity profile", 86);
  }

  const nodeList = [...nodes.values()].sort((a, b) => b.score + b.count - (a.score + a.count)).slice(0, 60);
  const nodeIds = new Set(nodeList.map((node) => node.id));
  return {
    nodes: nodeList,
    edges: [...edges.values()].filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)).slice(0, 90),
    stats: {
      people: nodeList.filter((node) => node.type === "person").length,
      habits: nodeList.filter((node) => node.type === "habit").length,
      goals: nodeList.filter((node) => node.type === "goal").length,
      places: nodeList.filter((node) => node.type === "place").length,
      emotions: nodeList.filter((node) => node.type === "emotion").length,
      memories: nodeList.filter((node) => node.id.startsWith("memory:")).length,
      relationships: [...edges.values()].length,
    },
  };
}
