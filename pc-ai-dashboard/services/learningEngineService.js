const TOPIC_RULES = [
  ["AI", /ai|openai|gpt|model|neural|assistant|chatbot|embedding|vector/i],
  ["Startup", /startup|launch|founder|business|saas|mvp|customer|market/i],
  ["Coding", /code|coding|debug|api|server|frontend|backend|render|github|deploy|bug/i],
  ["Fitness", /gym|workout|fitness|health|lose|kg|run|training/i],
  ["Travel", /travel|trip|hotel|map|place|visited|restaurant|cafe/i],
  ["Study", /learn|study|course|book|read|research|notes|tutorial/i],
  ["Design", /design|ui|ux|animation|logo|profile|layout|mobile|dashboard/i],
  ["Business", /business|pricing|sales|revenue|marketing|client|product/i],
  ["Productivity", /focus|productive|routine|habit|mission|goal|task|priority|timeline/i],
];

const INTENT_RULES = [
  ["Question", /\?|what|why|how|when|where|which|kaise|kya|kyu|donde|como/i],
  ["Goal", /goal|mission|target|launch|lose|learn|build|read|complete|finish/i],
  ["Research", /research|compare|find|search|lookup|show me|analyze/i],
  ["Planning", /plan|roadmap|steps|strategy|schedule|weekly|daily/i],
  ["Reflection", /felt|feel|mood|journal|recap|review|happiest|emotion/i],
  ["Brainstorming", /idea|brainstorm|suggest|options|concept|creative/i],
  ["Execution", /fix|add|build|implement|deploy|update|continue|start/i],
];

