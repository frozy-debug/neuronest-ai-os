function productivityWindow(memories) {
  const buckets = new Map();
  memories.forEach((memory) => {
    const hour = new Date(memory.createdAt || Date.now()).getHours();
    const bucket = hour < 10 ? "6AM-10AM" : hour < 13 ? "10AM-1PM" : hour < 18 ? "1PM-6PM" : "6PM-12AM";
    buckets.set(bucket, (buckets.get(bucket) || 0) + (memory.importanceScore || memory.aiScore || 50));
  });
  return [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function countWhere(memories, pattern) {
  return memories.filter((memory) => pattern.test(`${memory.title} ${memory.content} ${memory.tags?.join(" ")} ${memory.emotions?.join(" ")}`)).length;
}

function topEmotion(memories) {
  const counts = new Map();
  memories.forEach((memory) => (memory.emotions || ["neutral"]).forEach((emotion) => counts.set(emotion, (counts.get(emotion) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

export function generateInsightCards(memories, relationships = []) {
  const focusWindow = productivityWindow(memories);
  const cafeCount = countWhere(memories, /cafe|coffee/i);
  const workoutCount = countWhere(memories, /gym|workout|fitness/i);
  const ideaCount = countWhere(memories, /idea|startup|creative|ai|build/i);
  const placeRelationships = relationships.filter((item) => item.sourceType === "place" || item.targetType === "place");
  const emotion = topEmotion(memories);

  const insights = [];
  if (focusWindow && memories.length >= 2) {
    insights.push({
      title: `Peak focus: ${focusWindow}`,
      body: `Your strongest memory and productivity cluster currently appears around ${focusWindow}.`,
      signal: "Productivity timing",
      strength: Math.min(94, 50 + memories.length * 4),
      evidenceCount: memories.length,
    });
  }
  if (cafeCount && ideaCount) {
    insights.push({
      title: "Creative place pattern",
      body: `${cafeCount} cafe-linked memories coexist with ${ideaCount} idea or AI memories.`,
      signal: "Repeated places",
      strength: Math.min(94, 45 + (cafeCount + ideaCount) * 6),
      evidenceCount: cafeCount + ideaCount,
    });
  }
  if (workoutCount && ideaCount) {
    insights.push({
      title: "Movement to focus loop",
      body: `${workoutCount} workout memories and ${ideaCount} idea memories create a possible movement-to-creativity relationship worth tracking.`,
      signal: "Behavior pattern",
      strength: Math.min(90, 42 + (workoutCount + ideaCount) * 5),
      evidenceCount: workoutCount + ideaCount,
    });
  }
  if (emotion) {
    const emotionCount = memories.filter((memory) => (memory.emotions || []).includes(emotion)).length;
    insights.push({
      title: `Mood trend: ${emotion}`,
      body: `Recent memories lean ${emotion}, based on tags, places, text, and relationship density.`,
      signal: "Emotional pattern",
      strength: Math.min(92, 45 + emotionCount * 7),
      evidenceCount: emotionCount,
    });
  }
  if (relationships.length) {
    insights.push({
      title: "Relationship graph density",
      body: `${relationships.length} semantic relationships and ${placeRelationships.length} place anchors are active in your second brain.`,
      signal: "Memory graph",
      strength: Math.min(94, 58 + relationships.length),
      evidenceCount: relationships.length,
    });
  }
  return insights;
}

export function generateProactiveNotifications(memories, relationships = []) {
  const focusWindow = productivityWindow(memories);
  const ideaCount = countWhere(memories, /idea|startup|creative|ai|build/i);
  const cafeRelationship = relationships.find((item) => /cafe|coffee|place/i.test(`${item.sourceTitle} ${item.targetTitle} ${item.reason}`));

  const notifications = [];
  if (focusWindow && memories.length >= 3) {
    notifications.push({
      title: "Focus window active",
      body: `You often focus best around ${focusWindow}. This is a good time to protect deep work.`,
      confidence: Math.min(92, 48 + memories.length * 4),
      evidenceCount: memories.length,
    });
  }
  if (cafeRelationship) {
    notifications.push({
      title: "Productive place reminder",
      body: "A cafe/place relationship is linked with idea memories in your graph.",
      confidence: cafeRelationship.confidence,
      evidenceCount: cafeRelationship.repeatedSignals || 1,
    });
  }
  if (ideaCount > 2) {
    notifications.push({
      title: "Idea density rising",
      body: `${ideaCount} creative memories are now clustered in your graph.`,
      confidence: Math.min(94, 50 + ideaCount * 6),
      evidenceCount: ideaCount,
    });
  }
  return notifications;
}

export function buildMemoryStream(memories, relationships = []) {
  return generateInsightCards(memories, relationships).map((insight, index) => ({
    label: insight.signal,
    title: insight.title,
    body: insight.body,
    confidence: insight.strength,
    time: "Generated now",
    link: relationships[index]?.reason || "AI memory engine",
  }));
}
