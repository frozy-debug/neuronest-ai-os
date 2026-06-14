import { detectLanguage } from "./languageIntelligenceService.js";
import { evidenceFromMemory, scoreInsightConfidence, summarizeEvidence } from "./intelligenceConfidenceEngine.js";

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function textOf(memory) {
  return `${memory.title || ""} ${memory.content || memory.body || ""} ${memory.summary || ""} ${memory.tags?.join(" ") || ""} ${memory.emotions?.join(" ") || ""} ${memory.type || ""}`.toLowerCase();
}

function countWhere(memories, pattern) {
  return memories.filter((memory) => pattern.test(textOf(memory)));
}

function profileDimension(label, memories, pattern, base = 42) {
  const evidence = countWhere(memories, pattern);
  const score = evidence.length
    ? clamp(Math.min(base, 36) + evidence.length * 8 + evidence.reduce((sum, memory) => sum + Number(memory.aiScore || memory.importanceScore || 55), 0) * 0.08, 1, 98)
    : 0;
  return {
    label,
    score,
    confidence: evidence.length ? clamp(40 + evidence.length * 11) : 0,
    evidence: evidence.slice(0, 5).map((memory) => evidenceFromMemory(memory, `${label} signal`)),
  };
}

function buildPersonalityModel(memories) {
  return [
    profileDimension("Builder", memories, /build|ship|code|deploy|create|launch|app|website/, 48),
    profileDimension("Researcher", memories, /research|learn|study|course|docs|tutorial|compare|notes/, 44),
    profileDimension("Creative Thinker", memories, /idea|creative|design|startup|brainstorm|inspiration/, 48),
    profileDimension("Strategist", memories, /strategy|plan|roadmap|business|goal|decision|market/, 46),
    profileDimension("Explorer", memories, /travel|place|cafe|map|restaurant|new|explore/, 42),
    profileDimension("Operator", memories, /routine|system|process|workflow|checklist|execution|habit/, 42),
    profileDimension("Social Connector", memories, /friend|team|chat|call|meeting|community|social/, 38),
  ].sort((a, b) => b.score - a.score);
}

