function textOf(memory) {
  return `${memory.title} ${memory.content} ${memory.summary} ${memory.tags?.join(" ")} ${memory.emotions?.join(" ")}`.toLowerCase();
}

function count(memories, pattern) {
  return memories.filter((memory) => pattern.test(textOf(memory))).length;
}

function average(values) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length));
}

export function detectLifePatterns(memories, relationships = []) {
  const hourScores = new Map();
  memories.forEach((memory) => {
    const hour = new Date(memory.createdAt).getHours();
    hourScores.set(hour, (hourScores.get(hour) || 0) + (memory.importanceScore || memory.aiScore || 50));
  });
  const peakHour = [...hourScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const cafeCount = count(memories, /cafe|coffee|workspace/);
  const workoutCount = count(memories, /gym|workout|fitness|health/);
  const ideaCount = count(memories, /idea|startup|ai|creative|build/);
  const lateNight = memories.filter((memory) => new Date(memory.createdAt).getHours() >= 22).length;
  const heavyCount = memories.filter((memory) => (memory.emotions || []).includes("heavy")).length;
  const focusScores = memories.filter((memory) => /focus|productive|deep work|coding/.test(textOf(memory))).map((memory) => memory.importanceScore || 60);

  return [
    peakHour !== null
      ? {
      title: `Highest focus window around ${String(peakHour).padStart(2, "0")}:00`,
      body: `Your strongest memory scores cluster near ${peakHour}:00, suggesting a reliable productivity window.`,
      type: "productivity-window",
      confidence: Math.min(94, 45 + memories.length * 4),
      evidenceCount: memories.length,
    }
      : null,
    cafeCount && ideaCount
      ? {
          title: "Cafe environments improve creative recall",
          body: `${cafeCount} cafe/workspace signals overlap with ${ideaCount} AI or idea memories.`,
          type: "place-productivity",
          confidence: Math.min(94, 45 + (cafeCount + ideaCount) * 6),
          evidenceCount: cafeCount + ideaCount,
        }
      : null,
    workoutCount && ideaCount
      ? {
          title: "Workout-to-idea loop detected",
          body: "Fitness memories and creative memories are both active, indicating movement may support idea capture.",
          type: "habit-loop",
          confidence: Math.min(92, 42 + (workoutCount + ideaCount) * 6),
          evidenceCount: workoutCount + ideaCount,
        }
      : null,
    lateNight
      ? {
          title: "Late-night creativity pattern",
          body: `${lateNight} memory events happen late at night. Watch for creative spikes and fatigue tradeoffs.`,
          type: "sleep-work-rhythm",
          confidence: Math.min(90, 45 + lateNight * 7),
          evidenceCount: lateNight,
        }
      : null,
    heavyCount
      ? {
          title: "Burnout signal monitor",
          body: `${heavyCount} heavier emotional memories were detected. Balance deep work with recovery cues.`,
          type: "burnout-signal",
          confidence: Math.min(90, 45 + heavyCount * 8),
          evidenceCount: heavyCount,
        }
      : null,
    relationships.length
      ? {
      title: "Relationship density",
      body: `${relationships.length} memory relationships are currently connecting places, ideas, routines, and reflections.`,
      type: "recurring-themes",
      confidence: Math.min(92, 58 + relationships.length),
      evidenceCount: relationships.length,
    }
      : null,
    focusScores.length
      ? {
      title: "Focus quality average",
      body: `Your focus-related memory strength averages ${average(focusScores)}%.`,
      type: "deep-focus-cycle",
      confidence: Math.min(92, 45 + focusScores.length * 7),
      evidenceCount: focusScores.length,
    }
      : null,
  ].filter(Boolean);
}

export function forgottenMemorySuggestions(memories, relationships = []) {
  const now = Date.now();
  return memories
    .map((memory) => {
      const ageDays = Math.round((now - new Date(memory.createdAt).getTime()) / 86_400_000);
      const density = relationships.filter((item) => item.sourceId === memory.id || item.targetId === memory.id).length;
      const score = ageDays * 1.4 + (memory.importanceScore || 50) * 0.55 + density * 8;
      return {
        id: memory.id,
        title: memory.title,
        body: memory.summary || memory.content,
        ageDays,
        resurfacingScore: Math.round(score),
        reason: density ? `${density} active relationships make this worth revisiting.` : "Older memory with useful context.",
      };
    })
    .filter((item) => item.ageDays >= 1)
    .sort((a, b) => b.resurfacingScore - a.resurfacingScore)
    .slice(0, 6);
}
