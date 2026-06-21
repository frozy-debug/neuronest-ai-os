function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function textOf(item = {}) {
  return `${item.title || ""} ${item.sourceTitle || ""} ${item.targetTitle || ""} ${item.reason || ""} ${item.body || item.content || ""} ${item.summary || ""} ${Array.isArray(item.tags) ? item.tags.join(" ") : item.tags || ""}`.toLowerCase();
}

function daysBetween(from, to = new Date()) {
  const date = from ? new Date(from) : to;
  if (Number.isNaN(date.getTime())) return 999;
  return Math.max(0, Math.floor((to.getTime() - date.getTime()) / 86400000));
}

function goalKeywords(goal = {}) {
  const words = `${goal.title || ""} ${goal.description || ""} ${Array.isArray(goal.tags) ? goal.tags.join(" ") : ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
  const intentWords = [];
  if (/launch|build|saas|app|startup|neuronest|deploy/.test(words.join(" "))) intentWords.push("launch", "build", "deploy", "startup", "ai", "code");
  if (/lose|kg|fitness|gym|health|workout/.test(words.join(" "))) intentWords.push("gym", "workout", "fitness", "health", "routine");
  if (/learn|study|ai|course|book|read/.test(words.join(" "))) intentWords.push("learn", "study", "read", "research", "notes");
  return [...new Set([...words, ...intentWords])].slice(0, 18);
}

function alignmentForGoal(goal, memories = []) {
  const keywords = goalKeywords(goal);
  const related = memories.filter((memory) => {
    const text = textOf(memory);
    return keywords.some((word) => text.includes(word));
  });
  const recent = related.filter((memory) => daysBetween(memory.createdAt || memory.timestamp) <= 7);
  const score = related.length
    ? clamp(related.length * 9 + recent.length * 13 + Number(goal.progress || 0) * 0.28, 0, 98)
    : clamp(Number(goal.progress || 0) * 0.25, 0, 98);
  return { score, related, recent };
}

function completionProbability(goal, memories = [], digitalTwin = {}) {
  const alignment = alignmentForGoal(goal, memories);
  const strengths = digitalTwin.strengths || [];
  const weaknesses = digitalTwin.weaknesses || [];
  const execution = strengths.find((item) => /execution|focus|consistency|learning|creativity/i.test(item.label || item.title || ""))?.score || 0;
  const risk = Math.max(...weaknesses.map((item) => Number(item.score || item.confidence || 0)), 0);
  const progress = Number(goal.progress || 0);
  return clamp(progress * 0.36 + alignment.score * 0.42 + execution * 0.18 - risk * 0.12, 0, 96);
}

function buildMilestones(goal = {}) {
  const title = goal.title || "Goal";
  const lower = `${title} ${goal.description || ""}`.toLowerCase();
  const templates = /fitness|lose|kg|gym|health/.test(lower)
    ? ["Baseline routine", "Weekly consistency", "Nutrition and recovery", "Progress review", "Sustainable streak"]
    : /learn|study|read|book|course/.test(lower)
      ? ["Learning map", "Daily study rhythm", "Practice project", "Review and explain", "Portfolio proof"]
      : ["Define launch outcome", "Build smallest useful version", "Test with real feedback", "Fix blockers", "Ship and review"];
  return templates.map((label, index) => ({
    id: `${goal.id || "goal"}-milestone-${index + 1}`,
    title: `${label}: ${title}`,
    status: Number(goal.progress || 0) >= (index + 1) * 20 ? "complete" : index === 0 ? "active" : "planned",
    progress: clamp(Number(goal.progress || 0) - index * 18, 0, 100),
  }));
}

function buildTasks(goal = {}, index = 0) {
  const lower = `${goal.title || ""} ${goal.description || ""}`.toLowerCase();
  const base = /fitness|lose|kg|gym|health/.test(lower)
    ? ["Log today's workout or walk", "Prepare one clean meal", "Review weight and energy trend"]
    : /learn|study|read|book|course/.test(lower)
      ? ["Complete one focused learning block", "Write 5 bullet notes", "Apply one concept in a mini task"]
      : ["Pick one blocker and fix it", "Ship or test one small improvement", "Write a 5-line progress note"];
  return base.map((title, taskIndex) => ({
    id: `${goal.id || index}-task-${taskIndex + 1}`,
    title,
    estimatedMinutes: [35, 25, 15][taskIndex] || 20,
    importanceScore: clamp(86 - taskIndex * 8 - index * 4, 42, 96),
    goalImpact: clamp(88 - index * 7 - taskIndex * 5, 38, 94),
    reasoning: `This moves "${goal.title}" forward today without requiring a full reset.`,
  }));
}

function detectRisks(goal, memories = []) {
  const alignment = alignmentForGoal(goal, memories);
  const lastRelated = alignment.related
    .slice()
    .sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0))[0];
  const staleDays = lastRelated ? daysBetween(lastRelated.createdAt || lastRelated.timestamp) : 999;
  const risks = [];
  if (staleDays >= 6) {
    risks.push({
      title: "Goal at risk",
      body: `No strong activity signal for ${staleDays === 999 ? "this goal yet" : `${staleDays} days`}.`,
      severity: staleDays >= 10 ? "high" : "medium",
      confidence: clamp(58 + Math.min(staleDays, 14) * 3),
    });
  }
  if (Number(goal.progress || 0) < 25 && daysBetween(goal.createdAt) > 7) {
    risks.push({
      title: "Slow launch momentum",
      body: "The goal is still early but has been open long enough to need a small daily mission.",
      severity: "medium",
      confidence: 74,
    });
  }
  return risks;
}

export function normalizeGoal(goal = {}) {
  const now = new Date().toISOString();
  return {
    id: String(goal.id || ""),
    title: String(goal.title || "Untitled goal").trim().slice(0, 120),
    description: String(goal.description || "").trim().slice(0, 500),
    category: String(goal.category || "life").trim().slice(0, 40),
    priority: ["low", "medium", "high"].includes(goal.priority) ? goal.priority : "medium",
    progress: clamp(goal.progress || 0),
    status: ["active", "paused", "completed"].includes(goal.status) ? goal.status : "active",
    targetDate: goal.targetDate || "",
    tags: Array.isArray(goal.tags) ? goal.tags.slice(0, 8) : [],
    createdAt: goal.createdAt || now,
    updatedAt: goal.updatedAt || now,
  };
}

export function buildLifeOsMissionControl({ goals = [], memories = [], relationships = [], digitalTwin = null, userBrainModel = null, futurePredictions = null, autonomousIntelligence = null } = {}) {
  const activeGoals = goals.map(normalizeGoal).filter((goal) => goal.status !== "completed");
  const enrichedGoals = activeGoals.map((goal, index) => {
    const alignment = alignmentForGoal(goal, memories);
    const probability = completionProbability(goal, memories, digitalTwin || {});
    return {
      ...goal,
      alignmentScore: alignment.score,
      completionProbability: probability,
      confidenceScore: clamp((alignment.score + probability) / 2),
      relationshipCount: relationships.filter((item) => goalKeywords(goal).some((word) => textOf(item).includes(word))).length,
      milestones: buildMilestones(goal),
      tasks: buildTasks(goal, index),
      risks: detectRisks(goal, memories),
      strengthsHelping: (digitalTwin?.strengths || []).slice(0, 3),
      weaknessesSlowing: (digitalTwin?.weaknesses || []).slice(0, 3),
      evidence: alignment.recent.concat(alignment.related).slice(0, 4).map((memory) => ({
        id: memory.id,
        title: memory.title,
        type: memory.type || memory.kind || "memory",
        createdAt: memory.createdAt || memory.timestamp,
      })),
    };
  });

  const allTasks = enrichedGoals.flatMap((goal) => goal.tasks.map((task) => ({ ...task, goalId: goal.id, goalTitle: goal.title })));
  const dailyMissions = allTasks
    .sort((a, b) => b.goalImpact + b.importanceScore - (a.goalImpact + a.importanceScore))
    .slice(0, 5);
  const averageAlignment = enrichedGoals.length
    ? clamp(enrichedGoals.reduce((sum, goal) => sum + goal.alignmentScore, 0) / enrichedGoals.length)
    : 0;
  const progressScore = enrichedGoals.length
    ? clamp(enrichedGoals.reduce((sum, goal) => sum + Number(goal.progress || 0), 0) / enrichedGoals.length)
    : 0;
  const recentProductiveMemories = memories.filter((memory) => daysBetween(memory.createdAt || memory.timestamp) <= 3 && /build|fix|launch|learn|focus|goal|project|deploy|workout/.test(textOf(memory))).length;
  const productivityMomentum = memories.length || activeGoals.length
    ? clamp(recentProductiveMemories * 8 + (userBrainModel?.goalCommitmentScore || 0) * 0.16, 0, 98)
    : 0;
  const riskFactors = enrichedGoals.flatMap((goal) => goal.risks.map((risk) => ({ ...risk, goalId: goal.id, goalTitle: goal.title })));
  const forecastRows = futurePredictions?.predictions || [];
  const highRiskForecasts = forecastRows.filter((prediction) => ["High", "Critical"].includes(prediction.riskLevel));
  const topOpportunity = forecastRows.find((prediction) => prediction.type === "opportunity");
  const nextFocus = forecastRows.find((prediction) => prediction.type === "productivity");
  const activeMissions = enrichedGoals.slice(0, 4).map((goal) => ({
    title: goal.title,
    body: goal.milestones.find((item) => item.status !== "complete")?.title || "Review and lock the next useful move.",
    progress: goal.progress,
    probability: goal.completionProbability,
  }));

  return {
    title: "Life OS",
    subtitle: "AI Goal Coach and Mission Control",
    generatedAt: new Date().toISOString(),
    summary: {
      progressScore,
      goalAlignmentScore: averageAlignment,
      productivityMomentum,
      goalCount: enrichedGoals.length,
      activeMissionCount: dailyMissions.length,
      accountabilityRiskCount: riskFactors.length,
      activePredictionCount: forecastRows.length,
      highRiskPredictionCount: highRiskForecasts.length,
      averagePredictionConfidence: futurePredictions?.overview?.averageConfidence || 0,
    },
    goals: enrichedGoals,
    activeMissions,
    dailyMissions,
    aiRecommendations: enrichedGoals.length ? [
      {
        title: averageAlignment >= 72 ? "Protect execution momentum" : "Reconnect actions to goals",
        body: averageAlignment >= 72
          ? "Recent activity is aligned. Keep one mission small enough to complete today."
          : "Choose one declared goal and complete a visible task before adding new features.",
        confidence: clamp(averageAlignment + 8, 50, 94),
      },
      {
        title: productivityMomentum >= 70 ? "Use your current productivity window" : "Create a 35-minute focus block",
        body: productivityMomentum >= 70
          ? "Your recent memory signals show strong building energy. Use it for the highest-impact mission."
          : "Momentum is warming up. Start with a constrained task and save a progress note after.",
        confidence: clamp(productivityMomentum + 6, 52, 92),
      },
      topOpportunity
        ? {
            title: topOpportunity.title,
            body: topOpportunity.recommendation || topOpportunity.summary,
            confidence: topOpportunity.confidence,
          }
        : null,
      nextFocus
        ? {
            title: nextFocus.title,
            body: nextFocus.recommendation || nextFocus.summary,
            confidence: nextFocus.confidence,
          }
        : null,
    ].filter(Boolean) : [],
    weeklyReview: {
      progress: `${progressScore}% average goal progress`,
      wins: memories.filter((memory) => /done|fixed|built|launch|complete|saved|tested/.test(textOf(memory))).slice(0, 4).map((memory) => memory.title),
      failures: riskFactors.slice(0, 3).map((risk) => risk.body),
      focusScore: productivityMomentum,
      goalMovement: averageAlignment,
      recommendations: enrichedGoals.length ? [
        "Write one progress entry for your main goal every day.",
        "Treat missed days as a signal to shrink the task, not abandon the goal.",
        "Use Digital Twin weaknesses as blockers to design around.",
      ] : [],
    },
    notifications: enrichedGoals.length ? [
      riskFactors[0]
        ? {
            title: `${riskFactors[0].goalTitle} needs attention`,
            body: riskFactors[0].body,
          }
        : {
            title: "Mission Control ready",
            body: "Your current missions are aligned with your Life OS goals.",
          },
      {
        title: "Goal alignment updated",
        body: `${averageAlignment}% alignment based on goals, memories, routines, and recent activity.`,
      },
    ] : [],
    autonomousIntelligence: autonomousIntelligence ? {
      version: autonomousIntelligence.version,
      generatedAt: autonomousIntelligence.generatedAt,
      empty: Boolean(autonomousIntelligence.empty),
      understandingScore: autonomousIntelligence.understandingScore || 0,
      overview: autonomousIntelligence.overview || {},
      identity: autonomousIntelligence.digitalTwinV3 || {},
      knowledgeGraph: {
        stats: autonomousIntelligence.knowledgeGraph?.stats || {},
        nodes: (autonomousIntelligence.knowledgeGraph?.nodes || []).slice(0, 24),
        edges: (autonomousIntelligence.knowledgeGraph?.edges || []).slice(0, 30),
      },
      decisions: (autonomousIntelligence.decisions || []).slice(0, 6),
      lifeStories: autonomousIntelligence.lifeStories || { daily: [], weekly: [], monthly: [], yearly: [] },
      futureSelf: autonomousIntelligence.futureSelf || { horizons: [] },
      chiefOfStaff: (autonomousIntelligence.chiefOfStaff || []).slice(0, 6),
      opportunities: (autonomousIntelligence.opportunities || []).slice(0, 8),
      behaviorProfile: autonomousIntelligence.behaviorProfile || {},
      selfImprovement: autonomousIntelligence.selfImprovement || {},
      evidencePolicy: autonomousIntelligence.evidencePolicy,
    } : null,
  };
}