function buildInterestEvolution(memories) {
  const interests = [
    ["AI", /ai|gpt|llm|assistant|automation|neuronest|model/],
    ["Startups", /startup|business|market|product|launch|saas|pricing/],
    ["Fitness", /gym|workout|fitness|run|health|training/],
    ["Productivity", /focus|productive|deep work|routine|planning|task/],
    ["Design", /ui|ux|design|animation|logo|visual|frontend/],
    ["Learning", /learn|study|course|research|tutorial|docs/],
    ["Travel", /travel|trip|goa|place|map|hotel|location/],
  ];

  return interests
    .map(([label, pattern]) => {
      const evidence = countWhere(memories, pattern);
      return {
        label,
        score: evidence.length ? clamp(28 + evidence.length * 10) : 0,
        trend: evidence.length > 3 ? "rising" : evidence.length ? "forming" : "quiet",
        evidenceCount: evidence.length,
        evidence: evidence.slice(0, 4).map((memory) => evidenceFromMemory(memory, `${label} interest`)),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildCommunicationProfile(chatHistory = []) {
  const userMessages = chatHistory.filter((message) => message.role === "user").slice(-30);
  const languageCounts = new Map();
  let totalLength = 0;
  let technicalCount = 0;
  let casualCount = 0;

  userMessages.forEach((message) => {
    const content = String(message.content || "");
    const language = detectLanguage(content, []);
    languageCounts.set(language.code, (languageCounts.get(language.code) || 0) + 1);
    totalLength += content.length;
    if (/api|server|render|github|code|bug|route|database|deploy|architecture/i.test(content)) technicalCount += 1;
    if (/lol|bro|yaar|pls|please|smthg|btw/i.test(content)) casualCount += 1;
  });

  const preferredLanguageCode = [...languageCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const latestLanguage = userMessages.length ? detectLanguage(userMessages[userMessages.length - 1].content, []) : null;
  const averageLength = userMessages.length ? totalLength / userMessages.length : 0;

  return {
    preferredLanguage: latestLanguage?.responseLanguage || "Not learned",
    preferredLanguageCode,
    currentAdaptiveRule: "Always answer in the current user message language; learned preference is only a soft hint.",
    preferredTone: userMessages.length ? (casualCount >= 2 ? "warm, casual, direct" : "warm, calm, direct") : "Not learned",
    preferredResponseLength: userMessages.length ? (averageLength > 180 ? "detailed" : "concise") : "Not learned",
    explanationStyle: userMessages.length ? (technicalCount >= 2 ? "technical and step-by-step" : "simple and practical") : "Not learned",
    confidence: userMessages.length ? clamp(40 + userMessages.length * 5) : 0,
    evidence: userMessages.slice(-5).map((message) => ({
      id: message.id,
      title: "Chat language signal",
      type: "ai-chat",
      reason: detectLanguage(message.content, []).name,
      score: detectLanguage(message.content, []).confidence || 0,
    })),
  };
}

function buildGoalProfile(memories) {
  const goalMemories = countWhere(memories, /goal|plan|project|startup|launch|learn|build|finish|routine|habit|roadmap|should i|decision/);
  const completed = goalMemories.filter((memory) => /done|finished|completed|shipped|launched|fixed|solved/.test(textOf(memory)));
  const abandoned = goalMemories.filter((memory) => /abandoned|stopped|failed|drop|later|pending|unfinished/.test(textOf(memory)));
  const active = goalMemories.filter((memory) => !completed.includes(memory) && !abandoned.includes(memory));
  const aiGoals = goalMemories.filter((memory) => /ai|neuronest|assistant|memory|automation|app/.test(textOf(memory)));

  return {
    activeGoals: active.slice(0, 8).map((memory) => evidenceFromMemory(memory, "active goal")),
    completedGoals: completed.slice(0, 6).map((memory) => evidenceFromMemory(memory, "completed goal")),
    abandonedGoals: abandoned.slice(0, 6).map((memory) => evidenceFromMemory(memory, "abandoned goal")),
    recurringGoals: aiGoals.slice(0, 6).map((memory) => evidenceFromMemory(memory, "recurring AI/project goal")),
    commitmentScore: goalMemories.length ? clamp(active.length * 6 + completed.length * 10 - abandoned.length * 5) : 0,
    aiGoalCompletionProbability: aiGoals.length ? clamp(aiGoals.length * 8 + completed.length * 6 - abandoned.length * 4) : 0,
  };
}

function buildSuccessModel(memories) {
  const success = countWhere(memories, /success|done|finished|completed|shipped|launched|fixed|solved|deployed/);
  const failure = countWhere(memories, /failed|abandoned|stopped|blocked|bug|problem|burnout|pending|unfinished/);
  const ai = countWhere(memories, /ai|neuronest|assistant|automation|memory|model/);
  const shortMilestones = countWhere(memories, /small|step|test|prototype|mvp|7-day|week|milestone/);

  return {
    successBlueprint: [
      ai.length ? "Projects involving AI and memory systems are strong success signals." : "AI project success signals are still forming.",
      shortMilestones.length ? "Short milestones and visible progress improve follow-through." : "Add smaller milestones to make completion patterns clearer.",
      success.length ? "Solved and shipped memories increase future completion confidence." : "Completion history will improve as projects are marked done.",
    ],
    failureRisks: [
      failure.length ? "Blocked, pending, or unfinished memories are the main risk signals." : "No strong failure pattern detected yet.",
    ],
    successScore: success.length || ai.length || shortMilestones.length || failure.length
      ? clamp(success.length * 9 + ai.length * 3 + shortMilestones.length * 4 - failure.length * 3)
      : 0,
    evidence: [...success, ...ai, ...shortMilestones].slice(0, 6).map((memory) => evidenceFromMemory(memory, "success model evidence")),
  };
}

function buildDecisionLearning(memories) {
  const decisions = countWhere(memories, /decision|decided|should i|choose|switch|change|start|stop|pursue|learn|build/);
  return {
    decisions: decisions.slice(0, 10).map((memory) => ({
      ...evidenceFromMemory(memory, "decision history"),
      outcome: /done|completed|success|launched|fixed/.test(textOf(memory)) ? "worked" : /abandoned|failed|stopped|drop/.test(textOf(memory)) ? "did not work" : "open",
    })),
    learnedPattern: decisions.length
      ? "Future recommendations should compare the question against past project, learning, and routine decisions."
      : "Decision learning is ready, but needs more explicit decisions and outcomes.",
    confidence: decisions.length ? clamp(40 + decisions.length * 10) : 0,
  };
}

function buildEmotionalModel(memories) {
  const positive = countWhere(memories, /happy|excited|inspired|calm|good|win|love|motivated/);
  const heavy = countWhere(memories, /stress|sad|tired|burnout|blocked|angry|anxious|overload/);
  const reflective = countWhere(memories, /journal|voice|reflection|mood|felt|feeling/);
  return {
    emotionalBalance: positive.length || heavy.length ? clamp(50 + positive.length * 5 - heavy.length * 6) : 0,
    motivationSpikeSignals: positive.slice(0, 5).map((memory) => evidenceFromMemory(memory, "motivation spike")),
    burnoutRiskSignals: heavy.slice(0, 5).map((memory) => evidenceFromMemory(memory, "burnout risk")),
    reflectionDepth: reflective.length ? clamp(34 + reflective.length * 12) : 0,
    summary: heavy.length > positive.length
      ? "Stress and overload signals need gentle monitoring."
      : positive.length || reflective.length
        ? "Positive and reflective signals are supporting the emotional model."
        : "No emotional evidence has been captured yet.",
  };
}

function profilePattern(label, memories, pattern, reason) {
  const evidence = countWhere(memories, pattern);
  const confidence = evidence.length ? clamp(38 + evidence.length * 12) : 0;
  return {
    label,
    confidence,
    strength: evidence.length ? clamp(32 + evidence.length * 11) : 0,
    evidenceCount: evidence.length,
    evidenceSources: evidence.slice(0, 6).map((memory) => evidenceFromMemory(memory, reason || `${label} evidence`)),
    memoryReferences: evidence.slice(0, 6).map((memory) => memory.id),
  };
}

function buildHabitAndRoutineProfiles(memories) {
  const habits = [
    profilePattern("Morning planning", memories, /morning|planning|plan|checklist|goals/, "morning planning habit"),
    profilePattern("Gym before focus", memories, /gym|workout|fitness|focus|productive|deep work/, "gym and focus habit"),
    profilePattern("Late-night creativity", memories, /late|night|evening|idea|startup|creative|build/, "late-night creativity habit"),
    profilePattern("Weekend project review", memories, /weekend|review|roadmap|project|planning/, "weekend review routine"),
    profilePattern("Cafe productivity", memories, /cafe|coffee|workspace|focus|startup|idea/, "cafe productivity routine"),
    profilePattern("Voice reflection", memories, /voice|reflection|journal|mood|thought|note/, "voice reflection routine"),
  ].filter((item) => item.evidenceCount > 0).sort((a, b) => b.strength - a.strength);

  const routines = [
    profilePattern("Project building routine", memories, /build|deploy|ship|code|fix|launch|app|website/, "project routine"),
    profilePattern("Learning routine", memories, /learn|study|research|docs|tutorial|course/, "learning routine"),
    profilePattern("Health routine", memories, /gym|workout|fitness|health|run|training/, "health routine"),
    profilePattern("Reflection routine", memories, /journal|voice|recap|reflection|mood/, "reflection routine"),
  ].filter((item) => item.evidenceCount > 0).sort((a, b) => b.strength - a.strength);

  return {
    habits,
    routines,
    confidence: scoreInsightConfidence({
      evidence: [...habits, ...routines].flatMap((item) => item.evidenceSources || []),
      memoryCount: memories.length,
    }),
  };
}

function buildPreferenceProfile({ memories, communicationProfile, interestEvolution }) {
  const preferredWork = profilePattern("Visible project progress", memories, /progress|milestone|ship|launch|deploy|done|complete|fix/, "work preference");
  const preferredPlaces = profilePattern("Quiet cafe/workspace", memories, /cafe|coffee|quiet|workspace|place|focus/, "place preference");
  const preferredTopics = interestEvolution.slice(0, 5).map((item) => ({
    label: item.label,
    confidence: item.score,
    evidenceCount: item.evidenceCount,
    evidenceSources: item.evidence,
    memoryReferences: item.evidence.map((evidence) => evidence.id),
  }));

  return {
    language: communicationProfile.preferredLanguage,
    tone: communicationProfile.preferredTone,
    responseLength: communicationProfile.preferredResponseLength,
    explanationStyle: communicationProfile.explanationStyle,
    workStyle: preferredWork,
    placeStyle: preferredPlaces,
    topics: preferredTopics,
    confidence: clamp((communicationProfile.confidence + preferredWork.confidence + preferredPlaces.confidence) / 3),
  };
}

function buildProjectHistory(memories) {
  const projectMemories = countWhere(memories, /project|startup|app|website|build|launch|deploy|business|product|neuronest|ai/);
  const successfulProjects = projectMemories.filter((memory) => /success|done|finished|completed|shipped|launched|fixed|solved|deployed/.test(textOf(memory)));
  const failedProjects = projectMemories.filter((memory) => /failed|abandoned|stopped|blocked|unfinished|pending|drop|burnout/.test(textOf(memory)));
  const activeProjects = projectMemories.filter((memory) => !successfulProjects.includes(memory) && !failedProjects.includes(memory));

  return {
    activeProjects: activeProjects.slice(0, 8).map((memory) => evidenceFromMemory(memory, "active project")),
    successfulProjects: successfulProjects.slice(0, 8).map((memory) => evidenceFromMemory(memory, "successful project")),
    failedProjects: failedProjects.slice(0, 8).map((memory) => evidenceFromMemory(memory, "failed or blocked project")),
    projectConsistencyScore: projectMemories.length ? clamp(successfulProjects.length * 10 + activeProjects.length * 5 - failedProjects.length * 6) : 0,
    confidence: scoreInsightConfidence({
      evidence: projectMemories.slice(0, 8).map((memory) => evidenceFromMemory(memory, "project history")),
      memoryCount: memories.length,
    }),
  };
}

function buildLearnedPatterns({ memories, relationships, habitProfile, interestEvolution, emotionalModel, projectHistory }) {
  const workoutFocus = countWhere(memories, /gym|workout|fitness|focus|productive|deep work/);
  const cafeIdeas = countWhere(memories, /cafe|coffee|startup|idea|creative|focus/);
  const aiProjects = countWhere(memories, /ai|neuronest|assistant|automation|app|startup|build/);
  const burnoutRisk = countWhere(memories, /burnout|stress|tired|overload|blocked|late night/);
  const patterns = [
    {
      label: "Gym -> Focus correlation",
      body: workoutFocus.length
        ? "Workout and focus signals appear together in your memory history."
        : "Workout to focus correlation needs more evidence.",
      evidence: workoutFocus,
    },
    {
      label: "Cafe -> Idea correlation",
      body: cafeIdeas.length
        ? "Cafe, coffee, startup, and idea memories are clustering together."
        : "Cafe and idea pattern is still warming up.",
      evidence: cafeIdeas,
    },
    {
      label: "AI projects -> Completion potential",
      body: aiProjects.length
        ? "AI and app-building memories are recurring enough to guide future decisions."
        : "AI project completion pattern needs more project outcomes.",
      evidence: aiProjects,
    },
    {
      label: "Burnout risk monitor",
      body: emotionalModel.summary,
      evidence: burnoutRisk,
    },
    {
      label: "Routine learning density",
      body: `${habitProfile.habits.length} habits and ${habitProfile.routines.length} routines are currently modeled.`,
      evidence: memories.slice(0, habitProfile.habits.length + habitProfile.routines.length),
    },
    {
      label: "Project follow-through",
      body: `Project consistency score is ${projectHistory.projectConsistencyScore}%.`,
      evidence: [
        ...projectHistory.activeProjects,
        ...projectHistory.successfulProjects,
        ...projectHistory.failedProjects,
      ],
      evidenceAlreadyNormalized: true,
    },
  ];

  return patterns.map((pattern) => {
    const evidenceSources = pattern.evidenceAlreadyNormalized
      ? pattern.evidence.slice(0, 8)
      : pattern.evidence.slice(0, 8).map((memory) => evidenceFromMemory(memory, pattern.label));
    return {
      label: pattern.label,
      body: pattern.body,
      confidence: scoreInsightConfidence({ evidence: evidenceSources, relationships, memoryCount: memories.length }),
      evidenceSources,
      memoryReferences: evidenceSources.map((item) => item.id),
    };
  });
}

function buildWeeklyLearning({ memories, relationships, interests, personality }) {
  const recent = memories.slice(0, 20);
  const evidence = recent.slice(0, 6).map((memory) => evidenceFromMemory(memory, "weekly learning"));
  return {
    period: new Date().toISOString().slice(0, 10),
    weeklyLearnings: [
      interests[0] ? `${interests[0].label} is the strongest current interest signal.` : "Interests are warming up.",
      personality[0] ? `${personality[0].label} is the strongest personality tendency this week.` : "Personality model is warming up.",
      relationships.length ? `${relationships.length} relationship signals are available for pattern learning.` : "Relationship learning needs more connected memories.",
    ],
    newHabitsLearned: countWhere(recent, /routine|habit|daily|weekly|gym|planning/).length,
    newInterestsDiscovered: interests.filter((item) => item.trend !== "quiet").slice(0, 4).map((item) => item.label),
    newRisksIdentified: countWhere(recent, /burnout|stress|pending|unfinished|distract|delay/).slice(0, 4).map((memory) => evidenceFromMemory(memory, "weekly risk")),
    confidence: scoreInsightConfidence({ evidence, relationships, memoryCount: memories.length }),
    evidenceSummary: summarizeEvidence(evidence),
  };
}

function mergeLearningHistory(previousModel, weeklyLearning) {
  const prior = Array.isArray(previousModel?.learningHistory) ? previousModel.learningHistory : [];
  const filtered = prior.filter((item) => item.period !== weeklyLearning.period);
  return [...filtered, weeklyLearning].slice(-12);
}

function mergeMonthlyHistory(previousModel, monthlyBrainUpdate) {
  const prior = Array.isArray(previousModel?.monthlyLearningHistory) ? previousModel.monthlyLearningHistory : [];
  const filtered = prior.filter((item) => item.period !== monthlyBrainUpdate.period);
  return [...filtered, monthlyBrainUpdate].slice(-12);
}

export function buildUserBrainModel({ user, memories = [], relationships = [], chatHistory = [], digitalTwin = null, previousModel = null, context = {} }) {
  const personalityModel = buildPersonalityModel(memories);
  const interestEvolution = buildInterestEvolution(memories);
  const communicationProfile = buildCommunicationProfile(chatHistory);
  const goalProfile = buildGoalProfile(memories);
  const successModel = buildSuccessModel(memories);
  const decisionLearning = buildDecisionLearning(memories);
  const emotionalModel = buildEmotionalModel(memories);
  const habitProfile = buildHabitAndRoutineProfiles(memories);
  const preferenceProfile = buildPreferenceProfile({ memories, communicationProfile, interestEvolution });
  const projectHistory = buildProjectHistory(memories);
  const learnedPatterns = buildLearnedPatterns({ memories, relationships, habitProfile, interestEvolution, emotionalModel, projectHistory });
  const weeklyLearning = buildWeeklyLearning({ memories, relationships, interests: interestEvolution, personality: personalityModel });
  const monthlyBrainUpdate = {
    period: new Date().toISOString().slice(0, 7),
    summary: "Monthly knowledge distillation is generated from behavior changes, productivity movement, goal progress, and communication shifts.",
    behaviorChanges: learnedPatterns.slice(0, 4).map((item) => item.body),
    personalityChanges: personalityModel.slice(0, 4).map((item) => `${item.label}: ${item.score}%`),
    productivityChanges: [`Productivity style score: ${digitalTwin?.strengths?.find((item) => item.label === "Focus")?.score || profileDimension("Productivity", memories, /focus|productive|deep work|coding|study|task/, 48).score}%`],
    goalProgress: goalProfile.commitmentScore,
    learningProgress: profileDimension("Learning", memories, /learn|study|research|docs|tutorial|course|notes/, 44).score,
    topInterests: interestEvolution.slice(0, 5).map((item) => item.label),
    topPersonalitySignals: personalityModel.slice(0, 4).map((item) => item.label),
    emotionalBalance: emotionalModel.emotionalBalance,
    confidence: scoreInsightConfidence({
      evidence: learnedPatterns.flatMap((item) => item.evidenceSources || []).slice(0, 8),
      relationships,
      memoryCount: memories.length,
    }),
  };
  const confidence = scoreInsightConfidence({
    evidence: [
      ...personalityModel.slice(0, 2).flatMap((item) => item.evidence || []),
      ...interestEvolution.slice(0, 2).flatMap((item) => item.evidence || []),
      ...goalProfile.activeGoals.slice(0, 3),
      ...learnedPatterns.slice(0, 2).flatMap((item) => item.evidenceSources || []),
    ],
    relationships,
    memoryCount: memories.length,
  });

  return {
    version: "NeuroNest Intelligence Core v3 - User Brain Model",
    updatedAt: new Date().toISOString(),
    userId: user?.id || "",
    userName: user?.name || user?.email || "NeuroNest User",
    trigger: context.trigger || "continuous-learning",
    modelType: "permanent-user-brain-model",
    continuousLearning: {
      enabled: true,
      learnsFrom: ["chats", "memories", "screenshots", "voice notes", "places", "goals", "projects", "decisions"],
      selfImprovementLoop: ["analyze interaction", "extract learnings", "update brain model", "update digital twin", "refresh confidence scores"],
      lastSignal: context.activity || context.query || context.trigger || "dashboard",
    },
    personalityModel,
    communicationProfile,
    preferenceProfile,
    goalProfile,
    habitProfile,
    successModel,
    decisionLearning,
    projectHistory,
    learnedPatterns,
    interestEvolution,
    emotionalModel,
    productivityStyle: {
      score: digitalTwin?.strengths?.find((item) => item.label === "Focus")?.score || profileDimension("Productivity", memories, /focus|productive|deep work|coding|study|task/, 48).score,
      summary: "NeuroNest learns productivity style from focus sessions, routines, locations, and successful work memories.",
    },
    learningStyle: {
      score: profileDimension("Learning", memories, /learn|study|research|docs|tutorial|course|notes/, 44).score,
      summary: "Learning style is inferred from research, study, docs, and project-building memories.",
    },
    strengths: digitalTwin?.strengths || personalityModel.slice(0, 4),
    weaknesses: digitalTwin?.weaknesses || [],
    weeklyLearning,
    monthlyBrainUpdate,
    confidence: {
      score: confidence,
      evidenceSummary: weeklyLearning.evidenceSummary,
    },
    learningHistory: mergeLearningHistory(previousModel, weeklyLearning),
    monthlyLearningHistory: mergeMonthlyHistory(previousModel, monthlyBrainUpdate),
  };
}

export function summarizeUserBrainModel(model) {
  if (!model) return null;
  return {
    version: model.version,
    updatedAt: model.updatedAt,
    communicationProfile: model.communicationProfile,
    topPersonality: model.personalityModel?.slice(0, 4) || [],
    topInterests: model.interestEvolution?.slice(0, 5) || [],
    topHabits: model.habitProfile?.habits?.slice(0, 5) || [],
    preferenceProfile: model.preferenceProfile,
    goalCommitmentScore: model.goalProfile?.commitmentScore || 0,
    successScore: model.successModel?.successScore || 0,
    projectConsistencyScore: model.projectHistory?.projectConsistencyScore || 0,
    emotionalBalance: model.emotionalModel?.emotionalBalance || 0,
    learnedPatterns: model.learnedPatterns?.slice(0, 6) || [],
    weeklyLearning: model.weeklyLearning,
    monthlyBrainUpdate: model.monthlyBrainUpdate,
    confidence: model.confidence,
  };
}
