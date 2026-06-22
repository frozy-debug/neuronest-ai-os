const TOPIC_PATTERNS = [
  ["AI", /\b(ai|openai|groq|llm|machine learning|model|embedding|chatbot|assistant|agent)\b/i],
  ["NeuroNest", /\b(neuronest|second brain|memory os|life os)\b/i],
  ["Startup", /\b(startup|saas|founder|business|customer|pricing|mvp|launch)\b/i],
  ["Coding", /\b(code|coding|bug|fix|github|render|deploy|server|api|frontend|backend|database)\b/i],
  ["Product Design", /\b(design|ui|ux|logo|animation|figma|layout|profile|dashboard)\b/i],
  ["Fitness", /\b(gym|workout|fitness|run|training|health|weight|kg|diet)\b/i],
  ["Study", /\b(study|learn|course|book|reading|notes|exam|practice)\b/i],
  ["Travel", /\b(travel|trip|place|hotel|airport|journey|visited)\b/i],
  ["Productivity", /\b(productive|focus|deep work|routine|habit|task|mission|goal)\b/i],
];

const DECISION_WORDS = /\b(decided|decision|started|start|chose|choose|built|build|launch|launched|deploy|deployed|fixed|create|created|made|switch|switched|quit|joined|buy|bought)\b/i;
const SUCCESS_WORDS = /\b(done|completed|shipped|launched|fixed|deployed|success|working|passed|solved|finished)\b/i;
const PROBLEM_WORDS = /\b(failed|blocked|issue|problem|error|stuck|not working|abandoned|missed|delayed)\b/i;
const POSITIVE_WORDS = /\b(happy|calm|excited|motivated|great|good|amazing|proud|love|inspired|clear|best|win)\b/i;
const STRESS_WORDS = /\b(stress|stressed|anxious|burnout|tired|drained|pressure|overwhelmed|argument|sad|angry|problem)\b/i;
const MONTHS = new Map([
  ["january", "01"],
  ["february", "02"],
  ["march", "03"],
  ["april", "04"],
  ["may", "05"],
  ["june", "06"],
  ["july", "07"],
  ["august", "08"],
  ["september", "09"],
  ["october", "10"],
  ["november", "11"],
  ["december", "12"],
]);

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function nowIso() {
  return new Date().toISOString();
}

function stableId(...parts) {
  return parts
    .filter(Boolean)
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 150);
}

function asDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function timestampOf(item = {}) {
  return item.timestamp || item.createdAt || item.createdDate || item.updatedAt || item.departureTime || item.arrivalTime || nowIso();
}

