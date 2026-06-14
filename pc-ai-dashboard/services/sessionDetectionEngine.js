import { analyzeProductivity } from "./productivityAnalysisEngine.js";

function textOf(item) {
  return `${item.title || ""} ${item.content || item.body || ""} ${item.summary || ""} ${item.tags?.join(" ") || ""}`.toLowerCase();
}

export function detectSessionType(text, durationMs = 0) {
  const clean = String(text || "").toLowerCase();
  if (/startup|business|launch|customer|pricing/.test(clean)) return "startup work session";
  if (/study|learn|course|exam|research/.test(clean)) return "study session";
  if (/game|gaming|match|play/.test(clean)) return "gaming session";
  if (/design|ui|ux|figma|animation|brand/.test(clean)) return "creative session";
  if (/travel|route|hotel|map|trip/.test(clean)) return "travel period";
  if (/social|chat|message|friend|call/.test(clean)) return "social activity";
  if (/idea|brainstorm|concept|ai/.test(clean)) return "brainstorming session";
  if (/focus|deep work|code|build|deploy|task|productive/.test(clean) || durationMs > 25 * 60 * 1000) return "deep focus period";
  return "active work session";
}

export function createSessionSummary(events = []) {
  const text = events.map((event) => `${event.title || ""} ${event.summary || event.text || ""} ${event.context || ""}`).join(" ");
  const durationMs = events.reduce((max, event) => Math.max(max, Number(event.durationMs || event.metadata?.durationMs || 0)), 0);
  const sessionType = detectSessionType(text, durationMs);
  const minutes = Math.max(1, Math.round(durationMs / 60000));
  return {
    type: sessionType,
    title: `${minutes >= 45 ? "Extended" : minutes >= 15 ? "Focused" : "Short"} ${sessionType}`,
    summary: `${minutes}-minute ${sessionType} detected from ${events.length} activity signal${events.length === 1 ? "" : "s"}.`,
    durationMs,
    tags: [...new Set(["session", sessionType.split(" ")[0], ...events.flatMap((event) => event.tags || [])])].slice(0, 12),
  };
}

export function detectSmartSessions(memories = []) {
  const sorted = [...memories].sort((a, b) => new Date(a.createdAt || a.timestamp) - new Date(b.createdAt || b.timestamp));
  const groups = [];

  sorted.forEach((memory) => {
    const timestamp = new Date(memory.createdAt || memory.timestamp).getTime();
    const last = groups.at(-1);
    if (!last || timestamp - last.lastAt > 2 * 60 * 60 * 1000) {
      groups.push({ firstAt: timestamp, lastAt: timestamp, memories: [memory] });
    } else {
      last.lastAt = timestamp;
      last.memories.push(memory);
    }
  });

  const productivity = analyzeProductivity(memories);
  return groups
    .filter((group) => group.memories.length >= 2)
    .slice(-8)
    .reverse()
    .map((group) => {
      const combined = group.memories.map(textOf).join(" ");
      const durationMs = Math.max(15 * 60 * 1000, group.lastAt - group.firstAt);
      const type = detectSessionType(combined, durationMs);
      const score = Math.min(98, Math.round(group.memories.reduce((sum, memory) => sum + Number(memory.aiScore || memory.importanceScore || 55), 0) / group.memories.length));
      return {
        id: `session_${group.firstAt}`,
        type,
        title: `${type[0].toUpperCase()}${type.slice(1)} detected`,
        summary: `${group.memories.length} connected memories formed a ${Math.round(durationMs / 60000)} minute ${type}.`,
        startedAt: new Date(group.firstAt).toISOString(),
        endedAt: new Date(group.lastAt).toISOString(),
        durationMs,
        productivityScore: Math.round((score + productivity.productivityScore) / 2),
        emotionalState: group.memories.flatMap((memory) => memory.emotions || [])[0] || "neutral",
        tags: [...new Set(group.memories.flatMap((memory) => memory.tags || []))].slice(0, 10),
        replayEventIds: group.memories.map((memory) => memory.id).slice(0, 8),
      };
    });
}