const EMOTION_RULES = [
  ["Excited", /excited|amazing|love|great|wow|awesome|inspired|motivated/i],
  ["Motivated", /mission|goal|focus|productive|ready|build|launch|finish/i],
  ["Stressed", /stress|blocked|error|denied|not fixed|issue|problem|stuck|angry/i],
  ["Positive", /good|nice|thanks|done|fixed|working|happy/i],
  ["Negative", /bad|wrong|broken|failed|missing|overlap|doesnt|doesn't/i],
];

const LANGUAGE_BUCKETS = {
  en: "English",
  hi: "Hindi",
  "hi-en": "Hinglish",
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function textOf(item = {}) {
  return `${item.title || ""} ${item.body || item.content || ""} ${item.summary || ""} ${item.meta || ""} ${Array.isArray(item.tags) ? item.tags.join(" ") : item.tags || ""}`;
}

function increment(map, key, amount = 1) {
  if (!key) return;
  map[key] = Number(map[key] || 0) + amount;
}

function topEntries(map = {}, limit = 5) {
  return Object.entries(map)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([label, score]) => ({ label, score: Number(score) }));
}

function detectMany(text, rules, fallback) {
  const matches = rules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  return matches.length ? matches : [fallback];
}

function detectAnswerLength(text) {
  if (/brief|short|quick|briefly|concise|one line|summary/i.test(text)) return "concise";
  if (/detail|deep|full|complete|step by step|explain everything|from scratch/i.test(text)) return "detailed";
  if (/steps|exact step|how to|deploy|fix|guide/i.test(text)) return "step-by-step";
  return "";
}

function detectCoachingStyle(text) {
  if (/coach|mission|goal|accountability|mentor|strategy/i.test(text)) return "coach";
  if (/fix|error|bug|issue|not fixed|solve/i.test(text)) return "direct-debugging";
  if (/idea|brainstorm|creative|suggest/i.test(text)) return "creative-strategy";
  return "";
}

function defaultProfile(userId = "") {
  return {
    version: "Learning Engine V2",
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    interactions: 0,
    lastEventAt: "",
    preferences: {
      preferredLanguage: "Not learned",
      preferredAnswerLength: "Not learned",
      preferredCoachingStyle: "Not learned",
      preferredCommunicationStyle: "Not learned",
      confidence: 0,
    },
    frequencies: {
      topics: {},
      intents: {},
      emotions: {},
      languages: {},
      projects: {},
      goals: {},
      routines: {},
      places: {},
      responseStyles: {},
    },
    behaviorProfile: {
      mostActiveHours: [],
      mostProductiveHours: [],
      mostCommonTopics: [],
      mostVisitedPlaces: [],
      mostCommonGoals: [],
      mostFrequentProjects: [],
      mostCommonRoutines: [],
      behaviorVector: [],
    },
    reinforcement: {
      positiveSignals: 0,
      negativeSignals: 0,
      taskCompleted: 0,
      memorySaved: 0,
      recommendationFollowed: 0,
      memoryDeleted: 0,
      abandonedProject: 0,
      confidenceScore: 0,
    },
    knowledgeGraphLearning: {
      relationships: [],
      lastDecayAt: new Date().toISOString(),
    },
    predictionModel: {
      nextLikelyActivity: "Not enough evidence",
      productivityWindow: "Not enough evidence",
      ideaGenerationWindow: "Not enough evidence",
      burnoutRisk: 0,
      focusProbability: 0,
      goalCompletionProbability: 0,
      confidence: 0,
    },
    personalityModel: {
      focusType: "Not learned",
      learningType: "Not learned",
      thinkingStyle: "Not learned",
      decisionStyle: "Not learned",
      motivationType: "Not learned",
      confidence: 0,
    },
    memoryImportanceModel: {
      averageImportance: 50,
      topSignals: [],
    },
    learningLog: [],
  };
}

function inferProject(text) {
  if (/neuronest|second brain|memory os|life os/i.test(text)) return "NeuroNest";
  if (/render|github|deploy|hosting/i.test(text)) return "Deployment";
  if (/google map|places|place hunter|maps api/i.test(text)) return "Maps and Places";
  if (/voice|assistant|speech/i.test(text)) return "AI Voice Assistant";
  if (/mobile/i.test(text)) return "Mobile Dashboard";
  return "";
}

function inferRoutine(text) {
  if (/daily|today|morning|evening|night|weekly|routine|habit/i.test(text)) return "Planning rhythm";
  if (/gym|workout|fitness/i.test(text)) return "Fitness routine";
  if (/focus|deep work|productive/i.test(text)) return "Focus routine";
  return "";
}

function inferPlace(text) {
  if (/cafe|coffee/i.test(text)) return "Cafe";
  if (/gym|workout/i.test(text)) return "Gym";
  if (/restaurant|hotel|travel|trip/i.test(text)) return "Travel/place";
  return "";
}

function updateRelationship(profile, a, b, reason, amount = 1) {
  if (!a || !b || a === b) return;
  const key = [a, b].sort().join("::");
  const relationships = profile.knowledgeGraphLearning.relationships;
  const existing = relationships.find((item) => item.key === key);
  if (existing) {
    existing.strength = clamp(existing.strength + amount * 7, 0, 100);
    existing.count += amount;
    existing.reason = reason || existing.reason;
    existing.updatedAt = new Date().toISOString();
    return;
  }
  relationships.push({
    key,
    source: a,
    target: b,
    strength: clamp(34 + amount * 8),
    count: amount,
    reason,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

function decayRelationships(profile) {
  const now = new Date();
  const last = new Date(profile.knowledgeGraphLearning.lastDecayAt || 0);
  if (now - last < 6 * 86400000) return;
  profile.knowledgeGraphLearning.relationships = profile.knowledgeGraphLearning.relationships
    .map((item) => ({ ...item, strength: clamp(Number(item.strength || 0) - 4) }))
    .filter((item) => item.strength >= 12);
  profile.knowledgeGraphLearning.lastDecayAt = now.toISOString();
}

export function extractLearningFeatures({ text = "", language = null, eventType = "interaction", timestamp = new Date().toISOString() } = {}) {
  const value = String(text || "");
  const topics = detectMany(value, TOPIC_RULES, "General");
  const intents = detectMany(value, INTENT_RULES, eventType === "memory-saved" ? "Reflection" : "Question");
  const emotions = detectMany(value, EMOTION_RULES, "Neutral");
  const hour = new Date(timestamp).getHours();
  return {
    topics,
    intent: intents[0],
    intents,
    emotion: emotions[0],
    emotions,
    hour,
    languageCode: language?.code || "en",
    languageName: language?.responseLanguage || language?.name || LANGUAGE_BUCKETS[language?.code] || "English",
    answerLength: detectAnswerLength(value),
    coachingStyle: detectCoachingStyle(value),
    project: inferProject(value),
    routine: inferRoutine(value),
    place: inferPlace(value),
  };
}

export function updateLearningProfile(previousProfile, event = {}) {
  const profile = previousProfile ? structuredClone(previousProfile) : defaultProfile(event.userId);
  profile.version = "Learning Engine V2";
  profile.userId ||= event.userId || "";
  profile.createdAt ||= new Date().toISOString();
  profile.updatedAt = new Date().toISOString();
  profile.lastEventAt = event.timestamp || profile.updatedAt;
  profile.interactions = Number(profile.interactions || 0) + 1;

  const features = event.features || extractLearningFeatures(event);
  features.topics.forEach((topic) => increment(profile.frequencies.topics, topic));
  features.intents.forEach((intent) => increment(profile.frequencies.intents, intent));
  features.emotions.forEach((emotion) => increment(profile.frequencies.emotions, emotion));
  increment(profile.frequencies.languages, features.languageName);
  increment(profile.frequencies.responseStyles, features.answerLength || "balanced", features.answerLength ? 1 : 0.25);
  increment(profile.frequencies.projects, features.project, features.project ? 1 : 0);
  increment(profile.frequencies.routines, features.routine, features.routine ? 1 : 0);
  increment(profile.frequencies.places, features.place, features.place ? 1 : 0);

  if (event.goalTitle) increment(profile.frequencies.goals, event.goalTitle);
  increment(profile.frequencies.activeHours ||= {}, String(features.hour));
  if (/Execution|Goal|Planning/.test(features.intent) || event.signal === "positive") {
    increment(profile.frequencies.productiveHours ||= {}, String(features.hour));
  }

  const signal = event.signal || "neutral";
  if (signal === "positive") profile.reinforcement.positiveSignals += 1;
  if (signal === "negative") profile.reinforcement.negativeSignals += 1;
  if (event.eventType === "memory-saved") profile.reinforcement.memorySaved += 1;
  if (event.eventType === "task-completed") profile.reinforcement.taskCompleted += 1;
  if (event.eventType === "recommendation-followed") profile.reinforcement.recommendationFollowed += 1;
  if (event.eventType === "memory-deleted") profile.reinforcement.memoryDeleted += 1;
  if (event.eventType === "project-abandoned") profile.reinforcement.abandonedProject += 1;

  const primaryTopic = features.topics[0];
  if (features.project) updateRelationship(profile, primaryTopic, features.project, "Repeated topic/project pairing");
  if (features.routine) updateRelationship(profile, primaryTopic, features.routine, "Topic appears inside a routine");
  if (event.goalTitle) updateRelationship(profile, primaryTopic, event.goalTitle, "Topic supports declared goal");
  if (features.place) updateRelationship(profile, primaryTopic, features.place, "Topic appears with place context");
  decayRelationships(profile);

  const topLanguage = topEntries(profile.frequencies.languages, 1)[0];
  const topLength = topEntries(profile.frequencies.responseStyles, 1)[0];
  const topIntent = topEntries(profile.frequencies.intents, 1)[0];
  profile.preferences.preferredLanguage = topLanguage?.label || profile.preferences.preferredLanguage;
  profile.preferences.preferredAnswerLength = topLength?.label || profile.preferences.preferredAnswerLength;
  profile.preferences.preferredCoachingStyle = /Goal|Planning|Execution/.test(topIntent?.label || "") ? "strategic accountability coach" : profile.preferences.preferredCoachingStyle;
  profile.preferences.confidence = clamp(38 + profile.interactions * 2 + profile.reinforcement.positiveSignals - profile.reinforcement.negativeSignals);

  profile.behaviorProfile = buildBehaviorProfile(profile);
  profile.predictionModel = buildPredictionModel(profile);
  profile.personalityModel = buildPersonalityModel(profile);
  profile.memoryImportanceModel = buildMemoryImportanceModel(profile, event.memoryImportance);
  profile.learningLog = [
    {
      at: profile.updatedAt,
      eventType: event.eventType || "interaction",
      topics: features.topics,
      intent: features.intent,
      emotion: features.emotion,
      signal,
    },
    ...(profile.learningLog || []),
  ].slice(0, 40);
  return profile;
}

function buildBehaviorProfile(profile) {
  const activeHours = topEntries(profile.frequencies.activeHours || {}, 4).map((item) => ({ hour: Number(item.label), score: item.score }));
  const productiveHours = topEntries(profile.frequencies.productiveHours || {}, 4).map((item) => ({ hour: Number(item.label), score: item.score }));
  const topics = topEntries(profile.frequencies.topics, 6);
  const projects = topEntries(profile.frequencies.projects, 5);
  const routines = topEntries(profile.frequencies.routines, 5);
  return {
    mostActiveHours: activeHours,
    mostProductiveHours: productiveHours,
    mostCommonTopics: topics,
    mostVisitedPlaces: topEntries(profile.frequencies.places, 5),
    mostCommonGoals: topEntries(profile.frequencies.goals, 5),
    mostFrequentProjects: projects,
    mostCommonRoutines: routines,
    behaviorVector: [
      topics[0]?.score || 0,
      projects[0]?.score || 0,
      routines[0]?.score || 0,
      profile.reinforcement.positiveSignals,
      profile.reinforcement.negativeSignals,
      profile.interactions,
    ].map((value) => clamp(value, 0, 100)),
  };
}

function formatHour(hour) {
  if (!Number.isFinite(hour)) return "";
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display} ${suffix}`;
}

function buildPredictionModel(profile) {
  const topTopic = topEntries(profile.frequencies.topics, 1)[0]?.label || "Productivity";
  const topIntent = topEntries(profile.frequencies.intents, 1)[0]?.label || "Planning";
  const productiveHour = profile.behaviorProfile?.mostProductiveHours?.[0]?.hour ?? profile.behaviorProfile?.mostActiveHours?.[0]?.hour ?? 10;
  const negative = Number(profile.reinforcement.negativeSignals || 0);
  const positive = Number(profile.reinforcement.positiveSignals || 0);
  return {
    nextLikelyActivity: `${topIntent} around ${topTopic}`,
    productivityWindow: productiveHour ? `${formatHour(productiveHour)} - ${formatHour(Math.min(23, productiveHour + 2))}` : "10 AM - 1 PM",
    ideaGenerationWindow: topTopic === "Startup" || topTopic === "AI" ? "evening build sessions" : "focused planning windows",
    burnoutRisk: clamp(24 + negative * 8 - positive * 2),
    focusProbability: clamp(46 + positive * 6 + (profile.frequencies.intents.Execution || 0) * 5 - negative * 4),
    goalCompletionProbability: clamp(42 + positive * 5 + (profile.reinforcement.taskCompleted || 0) * 8 - (profile.reinforcement.abandonedProject || 0) * 12),
    confidence: clamp(36 + profile.interactions * 2),
  };
}

function buildPersonalityModel(profile) {
  const topics = topEntries(profile.frequencies.topics, 3).map((item) => item.label);
  const intents = topEntries(profile.frequencies.intents, 3).map((item) => item.label);
  return {
    focusType: intents.includes("Execution") ? "Execution Sprinter" : "Adaptive Builder",
    learningType: topics.includes("Coding") || topics.includes("AI") ? "Project-based learner" : "Pattern-based learner",
    thinkingStyle: topics.includes("Design") ? "Visual systems thinker" : "Connection-first strategist",
    decisionStyle: intents.includes("Planning") ? "Roadmap planner" : "Build-test-iterate",
    motivationType: intents.includes("Goal") ? "Goal driven" : "Mission driven",
    confidence: clamp(36 + profile.interactions * 2),
  };
}

function buildMemoryImportanceModel(profile, latestImportance = 50) {
  const emotionWeight = (profile.frequencies.emotions.Excited || 0) + (profile.frequencies.emotions.Motivated || 0) - (profile.frequencies.emotions.Negative || 0);
  const goalWeight = Object.keys(profile.frequencies.goals || {}).length * 4;
  const relationshipWeight = (profile.knowledgeGraphLearning.relationships || []).reduce((sum, item) => sum + Number(item.strength || 0), 0) / 20;
  return {
    averageImportance: clamp(Number(latestImportance || 50) * 0.4 + emotionWeight * 4 + goalWeight + relationshipWeight + 42),
    topSignals: [
      "recency",
      "frequency",
      "emotion",
      "goal relevance",
      "relationship strength",
      "user interaction",
    ],
  };
}

export function rebuildLearningProfile({ userId = "", previousProfile = null, memories = [], chats = [], goals = [] } = {}) {
  let profile = previousProfile || defaultProfile(userId);
  const events = [
    ...memories.map((memory) => ({
      userId,
      eventType: "memory-saved",
      text: textOf(memory),
      timestamp: memory.createdAt || memory.timestamp,
      signal: "positive",
      memoryImportance: memory.importanceScore || memory.aiScore || 50,
    })),
    ...chats.map((message) => ({
      userId,
      eventType: message.role === "user" ? "conversation-user" : "conversation-ai",
      text: message.content,
      timestamp: message.createdAt,
      signal: message.role === "user" ? "neutral" : "positive",
    })),
    ...goals.map((goal) => ({
      userId,
      eventType: "goal-active",
      text: `${goal.title} ${goal.description || ""}`,
      timestamp: goal.updatedAt || goal.createdAt,
      signal: goal.status === "completed" ? "positive" : goal.status === "paused" ? "negative" : "neutral",
      goalTitle: goal.title,
    })),
  ].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
  events.slice(-160).forEach((event) => {
    profile = updateLearningProfile(profile, event);
  });
  profile.updatedAt = new Date().toISOString();
  return profile;
}

export function summarizeLearningProfile(profile = defaultProfile()) {
  return {
    version: profile.version || "Learning Engine V2",
    preferences: profile.preferences,
    behaviorProfile: profile.behaviorProfile,
    reinforcement: profile.reinforcement,
    predictionModel: profile.predictionModel,
    personalityModel: profile.personalityModel,
    memoryImportanceModel: profile.memoryImportanceModel,
    knowledgeGraphLearning: {
      relationships: (profile.knowledgeGraphLearning?.relationships || []).slice(0, 12),
    },
    multilingual: {
      usage: topEntries(profile.frequencies?.languages || {}, 8),
      preferredLanguage: profile.preferences?.preferredLanguage || "English",
    },
    topTopics: topEntries(profile.frequencies?.topics || {}, 8),
    topIntents: topEntries(profile.frequencies?.intents || {}, 8),
    topEmotions: topEntries(profile.frequencies?.emotions || {}, 8),
    updatedAt: profile.updatedAt,
  };
}