function textOf(item = {}) {
  const metadata = item.metadata || {};
  return [
    item.title,
    item.content,
    item.body,
    item.summary,
    item.description,
    item.meta,
    item.type,
    item.kind,
    item.category,
    item.placeName,
    item.address,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags,
    Array.isArray(item.emotions) ? item.emotions.join(" ") : item.emotions,
    metadata.ocrText,
    metadata.extractedText,
    metadata.voiceTranscript,
    metadata.transcript,
    metadata.aiSummary,
    metadata.imageCaption,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(value, max = 160) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

function dayKey(value) {
  return asDate(value).toISOString().slice(0, 10);
}

function monthKey(value) {
  return asDate(value).toISOString().slice(0, 7);
}

function weekKey(value) {
  const date = asDate(value);
  const first = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const day = Math.floor((date - first) / 86_400_000);
  return `${date.getUTCFullYear()}-W${String(Math.ceil((day + first.getUTCDay() + 1) / 7)).padStart(2, "0")}`;
}

function yearKey(value) {
  return asDate(value).toISOString().slice(0, 4);
}

function evidenceItem(item = {}, reason = "evidence") {
  return {
    id: String(item.id || item.entryId || item.memoryId || item.sourceId || stableId(item.title, timestampOf(item))),
    type: String(item.type || item.kind || item.sourceType || item.sourceBucket || "memory"),
    title: snippet(item.title || item.sourceTitle || item.placeName || item.content || item.body || "Evidence", 120),
    timestamp: timestampOf(item),
    reason,
  };
}

function uniqueBy(items = [], keyFn, limit = 1000) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function confidenceFromEvidence(evidenceCount, spread = 1, strength = 0) {
  if (!evidenceCount) return 0;
  return clamp(36 + evidenceCount * 7 + Math.min(spread, 45) * 0.5 + strength * 0.3, 40, 96);
}

function normalizeRecords({ memories = [], records = [], chats = [], places = [] } = {}) {
  const rows = [
    ...memories.map((item) => ({ ...item, sourceBucket: "memory" })),
    ...records.map((item) => ({ ...item, sourceBucket: "record" })),
    ...chats.map((chat, index) => ({
      ...chat,
      id: chat.id || `chat_${index}`,
      title: chat.role === "user" ? "User conversation memory" : "AI assistant response",
      content: chat.content || chat.message || "",
      type: "ai-chat",
      sourceBucket: "chat",
    })),
    ...places.map((place, index) => ({
      ...place,
      id: place.id || place.memoryId || `place_${index}`,
      title: place.placeName || place.title || "Place visit",
      content: [place.placeName, place.category, place.address].filter(Boolean).join(" "),
      type: "place",
      timestamp: place.departureTime || place.arrivalTime || place.createdAt,
      sourceBucket: "place",
    })),
  ].filter((item) => textOf(item));

  return uniqueBy(rows, (item) => String(item.id || `${item.sourceBucket}_${textOf(item).slice(0, 60)}_${timestampOf(item)}`), 2000)
    .sort((a, b) => asDate(b.timestamp || b.createdAt) - asDate(a.timestamp || a.createdAt));
}

function extractTopics(record) {
  const text = textOf(record);
  return TOPIC_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([topic]) => topic);
}

function extractProjects(record) {
  const text = textOf(record);
  const projects = [];
  if (/\bneuronest\b/i.test(text)) projects.push("NeuroNest");
  if (/\b(startup|saas|mvp|launch)\b/i.test(text)) projects.push("Startup");
  if (/\b(render|github|deploy|api|server|database)\b/i.test(text)) projects.push("Deployment");
  if (/\b(profile|dashboard|ui|animation|mobile|pc)\b/i.test(text)) projects.push("Product Experience");
  return [...new Set(projects)];
}

function addNode(nodes, id, node) {
  if (!id) return null;
  if (!nodes.has(id)) {
    nodes.set(id, {
      id,
      label: node.label,
      type: node.type,
      weight: 0,
      evidenceCount: 0,
      evidence: [],
      metadata: node.metadata || {},
    });
  }
  const current = nodes.get(id);
  current.weight = clamp((current.weight || 0) + Number(node.weight || 1), 1, 1000);
  current.evidenceCount += Number(node.evidenceCount || 1);
  if (node.evidence) current.evidence = uniqueBy([...current.evidence, ...node.evidence], (item) => item.id, 8);
  return current;
}

function addEdge(edges, from, to, label, evidence = []) {
  if (!from || !to || from === to) return;
  const id = `edge_${stableId(from, to, label)}`;
  if (!edges.has(id)) {
    edges.set(id, { id, from, to, label, strength: 0, evidenceCount: 0, evidence: [] });
  }
  const edge = edges.get(id);
  edge.strength = clamp(edge.strength + Math.max(1, evidence.length || 1), 1, 100);
  edge.evidenceCount += Math.max(1, evidence.length || 1);
  edge.evidence = uniqueBy([...edge.evidence, ...evidence], (item) => item.id, 6);
}

function buildKnowledgeGraph({ userId, user, records, goals, relationshipIntelligence, futurePredictions }) {
  const nodes = new Map();
  const edges = new Map();
  const rootId = `person_${userId || "current_user"}`;
  addNode(nodes, rootId, {
    label: user?.name || "You",
    type: "Person",
    weight: 8,
    evidenceCount: records.length,
  });

  for (const record of records.slice(0, 160)) {
    const evidence = [evidenceItem(record, "memory graph evidence")];
    const recordId = `${record.sourceBucket || record.type || "memory"}_${stableId(record.id || record.title || timestampOf(record))}`;
    addNode(nodes, recordId, {
      label: snippet(record.title || record.content || record.body || record.placeName || "Memory", 46),
      type: record.type === "place" || record.placeName ? "Place Memory" : record.type === "ai-chat" ? "Conversation" : "Memory",
      evidence,
    });
    addEdge(edges, rootId, recordId, "remembered", evidence);

    for (const topic of extractTopics(record)) {
      const topicId = `topic_${stableId(topic)}`;
      addNode(nodes, topicId, { label: topic, type: "Topic", weight: 3, evidence });
      addEdge(edges, recordId, topicId, "contains topic", evidence);
    }

    for (const project of extractProjects(record)) {
      const projectId = `project_${stableId(project)}`;
      addNode(nodes, projectId, { label: project, type: "Project", weight: 4, evidence });
      addEdge(edges, recordId, projectId, "supports project", evidence);
    }

    const place = record.placeName || record.metadata?.placeName || record.location?.name || record.location?.label;
    if (place) {
      const placeId = `place_${stableId(place)}`;
      addNode(nodes, placeId, { label: place, type: "Place", weight: 4, evidence });
      addEdge(edges, recordId, placeId, "happened at", evidence);
    }
  }

  for (const goal of goals || []) {
    const evidence = [evidenceItem({ ...goal, type: "goal", timestamp: goal.createdAt }, "declared goal")];
    const goalId = `goal_${stableId(goal.id || goal.title)}`;
    addNode(nodes, goalId, { label: goal.title, type: "Goal", weight: 8, evidence });
    addEdge(edges, rootId, goalId, "declared goal", evidence);
    for (const topic of extractTopics(goal)) {
      const topicId = `topic_${stableId(topic)}`;
      addNode(nodes, topicId, { label: topic, type: "Topic", weight: 2, evidence });
      addEdge(edges, goalId, topicId, "goal topic", evidence);
    }
  }

  for (const person of relationshipIntelligence?.relationships || []) {
    const evidence = (relationshipIntelligence.events || [])
      .filter((event) => event.personName === person.personName)
      .slice(0, 5)
      .map((event) => evidenceItem(event, "relationship event"));
    if (!evidence.length) continue;
    const personId = `person_${stableId(person.personName)}`;
    addNode(nodes, personId, {
      label: person.personName,
      type: "Person",
      weight: Math.max(2, Number(person.interactionCount || 1)),
      evidence,
      metadata: { relationshipType: person.relationshipType, strength: person.relationshipStrength },
    });
    addEdge(edges, rootId, personId, person.relationshipType || "relationship", evidence);
  }

  for (const prediction of futurePredictions?.predictions || []) {
    const evidence = (prediction.evidence || []).slice(0, 5);
    if (!evidence.length) continue;
    const predictionId = `prediction_${stableId(prediction.id || prediction.title)}`;
    addNode(nodes, predictionId, {
      label: prediction.title,
      type: "Prediction",
      weight: Math.max(2, Number(prediction.evidenceCount || evidence.length)),
      evidence,
      metadata: { confidence: prediction.confidence, predictionType: prediction.type },
    });
    addEdge(edges, rootId, predictionId, "forecasted", evidence);
  }

  const nodeList = [...nodes.values()].sort((a, b) => b.weight - a.weight).slice(0, 180);
  const validIds = new Set(nodeList.map((node) => node.id));
  const edgeList = [...edges.values()].filter((edge) => validIds.has(edge.from) && validIds.has(edge.to)).slice(0, 260);
  return {
    nodes: nodeList,
    edges: edgeList,
    stats: {
      nodeCount: nodeList.length,
      edgeCount: edgeList.length,
      topicCount: nodeList.filter((node) => node.type === "Topic").length,
      personCount: nodeList.filter((node) => node.type === "Person").length,
      projectCount: nodeList.filter((node) => node.type === "Project").length,
      evidenceCount: edgeList.reduce((sum, edge) => sum + edge.evidenceCount, 0),
    },
  };
}

function buildDecisions({ userId, records, goals, explicitDecisions = [] }) {
  const fromExplicit = explicitDecisions.slice(0, 40).map((decision) => {
    const evidence = [evidenceItem({ ...decision, type: "life-decision", timestamp: decision.decidedAt || decision.createdAt }, "explicit decision record")];
    const text = textOf(decision);
    const quality = Number(decision.qualityScore || 0) || (decision.outcomeStatus === "success" ? 84 : decision.outcomeStatus === "failure" ? 34 : 58);
    return {
      id: decision.id || `decision_explicit_${stableId(userId, decision.decision || decision.createdAt)}`,
      userId,
      decision: snippet(decision.decision || decision.title || text, 110),
      reason: snippet(decision.reason || "Stored decision reason is empty.", 130),
      expectedOutcome: snippet(decision.expectedOutcome || "Expected outcome is not recorded yet.", 130),
      actualOutcome: snippet(decision.actualOutcome || "No clear outcome evidence yet.", 130),
      qualityScore: clamp(quality),
      confidence: confidenceFromEvidence(evidence.length, 1, quality),
      evidence,
      timestamp: decision.decidedAt || decision.createdAt || decision.updatedAt,
      status: decision.outcomeStatus === "success" ? "supported" : decision.outcomeStatus === "failure" ? "needs-review" : "open",
    };
  });
  const decisionRecords = records.filter((record) => DECISION_WORDS.test(textOf(record)));
  const fromRecords = decisionRecords.slice(0, 24).map((record) => {
    const text = textOf(record);
    const evidence = [evidenceItem(record, "decision signal")];
    const quality = SUCCESS_WORDS.test(text) ? 78 : PROBLEM_WORDS.test(text) ? 42 : 58;
    return {
      id: `decision_${stableId(userId, record.id || record.title || timestampOf(record))}`,
      userId,
      decision: snippet(record.title || text, 110),
      reason: snippet((text.match(/\b(?:because|reason|to)\s+(.{8,120})/i)?.[1]) || "Reason will become clearer as more outcome evidence appears.", 130),
      expectedOutcome: snippet((text.match(/\b(?:so|to|for)\s+(.{8,120})/i)?.[1]) || "Expected outcome inferred from the saved memory context.", 130),
      actualOutcome: SUCCESS_WORDS.test(text)
        ? "Positive outcome evidence is present in the memory text."
        : PROBLEM_WORDS.test(text)
          ? "The memory contains blocker or failure evidence."
          : "No clear outcome evidence yet.",
      qualityScore: quality,
      confidence: confidenceFromEvidence(evidence.length, 1, quality),
      evidence,
      timestamp: timestampOf(record),
      status: SUCCESS_WORDS.test(text) ? "supported" : PROBLEM_WORDS.test(text) ? "needs-review" : "open",
    };
  });

  const fromGoals = (goals || []).slice(0, 20).map((goal) => {
    const evidence = [evidenceItem({ ...goal, type: "goal", timestamp: goal.createdAt }, "declared goal")];
    const progress = Number(goal.progress || 0);
    return {
      id: `decision_goal_${stableId(userId, goal.id || goal.title)}`,
      userId,
      decision: `Committed to goal: ${goal.title}`,
      reason: goal.description ? snippet(goal.description, 130) : "The user explicitly created this goal in Life OS.",
      expectedOutcome: goal.targetDate ? `Target date: ${goal.targetDate}` : "Complete or advance this declared goal.",
      actualOutcome: progress >= 100 ? "Goal is marked complete." : progress > 0 ? `${progress}% progress recorded.` : "No progress outcome recorded yet.",
      qualityScore: clamp(45 + progress * 0.45),
      confidence: confidenceFromEvidence(evidence.length, 1, progress),
      evidence,
      timestamp: goal.createdAt || goal.updatedAt,
      status: progress >= 100 ? "supported" : progress > 0 ? "active" : "open",
    };
  });

  return uniqueBy([...fromExplicit, ...fromRecords, ...fromGoals], (item) => item.id, 40)
    .sort((a, b) => asDate(b.timestamp) - asDate(a.timestamp));
}

function summarizePeriod(label, items) {
  const topics = new Map();
  const projects = new Map();
  for (const item of items) {
    for (const topic of extractTopics(item)) topics.set(topic, (topics.get(topic) || 0) + 1);
    for (const project of extractProjects(item)) projects.set(project, (projects.get(project) || 0) + 1);
  }
  const topTopic = [...topics.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "memory activity";
  const topProject = [...projects.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const positive = items.filter((item) => POSITIVE_WORDS.test(textOf(item))).length;
  const stress = items.filter((item) => STRESS_WORDS.test(textOf(item))).length;
  const mood = positive > stress ? "positive" : stress > positive ? "stress-aware" : "balanced";
  return {
    label,
    title: topProject ? `${label}: ${topProject}` : `${label}: ${topTopic}`,
    summary: `${items.length} real memory signal${items.length === 1 ? "" : "s"} centered on ${topTopic}${topProject ? ` and ${topProject}` : ""}.`,
    mood,
    evidence: items.slice(0, 8).map((item) => evidenceItem(item, "life story evidence")),
    evidenceCount: items.length,
    confidence: confidenceFromEvidence(items.length, new Set(items.map((item) => dayKey(timestampOf(item)))).size),
  };
}

function buildStories(records) {
  const groupByKey = (fn) => {
    const map = new Map();
    for (const record of records) {
      const key = fn(timestampOf(record));
      map.set(key, [...(map.get(key) || []), record]);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  };

  return {
    daily: groupByKey(dayKey).slice(0, 7).map(([label, items]) => summarizePeriod(label, items)),
    weekly: groupByKey(weekKey).slice(0, 6).map(([label, items]) => summarizePeriod(label, items)),
    monthly: groupByKey(monthKey).slice(0, 12).map(([label, items]) => summarizePeriod(label, items)),
    yearly: groupByKey(yearKey).slice(0, 5).map(([label, items]) => summarizePeriod(label, items)),
  };
}

export function buildMemoryTimeMachine(snapshot = {}, query = "") {
  const records = snapshot.sourceRecords || [];
  const cleanQuery = String(query || "").trim().toLowerCase();
  const monthMatch = cleanQuery.match(/\b(20\d{2})[-/\s]?(\d{1,2})?\b/);
  const namedMonth = [...MONTHS.entries()].find(([name]) => cleanQuery.includes(name));
  const targetMonth = monthMatch
    ? `${monthMatch[1]}${monthMatch[2] ? `-${String(monthMatch[2]).padStart(2, "0")}` : namedMonth ? `-${namedMonth[1]}` : ""}`
    : "";
  const matched = records.filter((record) => {
    const month = monthKey(timestampOf(record));
    if (targetMonth && !month.startsWith(targetMonth)) return false;
    if (!targetMonth && cleanQuery) return textOf(record).toLowerCase().includes(cleanQuery);
    return true;
  });
  const grouped = new Map();
  for (const record of records) {
    const key = monthKey(timestampOf(record));
    grouped.set(key, [...(grouped.get(key) || []), record]);
  }
  const availableMonths = [...grouped.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([label, items]) => ({ label, memoryCount: items.length }));
  return {
    query: query || "",
    availableMonths,
    reconstruction: matched.length
      ? summarizePeriod(targetMonth || cleanQuery || "Memory Time Machine", matched)
      : null,
    events: matched.slice(0, 40).map((record) => ({
      id: record.id,
      title: record.title || record.placeName || "Memory",
      type: record.type || record.kind || record.sourceBucket || "memory",
      timestamp: timestampOf(record),
      summary: snippet(textOf(record), 180),
      evidence: [evidenceItem(record, "time machine event")],
    })),
  };
}

function buildFutureSelf({ userId, futurePredictions, goals }) {
  const predictions = (futurePredictions?.predictions || []).filter((item) => item.evidenceCount > 0);
  if (!predictions.length) return { horizons: [], summary: "", evidencePolicy: "Future Me requires evidence-backed predictions." };
  const top = predictions.slice(0, 8);
  const avgScore = clamp(top.reduce((sum, item) => sum + item.predictionScore, 0) / top.length);
  const avgConfidence = clamp(top.reduce((sum, item) => sum + item.confidence, 0) / top.length);
  const evidence = uniqueBy(top.flatMap((item) => item.evidence || []), (item) => item.id, 8);
  const activeGoal = (goals || []).find((goal) => goal.status !== "completed");
  const horizons = [
    ["1 month", 0],
    ["3 months", -6],
    ["6 months", -12],
    ["1 year", -18],
    ["5 years", -30],
  ].map(([horizon, decay]) => ({
    horizon,
    title: activeGoal ? `${activeGoal.title} trajectory` : top[0].title,
    probability: clamp(avgScore + decay, 1, 96),
    confidence: clamp(avgConfidence + decay * 0.4, 1, 96),
    summary: `If current evidence continues, your strongest trajectory is shaped by ${top.slice(0, 3).map((item) => item.type).join(", ")} signals.`,
    evidence,
  }));
  return {
    summary: `Future Me is based on ${predictions.length} evidence-backed prediction${predictions.length === 1 ? "" : "s"}.`,
    horizons,
    evidencePolicy: "Every horizon is derived from current prediction evidence and confidence decays over longer time ranges.",
  };
}

function buildChiefOfStaff({ goals, futurePredictions, records }) {
  const predictions = futurePredictions?.predictions || [];
  return (goals || [])
    .filter((goal) => goal.status !== "completed")
    .slice(0, 6)
    .map((goal) => {
      const goalText = textOf(goal).toLowerCase();
      const related = records.filter((record) => {
        const recordText = textOf(record).toLowerCase();
        return goalText.split(/\s+/).filter((word) => word.length > 4).some((word) => recordText.includes(word));
      });
      const goalPrediction = predictions.find((prediction) => prediction.metadata?.goalId === goal.id || prediction.title.toLowerCase().includes(goal.title.toLowerCase().slice(0, 14)));
      const evidence = uniqueBy([
        evidenceItem({ ...goal, type: "goal", timestamp: goal.createdAt }, "declared goal"),
        ...(goalPrediction?.evidence || []),
        ...related.slice(0, 4).map((record) => evidenceItem(record, "goal activity")),
      ], (item) => item.id, 8);
      return {
        goalId: goal.id,
        title: goal.title,
        status: goal.status,
        progress: goal.progress,
        completionProbability: goalPrediction?.metadata?.completionProbability || goalPrediction?.predictionScore || clamp(Number(goal.progress || 0) + related.length * 8),
        confidence: confidenceFromEvidence(evidence.length, new Set(evidence.map((item) => dayKey(item.timestamp))).size),
        roadmap: [
          "Clarify the next shippable outcome",
          "Create one small proof task",
          "Capture progress evidence",
          "Review blockers and update probability",
        ],
        delays: related.length ? [] : ["No related activity evidence has appeared yet."],
        recommendedActions: [
          `Move ${goal.title} forward with one 35-minute focused action.`,
          related.length ? "Write a short progress memory after the task." : "Create the first evidence signal for this goal today.",
        ],
        evidence,
      };
    });
}

function buildOpportunities({ records, goals, futurePredictions }) {
  const predictedOpportunities = [
    ...(futurePredictions?.byType?.opportunities || []),
    ...((futurePredictions?.predictions || []).filter((item) => item.type === "opportunity")),
  ];
  const predictionOpportunities = uniqueBy(predictedOpportunities, (item) => item.id || item.title, 20)
    .filter((item) => item.evidenceCount > 0)
    .map((item) => ({
      id: `opportunity_${stableId(item.id || item.title)}`,
      title: item.title,
      recommendation: item.recommendation || item.summary,
      confidence: item.confidence,
      evidence: item.evidence || [],
      source: "future-prediction",
    }));

  const topicCounts = new Map();
  for (const record of records) {
    for (const topic of extractTopics(record)) {
      topicCounts.set(topic, [...(topicCounts.get(topic) || []), record]);
    }
  }
  const topicOpportunities = [...topicCounts.entries()]
    .filter(([, items]) => items.length >= 3)
    .map(([topic, items]) => {
      const relatedGoals = (goals || []).filter((goal) => textOf(goal).toLowerCase().includes(topic.toLowerCase()));
      if (!relatedGoals.length && items.length < 5) return null;
      const evidence = items.slice(0, 8).map((item) => evidenceItem(item, `${topic} opportunity evidence`));
      return {
        id: `opportunity_topic_${stableId(topic)}`,
        title: `${topic} is gaining signal`,
        recommendation: `Create a focused ${topic} mission because it appears in ${items.length} real records${relatedGoals.length ? ` and ${relatedGoals.length} goal${relatedGoals.length === 1 ? "" : "s"}` : ""}.`,
        confidence: confidenceFromEvidence(evidence.length, new Set(items.map((item) => dayKey(timestampOf(item)))).size),
        evidence,
        source: "topic-trend",
      };
    })
    .filter(Boolean);

  return uniqueBy([...predictionOpportunities, ...topicOpportunities], (item) => item.id, 10)
    .sort((a, b) => b.confidence - a.confidence);
}

function buildBehaviorProfile(records) {
  if (!records.length) return { productiveHours: [], activeDays: [], habits: [], emotionalPattern: null };
  const hourCounts = new Map();
  const dayCounts = new Map();
  const habitCounts = new Map();
  let positive = 0;
  let stress = 0;
  for (const record of records) {
    const text = textOf(record);
    const date = asDate(timestampOf(record));
    hourCounts.set(date.getHours(), (hourCounts.get(date.getHours()) || 0) + 1);
    dayCounts.set(date.toLocaleDateString("en-US", { weekday: "long" }), (dayCounts.get(date.toLocaleDateString("en-US", { weekday: "long" })) || 0) + 1);
    for (const topic of extractTopics(record)) habitCounts.set(topic, (habitCounts.get(topic) || 0) + 1);
    if (POSITIVE_WORDS.test(text)) positive += 1;
    if (STRESS_WORDS.test(text)) stress += 1;
  }
  const toRows = (map, formatter = (value) => value) => [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count]) => ({
      label: formatter(label),
      count,
      confidence: confidenceFromEvidence(count, count),
    }));
  return {
    productiveHours: toRows(hourCounts, (hour) => `${String(hour).padStart(2, "0")}:00`),
    activeDays: toRows(dayCounts),
    habits: toRows(habitCounts),
    emotionalPattern: {
      positiveSignals: positive,
      stressSignals: stress,
      label: positive > stress ? "positive leaning" : stress > positive ? "stress leaning" : "balanced",
      confidence: confidenceFromEvidence(positive + stress, positive + stress, Math.abs(positive - stress) * 8),
    },
  };
}

function buildDigitalTwinV3({ records, goals, relationships, decisions, opportunities, behaviorProfile }) {
  if (!records.length && !goals.length) {
    return {
      identity: "",
      motivations: [],
      blockers: [],
      likelyNextActions: [],
      evidence: [],
      confidence: 0,
    };
  }
  const topHabit = behaviorProfile.habits?.[0]?.label || "";
  const activeGoal = (goals || []).find((goal) => goal.status !== "completed");
  const identity = topHabit && activeGoal
    ? `${topHabit} ${/build|launch|startup|saas|neuronest/i.test(activeGoal.title) ? "Builder" : "Strategist"}`
    : topHabit
      ? `${topHabit} Explorer`
      : activeGoal
        ? "Goal-Driven Builder"
        : "Memory-Driven Thinker";
  const evidence = uniqueBy([
    ...records.slice(0, 4).map((record) => evidenceItem(record, "identity evidence")),
    ...decisions.slice(0, 2).flatMap((decision) => decision.evidence || []),
    ...opportunities.slice(0, 2).flatMap((item) => item.evidence || []),
  ], (item) => item.id, 8);
  const blockers = [];
  if ((relationships?.reconnect || []).length) blockers.push("Relationship silence may need attention.");
  if (behaviorProfile.emotionalPattern?.stressSignals > behaviorProfile.emotionalPattern?.positiveSignals) blockers.push("Stress signals are stronger than positive signals.");
  if (goals?.some((goal) => goal.status === "paused")) blockers.push("Paused goals may be slowing execution momentum.");
  return {
    identity,
    motivations: [
      activeGoal ? `Progress on ${activeGoal.title}` : "",
      topHabit ? `Repeated ${topHabit} activity` : "",
      opportunities[0]?.title || "",
    ].filter(Boolean),
    blockers,
    likelyNextActions: [
      opportunities[0]?.recommendation || "",
      activeGoal ? `Capture the next progress memory for ${activeGoal.title}` : "",
      behaviorProfile.productiveHours?.[0] ? `Use ${behaviorProfile.productiveHours[0].label} as a protected work window` : "",
    ].filter(Boolean),
    evidence,
    confidence: confidenceFromEvidence(evidence.length, new Set(evidence.map((item) => dayKey(item.timestamp))).size),
  };
}

function buildSelfImprovementLoop({ futurePredictions, opportunities, decisions }) {
  const history = futurePredictions?.history || [];
  return {
    predictionAccuracy: futurePredictions?.accuracy || { accuracy: 0, evaluatedCount: 0, reliability: "insufficient history" },
    recommendationSignals: opportunities.slice(0, 5).map((item) => ({
      opportunityId: item.id,
      title: item.title,
      confidence: item.confidence,
      evidenceCount: item.evidence?.length || 0,
    })),
    decisionOutcomesTracked: decisions.filter((decision) => decision.status !== "open").length,
    learningLoopStatus: history.length ? "calibrating from outcomes" : "waiting for settled prediction outcomes",
  };
}

export function buildAutonomousIntelligenceCoreV3({
  user,
  memories = [],
  records = [],
  chats = [],
  places = [],
  goals = [],
  decisions: explicitDecisions = [],
  relationshipIntelligence = null,
  futurePredictions = null,
  learningProfile = null,
  query = "",
} = {}) {
  const userId = user?.id || "";
  const allRecords = normalizeRecords({ memories, records, chats, places });
  const empty = !allRecords.length && !goals.length && !(relationshipIntelligence?.relationships || []).length && !(futurePredictions?.predictions || []).length;

  if (!userId || empty) {
    return {
      version: "NeuroNest Autonomous Intelligence Core v3",
      userId,
      generatedAt: nowIso(),
      empty: true,
      evidencePolicy: "No hallucinations: empty accounts produce empty intelligence.",
      understandingScore: 0,
      overview: {
        memorySignals: allRecords.length,
        goalSignals: goals.length,
        relationshipSignals: relationshipIntelligence?.relationships?.length || 0,
        predictionSignals: futurePredictions?.predictions?.length || 0,
      },
      knowledgeGraph: { nodes: [], edges: [], stats: { nodeCount: 0, edgeCount: 0, topicCount: 0, personCount: 0, projectCount: 0, evidenceCount: 0 } },
      decisions: [],
      lifeStories: { daily: [], weekly: [], monthly: [], yearly: [] },
      memoryTimeMachine: { query, availableMonths: [], reconstruction: null, events: [] },
      futureSelf: { horizons: [], summary: "", evidencePolicy: "Future Me requires evidence-backed predictions." },
      chiefOfStaff: [],
      opportunities: [],
      behaviorProfile: { productiveHours: [], activeDays: [], habits: [], emotionalPattern: null },
      digitalTwinV3: { identity: "", motivations: [], blockers: [], likelyNextActions: [], evidence: [], confidence: 0 },
      selfImprovement: { predictionAccuracy: { accuracy: 0, evaluatedCount: 0, reliability: "insufficient history" }, recommendationSignals: [], decisionOutcomesTracked: 0, learningLoopStatus: "waiting for evidence" },
    };
  }

  const knowledgeGraph = buildKnowledgeGraph({ userId, user, records: allRecords, goals, relationshipIntelligence, futurePredictions });
  const decisions = buildDecisions({ userId, records: allRecords, goals, explicitDecisions });
  const lifeStories = buildStories(allRecords);
  const timeMachineBase = { sourceRecords: allRecords };
  const futureSelf = buildFutureSelf({ userId, futurePredictions, goals });
  const chiefOfStaff = buildChiefOfStaff({ goals, futurePredictions, records: allRecords });
  const opportunities = buildOpportunities({ records: allRecords, goals, futurePredictions });
  const behaviorProfile = buildBehaviorProfile(allRecords);
  const digitalTwinV3 = buildDigitalTwinV3({
    records: allRecords,
    goals,
    relationships: relationshipIntelligence,
    decisions,
    opportunities,
    behaviorProfile,
  });
  const selfImprovement = buildSelfImprovementLoop({ futurePredictions, opportunities, decisions });
  const evidenceCount = knowledgeGraph.stats.evidenceCount + decisions.reduce((sum, item) => sum + item.evidence.length, 0) + opportunities.reduce((sum, item) => sum + (item.evidence?.length || 0), 0);
  const understandingScore = clamp(
    Math.min(allRecords.length, 60) * 0.8 +
      Math.min(goals.length, 10) * 5 +
      Math.min(relationshipIntelligence?.relationships?.length || 0, 20) * 2.5 +
      Math.min(futurePredictions?.predictions?.length || 0, 20) * 2 +
      Math.min(decisions.length, 20) * 1.5,
  );

  return {
    version: "NeuroNest Autonomous Intelligence Core v3",
    userId,
    generatedAt: nowIso(),
    empty: false,
    evidencePolicy: "Every graph node, decision, prediction, opportunity, and story is backed by real user evidence.",
    understandingScore,
    overview: {
      memorySignals: allRecords.length,
      goalSignals: goals.length,
      relationshipSignals: relationshipIntelligence?.relationships?.length || 0,
      predictionSignals: futurePredictions?.predictions?.length || 0,
      decisionSignals: decisions.length,
      opportunitySignals: opportunities.length,
      evidenceCount,
      preferredLanguage: learningProfile?.languagePreference?.preferredLanguage || learningProfile?.preferredLanguage || "",
    },
    knowledgeGraph,
    decisions,
    lifeStories,
    memoryTimeMachine: buildMemoryTimeMachine(timeMachineBase, query),
    futureSelf,
    chiefOfStaff,
    opportunities,
    behaviorProfile,
    digitalTwinV3,
    selfImprovement,
    sourceRecords: allRecords.slice(0, 300),
  };
}

export function answerAutonomousIntelligenceQuery(query = "", snapshot = {}) {
  const text = String(query || "").toLowerCase();
  const hasAutonomousQuestion = /\b(who am i becoming|what.*changing|what should i focus|mistakes|repeat|habits.*future|decision.*impact|why.*happier|future me|time machine|take me back|life story|opportunit|chief of staff)\b/i.test(text);
  if (!hasAutonomousQuestion) return { matched: false };
  if (snapshot.empty || !snapshot.overview?.evidenceCount) {
    return {
      matched: true,
      confidence: 0,
      answer: "I do not have enough real evidence to answer that yet. Add memories, goals, chats, places, screenshots, or voice notes first.",
      evidence: [],
    };
  }

  if (/who am i becoming|future me/.test(text)) {
    return {
      matched: true,
      confidence: snapshot.digitalTwinV3?.confidence || snapshot.understandingScore || 0,
      answer: `You are currently trending toward: ${snapshot.digitalTwinV3?.identity || "a clearer identity model"}. Main drivers: ${(snapshot.digitalTwinV3?.motivations || []).join("; ") || "not enough motivation evidence yet"}.`,
      evidence: snapshot.digitalTwinV3?.evidence || [],
    };
  }

  if (/what should i focus|opportunit/.test(text)) {
    const top = snapshot.opportunities?.[0] || snapshot.chiefOfStaff?.[0];
    return {
      matched: true,
      confidence: top?.confidence || 0,
      answer: top ? `${top.title || "Focus recommendation"}: ${top.recommendation || top.recommendedActions?.[0]}` : "No evidence-backed focus recommendation is available yet.",
      evidence: top?.evidence || [],
    };
  }

  if (/mistakes|repeat|decision.*impact/.test(text)) {
    const decisions = snapshot.decisions || [];
    const needsReview = decisions.find((decision) => decision.status === "needs-review") || decisions[0];
    return {
      matched: true,
      confidence: needsReview?.confidence || 0,
      answer: needsReview
        ? `Decision signal: ${needsReview.decision}. Outcome: ${needsReview.actualOutcome} Quality score ${needsReview.qualityScore}%.`
        : "No decision evidence has been captured yet.",
      evidence: needsReview?.evidence || [],
    };
  }

  if (/habits.*future|what.*changing/.test(text)) {
    const habit = snapshot.behaviorProfile?.habits?.[0];
    return {
      matched: true,
      confidence: habit?.confidence || snapshot.understandingScore || 0,
      answer: habit ? `${habit.label} is the strongest repeated behavior signal with ${habit.count} evidence records.` : "No repeated habit evidence is strong enough yet.",
      evidence: snapshot.knowledgeGraph?.nodes?.filter((node) => node.label === habit?.label).flatMap((node) => node.evidence || []) || [],
    };
  }

  if (/why.*happier/.test(text)) {
    const mood = snapshot.behaviorProfile?.emotionalPattern;
    return {
      matched: true,
      confidence: mood?.confidence || 0,
      answer: mood ? `Your emotional pattern is ${mood.label}: ${mood.positiveSignals} positive signals and ${mood.stressSignals} stress signals.` : "No emotional evidence has been captured yet.",
      evidence: snapshot.sourceRecords?.filter((record) => POSITIVE_WORDS.test(textOf(record)) || STRESS_WORDS.test(textOf(record))).slice(0, 6).map((record) => evidenceItem(record, "emotional evidence")) || [],
    };
  }

  const story = snapshot.lifeStories?.monthly?.[0] || snapshot.lifeStories?.weekly?.[0] || snapshot.lifeStories?.daily?.[0];
  return {
    matched: true,
    confidence: story?.confidence || snapshot.understandingScore || 0,
    answer: story ? `${story.title}: ${story.summary}` : "No life story evidence is available yet.",
    evidence: story?.evidence || [],
  };
}
