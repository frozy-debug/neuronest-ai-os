function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

function sharedItems(a = [], b = []) {
  return a.filter((item) => b.includes(item));
}

function relationshipReason(source, target, sharedTags, sharedEmotions, sharedWords) {
  const pair = `${source.type}:${target.type}`;
  if (/place:idea|idea:place|place:memory|memory:place/.test(pair)) return "place-memory anchor";
  if (/workout|gym|fitness/i.test(`${source.title} ${target.title} ${source.content} ${target.content}`)) return "movement and focus loop";
  if (sharedTags.length) return `shared tag: ${sharedTags[0]}`;
  if (sharedEmotions.length) return `shared emotion: ${sharedEmotions[0]}`;
  if (sharedWords.length) return `shared theme: ${sharedWords[0]}`;
  return "semantic proximity";
}

export function detectRelationships(memories) {
  const relationships = [];

  for (let i = 0; i < memories.length; i += 1) {
    for (let j = i + 1; j < memories.length; j += 1) {
      const source = memories[i];
      const target = memories[j];
      const sharedTags = sharedItems(source.tags || [], target.tags || []);
      const sharedEmotions = sharedItems(source.emotions || [], target.emotions || []);
      const sourceWords = tokenize(`${source.title} ${source.content}`);
      const targetWords = tokenize(`${target.title} ${target.content}`);
      const sharedWords = sharedItems(sourceWords, targetWords);
      const sameType = source.type === target.type ? 0.12 : 0;
      const placeIdeaBoost = [source.type, target.type].includes("place") && /idea|startup|focus|creative/i.test(`${source.content} ${target.content}`) ? 0.18 : 0;
      const routineBoost = /gym|workout|cafe|coffee|journal|focus/i.test(`${source.title} ${target.title} ${source.content} ${target.content}`) ? 0.14 : 0;
      const rawStrength = 0.22 + sharedTags.length * 0.18 + sharedEmotions.length * 0.11 + Math.min(sharedWords.length, 8) * 0.045 + sameType + placeIdeaBoost + routineBoost;

      if (rawStrength < 0.36) continue;

      relationships.push({
        id: `${source.id}_${target.id}`,
        sourceId: source.id,
        targetId: target.id,
        sourceTitle: source.title,
        targetTitle: target.title,
        sourceType: source.type,
        targetType: target.type,
        reason: relationshipReason(source, target, sharedTags, sharedEmotions, sharedWords),
        strength: Number(Math.min(0.98, rawStrength).toFixed(2)),
        confidence: Math.round(Math.min(98, rawStrength * 100)),
        repeatedSignals: sharedTags.length + sharedEmotions.length + Math.min(sharedWords.length, 8),
      });
    }
  }

  return relationships.sort((a, b) => b.strength - a.strength).slice(0, 40);
}

export function detectBehaviorPatterns(memories, relationships = detectRelationships(memories)) {
  const textFor = (memory) => `${memory.title} ${memory.content} ${memory.tags?.join(" ")}`.toLowerCase();
  const count = (pattern) => memories.filter((memory) => pattern.test(textFor(memory))).length;
  const cafeCount = count(/cafe|coffee/);
  const workoutCount = count(/gym|workout|fitness/);
  const ideaCount = count(/idea|startup|creative|build|ai/);
  const journalCount = count(/journal|reflection|note|voice/);
  const placeRelationships = relationships.filter((item) => item.sourceType === "place" || item.targetType === "place");

  return [
    cafeCount && ideaCount
      ? { title: "Cafe and idea activity overlap", body: `${cafeCount} cafe memories and ${ideaCount} idea memories appear in the current graph.`, confidence: Math.min(94, 45 + (cafeCount + ideaCount) * 6), evidenceCount: cafeCount + ideaCount }
      : null,
    workoutCount && ideaCount
      ? { title: "Movement and creative activity overlap", body: `${workoutCount} workout memories and ${ideaCount} idea memories appear in the current graph.`, confidence: Math.min(92, 42 + (workoutCount + ideaCount) * 6), evidenceCount: workoutCount + ideaCount }
      : null,
    journalCount > 1
      ? { title: "Reflection loop is forming", body: `${journalCount} notes, voice reflections, or journals are available as recall anchors.`, confidence: Math.min(92, 45 + journalCount * 7), evidenceCount: journalCount }
      : null,
    placeRelationships.length
      ? { title: "Places are memory anchors", body: `${placeRelationships.length} place relationships are present in your behavior map.`, confidence: Math.min(96, 50 + placeRelationships.length * 5), evidenceCount: placeRelationships.length }
      : null,
  ].filter(Boolean);
}

export function buildRelationshipGraph(memories, relationships = detectRelationships(memories)) {
  const topMemories = memories.slice(0, 18);
  const nodes = topMemories.map((memory, index) => ({
    id: memory.id,
    label: memory.title,
    kind: memory.type,
    mood: memory.emotions?.[0] || "neutral",
    importanceScore: memory.importanceScore,
    x: 160 + Math.cos(index * 0.78) * (120 + (index % 3) * 42),
    y: 150 + Math.sin(index * 0.78) * (92 + (index % 4) * 30),
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = relationships
    .filter((relationship) => nodeIds.has(relationship.sourceId) && nodeIds.has(relationship.targetId))
    .map((relationship) => ({
      source: relationship.sourceId,
      target: relationship.targetId,
      reason: relationship.reason,
      strength: relationship.strength,
      confidence: relationship.confidence,
    }))
    .slice(0, 36);

  return { nodes, edges, relationships: relationships.slice(0, 12), patterns: detectBehaviorPatterns(memories, relationships) };
}
