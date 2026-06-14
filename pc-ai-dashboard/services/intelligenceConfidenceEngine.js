export function evidenceFromMemory(memory, reason = "memory evidence") {
  return {
    id: memory.id,
    title: memory.title,
    type: memory.type,
    reason,
    score: Math.round(memory.importanceScore || memory.aiScore || 60),
  };
}

export function scoreInsightConfidence({ evidence = [], relationships = [], memoryCount = 0, semanticMatches = [] } = {}) {
  if (!evidence.length && !relationships.length && !memoryCount && !semanticMatches.length) return 0;
  const evidenceScore = Math.min(34, evidence.length * 7);
  const relationshipScore = Math.min(28, relationships.length * 4);
  const memoryScore = Math.min(20, memoryCount * 1.25);
  const semanticScore = Math.min(16, semanticMatches.length * 5);
  return Math.min(98, Math.round(20 + evidenceScore + relationshipScore + memoryScore + semanticScore));
}

export function attachConfidence(insight, context = {}) {
  const confidence = insight.confidence || scoreInsightConfidence(context);
  return {
    ...insight,
    confidence,
    evidenceSources: (context.evidence || []).slice(0, 5),
    memoryReferences: (context.evidence || []).slice(0, 5).map((item) => item.id),
  };
}

export function summarizeEvidence(evidence = []) {
  if (!evidence.length) return "Evidence will strengthen as more memories are captured.";
  return evidence.slice(0, 3).map((item) => `${item.title} (${item.reason})`).join(", ");
}
