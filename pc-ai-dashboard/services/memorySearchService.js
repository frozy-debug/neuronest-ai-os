const STOP_TERMS = new Set([
  "about",
  "after",
  "again",
  "also",
  "any",
  "are",
  "can",
  "did",
  "does",
  "for",
  "from",
  "have",
  "how",
  "know",
  "memory",
  "memories",
  "show",
  "tell",
  "that",
  "the",
  "there",
  "this",
  "what",
  "when",
  "where",
  "which",
  "who",
  "with",
  "you",
  "your",
]);

function flattenMetadata(value, depth = 0) {
  if (!value || depth > 2) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => flattenMetadata(item, depth + 1));
  if (typeof value === "object") return Object.entries(value)
    .filter(([key]) => !/secret|token|key|credential|password/i.test(key))
    .flatMap(([key, item]) => [key, ...flattenMetadata(item, depth + 1)]);
  return [];
}

export function normalizeSearchText(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function memorySearchText(memory = {}) {
  const metadata = memory.metadata || {};
  return [
    memory.title,
    memory.content,
    memory.body,
    memory.summary,
    memory.description,
    memory.meta,
    memory.type,
    memory.kind,
    Array.isArray(memory.tags) ? memory.tags.join(" ") : memory.tags,
    Array.isArray(memory.emotions) ? memory.emotions.join(" ") : memory.emotions,
    Array.isArray(memory.people) ? memory.people.join(" ") : memory.people,
    memory.location?.label,
    memory.location?.name,
    memory.location?.address,
    metadata.ocrText,
    metadata.extractedText,
    metadata.voiceTranscript,
    metadata.transcript,
    metadata.aiSummary,
    metadata.imageCaption,
    metadata.placeName,
    ...flattenMetadata(metadata),
  ]
    .filter(Boolean)
    .join(" ");
}

export function extractQueryTerms(query = "") {
  const normalized = normalizeSearchText(query);
  const terms = normalized
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !STOP_TERMS.has(term));
  return [...new Set(terms)].slice(0, 12);
}

function includesTerm(haystack, term) {
  if (!term) return false;
  if (haystack.includes(term)) return true;
  if (term.length < 4) return false;
  return haystack.split(/\s+/).some((token) => token.startsWith(term) || term.startsWith(token));
}

export function searchMemoriesByKeyword({ query = "", memories = [], limit = 8 } = {}) {
  const terms = extractQueryTerms(query);
  const normalizedQuery = normalizeSearchText(query);
  if (!terms.length && !normalizedQuery) return [];

  return memories
    .map((memory) => {
      const searchable = normalizeSearchText(memorySearchText(memory));
      if (!searchable) return null;
      const matchedTerms = terms.filter((term) => includesTerm(searchable, term));
      const phraseMatch = normalizedQuery.length >= 3 && searchable.includes(normalizedQuery);
      if (!matchedTerms.length && !phraseMatch) return null;
      const titleText = normalizeSearchText(memory.title || "");
      const summaryText = normalizeSearchText(memory.summary || "");
      const titleBoost = matchedTerms.some((term) => includesTerm(titleText, term)) ? 18 : 0;
      const summaryBoost = matchedTerms.some((term) => includesTerm(summaryText, term)) ? 8 : 0;
      const coverage = terms.length ? matchedTerms.length / terms.length : 1;
      const score = Math.min(99, Math.round(48 + coverage * 34 + matchedTerms.length * 5 + titleBoost + summaryBoost + (phraseMatch ? 14 : 0)));
      return {
        memory,
        similarity: score / 100,
        score,
        provider: "keyword-fallback",
        matchedTerms,
        reason: matchedTerms.length ? `matched: ${matchedTerms.join(", ")}` : "exact phrase match",
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || new Date(b.memory.updatedAt || b.memory.createdAt || 0) - new Date(a.memory.updatedAt || a.memory.createdAt || 0))
    .slice(0, limit);
}

export function mergeMemorySearchMatches(primary = [], fallback = [], limit = 8) {
  const byId = new Map();
  for (const match of [...fallback, ...primary]) {
    const id = match?.memory?.id;
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing || Number(match.score || 0) > Number(existing.score || 0)) {
      byId.set(id, match);
    } else if (existing && match.provider && !String(existing.provider || "").includes(match.provider)) {
      existing.provider = `${existing.provider}+${match.provider}`;
    }
  }
  return [...byId.values()]
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, limit);
}
