import { scoreFocusText, scoreProductivityText } from "./activityAnalysisEngine.js";

function memoryText(memory) {
  return `${memory.title} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""}`;
}

function hourBucket(date) {
  const hour = new Date(date).getHours();
  if (hour < 6) return "Late night";
  if (hour < 10) return "Morning";
  if (hour < 13) return "10AM-1PM";
  if (hour < 18) return "Afternoon";
  if (hour < 22) return "Evening";
  return "Night";
}

export function detectProductivityWindow(memories = []) {
  const buckets = new Map();
  memories.forEach((memory) => {
    const bucket = hourBucket(memory.createdAt || memory.timestamp);
    const score = Number(memory.aiScore || memory.importanceScore || 50) + scoreProductivityText(memoryText(memory)) * 0.25;
    buckets.set(bucket, (buckets.get(bucket) || 0) + score);
  });
  return [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "10AM-1PM";
}

export function analyzeProductivity(memories = []) {
  const focusMemories = memories.filter((memory) => /focus|deep work|productive|code|study|build/i.test(memoryText(memory)));
  const distractionMemories = memories.filter((memory) => /scroll|distract|burnout|tired|blocked|social/i.test(memoryText(memory)));
  const creativeMemories = memories.filter((memory) => /idea|startup|creative|design|brainstorm|ai/i.test(memoryText(memory)));
  const window = detectProductivityWindow(memories);
  const focusScore = Math.round(
    focusMemories.length
      ? focusMemories.reduce((sum, memory) => sum + scoreFocusText(memoryText(memory)), 0) / focusMemories.length
      : 72,
  );
  const productivityScore = Math.round(
    memories.length
      ? memories.reduce((sum, memory) => sum + scoreProductivityText(memoryText(memory)), 0) / memories.length
      : 70,
  );
  const burnoutRisk = Math.max(8, Math.min(92, distractionMemories.length * 15 + (window === "Late night" ? 18 : 0)));

  return {
    focusScore,
    productivityScore,
    creativityScore: Math.min(98, 62 + creativeMemories.length * 6),
    burnoutRisk,
    peakWindow: window,
    focusStreakSignals: focusMemories.length,
    creativeSpikeSignals: creativeMemories.length,
    distractionSignals: distractionMemories.length,
    insights: [
      {
        title: `Peak productivity window: ${window}`,
        body: `Your strongest automatic memory signals currently cluster around ${window}.`,
        confidence: Math.min(96, 70 + focusMemories.length * 4),
      },
      {
        title: "Creative activity index",
        body: creativeMemories.length
          ? `${creativeMemories.length} memories connect to ideas, AI, design, or startup thinking.`
          : "Creative signals will appear here as NeuroNest captures more ideas.",
        confidence: Math.min(94, 58 + creativeMemories.length * 7),
      },
      {
        title: burnoutRisk > 55 ? "Burnout pattern watch" : "Focus rhythm stable",
        body: burnoutRisk > 55
          ? "Recent signals include late, distracted, or blocked activity. Keep sessions shorter and intentional."
          : "Current focus signals look stable enough for proactive deep-work reminders.",
        confidence: Math.min(91, 52 + Math.abs(55 - burnoutRisk)),
      },
    ],
  };
}
