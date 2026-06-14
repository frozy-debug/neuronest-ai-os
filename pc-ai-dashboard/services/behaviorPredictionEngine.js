import { attachConfidence, evidenceFromMemory } from "./intelligenceConfidenceEngine.js";

function textOf(memory) {
  return `${memory.title} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""}`.toLowerCase();
}

function bucketHour(date) {
  const hour = new Date(date).getHours();
  if (hour < 6) return "late night";
  if (hour < 10) return "morning";
  if (hour < 13) return "10 AM - 1 PM";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "night";
}

function mostCommon(values, fallback) {
  const counts = new Map();
  values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || fallback;
}

export function predictBehavior({ memories = [], relationships = [], resurfacing = [] } = {}) {
  const focusMemories = memories.filter((memory) => /focus|deep work|productive|coding|study|build/.test(textOf(memory)));
  const ideaMemories = memories.filter((memory) => /idea|startup|creative|brainstorm|ai/.test(textOf(memory)));
  const heavyMemories = memories.filter((memory) => /stress|tired|blocked|burnout|doom|distract/.test(textOf(memory)));
  const goalMemories = memories.filter((memory) => /goal|plan|project|todo|launch|finish/.test(textOf(memory)));
  const focusWindow = mostCommon(focusMemories.map((memory) => bucketHour(memory.createdAt || memory.timestamp)), "10 AM - 1 PM");
  const ideaWindow = mostCommon(ideaMemories.map((memory) => bucketHour(memory.createdAt || memory.timestamp)), "evening");
  const focusEvidence = focusMemories.slice(0, 4).map((memory) => evidenceFromMemory(memory, "focus signal"));
  const ideaEvidence = ideaMemories.slice(0, 4).map((memory) => evidenceFromMemory(memory, "creative signal"));
  const burnoutEvidence = heavyMemories.slice(0, 4).map((memory) => evidenceFromMemory(memory, "burnout/distraction signal"));
  const goalEvidence = goalMemories.slice(0, 4).map((memory) => evidenceFromMemory(memory, "goal/project signal"));

  return [
    attachConfidence(
      {
        title: `Likely focus period: ${focusWindow}`,
        body: `Your deep-work memories most often cluster around ${focusWindow}.`,
        type: "focus-window",
      },
      { evidence: focusEvidence, relationships, memoryCount: focusMemories.length },
    ),
    attachConfidence(
      {
        title: `Idea generation window: ${ideaWindow}`,
        body: `Startup and creative memories are most likely to resurface around ${ideaWindow}.`,
        type: "idea-window",
      },
      { evidence: ideaEvidence, relationships, memoryCount: ideaMemories.length },
    ),
    attachConfidence(
      {
        title: heavyMemories.length ? "Burnout risk watch" : "Burnout risk low",
        body: heavyMemories.length
          ? "Recent heavy or distracted signals suggest NeuroNest should keep proactive nudges calm and rare."
          : "Your current memory graph does not show a strong burnout pattern.",
        type: "burnout-risk",
      },
      { evidence: burnoutEvidence, relationships, memoryCount: heavyMemories.length },
    ),
    attachConfidence(
      {
        title: "Goal completion likelihood",
        body: goalMemories.length
          ? `${Math.min(92, 44 + goalMemories.length * 9)}% likelihood improves if you revive one old project card this week.`
          : "Add goal memories and NeuroNest will start forecasting completion likelihood.",
        type: "goal-likelihood",
      },
      { evidence: goalEvidence, relationships, memoryCount: goalMemories.length, semanticMatches: resurfacing },
    ),
  ];
}
