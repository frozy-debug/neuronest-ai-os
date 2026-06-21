const GOAL_TYPE_PATTERNS = [
  ["mobile-app", /\b(mobile app|react native|android|ios|app store|play store|mobile)\b/i],
  ["startup", /\b(startup|saas|founder|business|customer|pricing|mvp|launch|neuronest)\b/i],
  ["fitness", /\b(lose|kg|gym|workout|fitness|health|diet|weight|training)\b/i],
  ["learning", /\b(learn|study|coding|course|book|read|practice|exam|skill)\b/i],
  ["content", /\b(youtube|content|post|video|write|newsletter|audience|brand)\b/i],
];

const PRODUCTIVE_WORDS = /\b(done|completed|fixed|built|build|shipped|launch|launched|deploy|deployed|tested|learned|studied|workout|gym|progress|implemented|finished)\b/i;
const BLOCKER_WORDS = /\b(error|blocked|stuck|failed|not working|issue|problem|delay|missed|abandoned|paused|risk|slow)\b/i;

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
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from, to = new Date()) {
  const date = asDate(from);
  if (!date) return 999;
  return Math.max(0, Math.floor((to.getTime() - date.getTime()) / 86_400_000));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
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
    item.reason,
    item.type,
    item.kind,
    item.category,
    item.placeName,
    item.address,
    Array.isArray(item.tags) ? item.tags.join(" ") : item.tags,
    metadata.ocrText,
    metadata.extractedText,
    metadata.voiceTranscript,
    metadata.transcript,
    metadata.aiSummary,
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function evidenceItem(item = {}, reason = "evidence") {
  return {
    id: String(item.id || item.entryId || item.memoryId || item.sourceId || stableId(item.title, timestampOf(item))),
    type: String(item.type || item.kind || item.sourceType || "memory"),
    title: String(item.title || item.sourceTitle || item.placeName || item.content || item.body || "Evidence").slice(0, 140),
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

  return uniqueBy(rows, (item) => String(item.id || `${item.sourceBucket}_${textOf(item).slice(0, 60)}_${timestampOf(item)}`), 3000)
    .sort((a, b) => new Date(timestampOf(b)) - new Date(timestampOf(a)));
}

function detectGoalType(goal = {}) {
  const text = textOf(goal);
  return GOAL_TYPE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] || "general";
}

function goalKeywords(goal = {}) {
  const raw = textOf(goal).toLowerCase();
  const words = raw
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !["goal", "with", "this", "that", "from", "have", "want"].includes(word));
  const type = detectGoalType(goal);
  const boost = {
    "mobile-app": ["mobile", "app", "authentication", "sync", "release", "testing"],
    startup: ["startup", "saas", "launch", "mvp", "customer", "pricing", "product"],
    fitness: ["gym", "workout", "fitness", "health", "routine", "weight"],
    learning: ["learn", "study", "practice", "notes", "coding", "course"],
    content: ["content", "video", "write", "audience", "publish"],
    general: ["progress", "plan", "task", "milestone"],
  }[type];
  return [...new Set([...words, ...boost])].slice(0, 22);
}

function relatedRecordsForGoal(goal, records) {
  const keywords = goalKeywords(goal);
  return records.filter((record) => {
    const text = textOf(record).toLowerCase();
    return keywords.some((keyword) => text.includes(keyword));
  });
}

function roadmapTemplate(goalType) {
  const templates = {
    "mobile-app": [
      ["Foundation", "Set up app architecture and core navigation", ["setup", "architecture", "react native", "mobile"]],
      ["Authentication", "Finish login, sessions, and user profile flow", ["auth", "login", "google", "session"]],
      ["Memory Sync", "Connect memories, chat, places, and timeline sync", ["memory", "sync", "api", "database"]],
      ["Testing", "Test core flows, responsiveness, and production bugs", ["test", "bug", "fix", "qa"]],
      ["Release", "Prepare deployment, store readiness, and launch checklist", ["release", "launch", "deploy", "store"]],
    ],
    startup: [
      ["Offer", "Define the clearest user problem and first offer", ["offer", "problem", "customer", "pricing"]],
      ["MVP", "Build the smallest useful version", ["mvp", "build", "feature", "prototype"]],
      ["Validation", "Test with real users and collect feedback", ["user", "feedback", "test", "customer"]],
      ["Launch System", "Set up deployment, onboarding, analytics, and support", ["deploy", "onboarding", "analytics", "support"]],
      ["Growth", "Improve retention and repeatable acquisition", ["growth", "retention", "marketing", "sales"]],
    ],
    fitness: [
      ["Baseline", "Record current routine, weight, and constraints", ["baseline", "weight", "health"]],
      ["Training Rhythm", "Create weekly gym or workout consistency", ["gym", "workout", "training"]],
      ["Nutrition", "Add nutrition and recovery habits", ["diet", "nutrition", "sleep", "recovery"]],
      ["Progress Review", "Review measurements and energy trend", ["review", "progress", "measure"]],
      ["Sustain", "Turn the routine into a stable lifestyle", ["streak", "routine", "habit"]],
    ],
    learning: [
      ["Learning Map", "Choose roadmap, resources, and practice path", ["roadmap", "course", "book", "resource"]],
      ["Daily Practice", "Create a repeatable practice habit", ["practice", "study", "learn"]],
      ["Applied Project", "Build a proof project from the skill", ["project", "build", "apply"]],
      ["Review Loop", "Summarize and explain what you learned", ["review", "notes", "explain"]],
      ["Portfolio Proof", "Publish or demonstrate the skill", ["publish", "portfolio", "demo"]],
    ],
    content: [
      ["Positioning", "Define audience, topic, and content promise", ["audience", "topic", "brand"]],
      ["Pipeline", "Create repeatable capture, write, edit flow", ["write", "edit", "pipeline"]],
      ["Publish", "Ship the first consistent content set", ["publish", "post", "video"]],
      ["Feedback", "Read audience signal and improve format", ["feedback", "analytics", "comments"]],
      ["Scale", "Turn winning ideas into a repeatable system", ["scale", "series", "schedule"]],
    ],
    general: [
      ["Define Outcome", "Define success and constraints clearly", ["define", "success", "outcome"]],
      ["Plan", "Break the goal into milestones and tasks", ["plan", "roadmap", "task"]],
      ["Execute", "Complete the first visible progress block", ["execute", "build", "complete"]],
      ["Review", "Check blockers, feedback, and quality", ["review", "feedback", "fix"]],
      ["Finish", "Ship, close, or convert the goal into a habit", ["finish", "ship", "complete"]],
    ],
  };
  return templates[goalType] || templates.general;
}

function buildRoadmap(goal, relatedRecords) {
  const goalType = detectGoalType(goal);
  const progress = Number(goal.progress || 0);
  return roadmapTemplate(goalType).map(([phase, description, keywords], index) => {
    const threshold = index * 20;
    const nextThreshold = (index + 1) * 20;
    const phaseEvidence = relatedRecords.filter((record) => {
      const text = textOf(record).toLowerCase();
      return keywords.some((keyword) => text.includes(keyword));
    });
    const status = progress >= nextThreshold || phaseEvidence.some((record) => PRODUCTIVE_WORDS.test(textOf(record)))
      ? "complete"
      : progress >= threshold
        ? "active"
        : "planned";
    return {
      id: `${goal.id}-phase-${index + 1}`,
      phase,
      description,
      status,
      progress: clamp(progress - threshold, 0, 20) * 5,
      evidence: phaseEvidence.slice(0, 5).map((record) => evidenceItem(record, `${phase} evidence`)),
    };
  });
}

function estimateCompletion({ goal, relatedRecords, momentumScore }) {
  if (goal.targetDate) return goal.targetDate;
  const progress = Number(goal.progress || 0);
  const remaining = Math.max(10, 100 - progress);
  const velocity = Math.max(4, momentumScore / 14 + relatedRecords.length * 0.35);
  const estimatedDays = clamp((remaining / velocity) * 7, 7, 240);
  return addDays(new Date(), estimatedDays).slice(0, 10);
}

function buildGoalHealth(goal, relatedRecords, futurePredictions) {
  const recent = relatedRecords.filter((record) => daysBetween(timestampOf(record)) <= 7);
  const older = relatedRecords.filter((record) => daysBetween(timestampOf(record)) > 7);
  const blockers = relatedRecords.filter((record) => BLOCKER_WORDS.test(textOf(record)));
  const productive = relatedRecords.filter((record) => PRODUCTIVE_WORDS.test(textOf(record)));
  const daysSinceSignal = relatedRecords.length ? Math.min(...relatedRecords.map((record) => daysBetween(timestampOf(record)))) : 999;
  const progress = Number(goal.progress || 0);
  const momentumScore = clamp(recent.length * 16 + productive.length * 7 + progress * 0.32 - blockers.length * 8);
  const goalPrediction = (futurePredictions?.predictions || []).find((prediction) => {
    const goalTitle = String(goal.title || "").toLowerCase();
    return prediction.metadata?.goalId === goal.id || String(prediction.title || "").toLowerCase().includes(goalTitle.slice(0, 18));
  });
  const successProbability = clamp(goalPrediction?.metadata?.completionProbability || goalPrediction?.predictionScore || (progress * 0.46 + momentumScore * 0.44 + relatedRecords.length * 3));
  const riskScore = clamp(100 - momentumScore + blockers.length * 10 + (daysSinceSignal >= 7 ? 18 : 0) + (goal.status === "paused" ? 24 : 0));
  return {
    progress,
    momentumScore,
    successProbability,
    riskScore,
    riskLevel: riskScore >= 75 ? "High" : riskScore >= 50 ? "Moderate" : "Low",
    daysSinceSignal,
    relatedSignalCount: relatedRecords.length,
    recentSignalCount: recent.length,
    blockerCount: blockers.length,
    productiveSignalCount: productive.length,
    confidence: relatedRecords.length ? clamp(42 + relatedRecords.length * 7 + recent.length * 8) : 42,
    evidence: uniqueBy([
      evidenceItem({ ...goal, type: "goal", timestamp: goal.createdAt }, "declared goal"),
      ...relatedRecords.slice(0, 6).map((record) => evidenceItem(record, "goal activity")),
      ...(goalPrediction?.evidence || []),
    ], (item) => item.id, 8),
  };
}

function currentPhase(roadmap) {
  return roadmap.find((phase) => phase.status === "active") || roadmap.find((phase) => phase.status === "planned") || roadmap[roadmap.length - 1];
}

function buildTasks({ goal, roadmap, health, relatedRecords, index }) {
  const phase = currentPhase(roadmap);
  const goalType = detectGoalType(goal);
  const taskTemplates = {
    "mobile-app": [
      `Complete ${phase.phase.toLowerCase()} before adding new modules`,
      "Test the main mobile flow on one real device",
      "Save one progress note with blockers and next fix",
    ],
    startup: [
      `Move ${phase.phase.toLowerCase()} forward with one shippable artifact`,
      "Collect or review one real user/customer signal",
      "Write the next launch blocker and remove it",
    ],
    fitness: [
      "Complete today's workout or active recovery",
      "Log food, weight, or energy honestly",
      "Prepare the next workout window",
    ],
    learning: [
      "Finish one focused learning block",
      "Write five bullet notes from the session",
      "Apply one concept in a tiny project",
    ],
    content: [
      "Draft one content asset from the current topic",
      "Edit and prepare one publishable version",
      "Capture feedback or analytics after posting",
    ],
    general: [
      `Complete one action from ${phase.phase.toLowerCase()}`,
      "Capture a progress memory after the action",
      "Review the next blocker before switching goals",
    ],
  }[goalType] || [];

  const baseEvidence = uniqueBy([
    evidenceItem({ ...goal, type: "goal", timestamp: goal.createdAt }, "declared goal"),
    ...relatedRecords.slice(0, 5).map((record) => evidenceItem(record, "task context")),
  ], (item) => item.id, 6);

  return taskTemplates.map((title, taskIndex) => {
    const cadence = taskIndex === 0 ? "daily" : taskIndex === 1 ? "weekly" : "monthly";
    const importance = clamp(94 - index * 6 - taskIndex * 8 + health.riskScore * 0.12);
    return {
      id: `chief_task_${stableId(goal.id, phase.id, taskIndex + 1)}`,
      goalId: goal.id,
      goalTitle: goal.title,
      title,
      cadence,
      status: "planned",
      priority: taskIndex === 0 ? "high" : taskIndex === 1 ? "medium" : "medium",
      estimatedMinutes: [45, 35, 20][taskIndex] || 25,
      importanceScore: importance,
      goalImpact: clamp(90 - taskIndex * 7 + health.successProbability * 0.05),
      reasoning: `This supports ${goal.title} by advancing the active roadmap phase: ${phase.phase}.`,
      dueAt: cadence === "daily" ? addDays(new Date(), 1) : cadence === "weekly" ? addDays(new Date(), 7) : addDays(new Date(), 30),
      evidence: baseEvidence,
    };
  });
}

function buildRisks(goal, health, roadmap) {
  const risks = [];
  if (health.daysSinceSignal >= 7) {
    risks.push({
      id: `risk_${stableId(goal.id, "stale")}`,
      goalId: goal.id,
      goalTitle: goal.title,
      title: "Low activity",
      body: health.daysSinceSignal === 999 ? "No activity evidence has been captured for this goal yet." : `No related activity evidence for ${health.daysSinceSignal} days.`,
      severity: health.daysSinceSignal >= 14 ? "high" : "medium",
      confidence: clamp(62 + Math.min(health.daysSinceSignal, 21)),
      evidence: health.evidence,
    });
  }
  if (health.blockerCount > 0) {
    risks.push({
      id: `risk_${stableId(goal.id, "blockers")}`,
      goalId: goal.id,
      goalTitle: goal.title,
      title: "Blockers detected",
      body: `${health.blockerCount} blocker signal${health.blockerCount === 1 ? "" : "s"} appeared in goal-related memories.`,
      severity: health.blockerCount >= 3 ? "high" : "medium",
      confidence: clamp(60 + health.blockerCount * 8),
      evidence: health.evidence,
    });
  }
  if (goal.targetDate && asDate(goal.targetDate) && asDate(goal.targetDate) < new Date() && health.progress < 100) {
    risks.push({
      id: `risk_${stableId(goal.id, "deadline")}`,
      goalId: goal.id,
      goalTitle: goal.title,
      title: "Missed deadline",
      body: `Target date ${goal.targetDate} passed while progress is ${health.progress}%.`,
      severity: "high",
      confidence: 92,
      evidence: health.evidence,
    });
  }
  const stalledPhase = roadmap.find((phase) => phase.status === "active" && !phase.evidence.length && health.daysSinceSignal >= 5);
  if (stalledPhase) {
    risks.push({
      id: `risk_${stableId(goal.id, stalledPhase.id, "phase")}`,
      goalId: goal.id,
      goalTitle: goal.title,
      title: "Milestone stalled",
      body: `${stalledPhase.phase} is active but has no fresh evidence yet.`,
      severity: "medium",
      confidence: 70,
      evidence: health.evidence,
    });
  }
  return risks;
}

function buildGoalPlan({ goal, relatedRecords, futurePredictions, index }) {
  const roadmap = buildRoadmap(goal, relatedRecords);
  const health = buildGoalHealth(goal, relatedRecords, futurePredictions);
  const tasks = buildTasks({ goal, roadmap, health, relatedRecords, index });
  const risks = buildRisks(goal, health, roadmap);
  const estimate = estimateCompletion({ goal, relatedRecords, momentumScore: health.momentumScore });
  const completedMilestones = roadmap.filter((phase) => phase.status === "complete").length;
  return {
    id: `chief_goal_${stableId(goal.id || goal.title)}`,
    goalId: goal.id,
    title: goal.title,
    description: goal.description || "",
    category: goal.category || detectGoalType(goal),
    status: goal.status || "active",
    progress: health.progress,
    estimatedCompletionDate: estimate,
    successProbability: health.successProbability,
    health,
    roadmap,
    tasks,
    risks,
    nextAction: tasks[0] || null,
    progressTracking: {
      completionPercent: health.progress,
      milestonesCompleted: completedMilestones,
      totalMilestones: roadmap.length,
      stalledTasks: risks.filter((risk) => /stalled|activity|blocker/i.test(risk.title)).length,
      missedDeadlines: risks.filter((risk) => risk.title === "Missed deadline").length,
    },
    evidence: health.evidence,
  };
}

function buildOverview(plans) {
  const activeGoals = plans.length;
  const allTasks = plans.flatMap((plan) => plan.tasks);
  const risks = plans.flatMap((plan) => plan.risks);
  const averageHealth = activeGoals ? clamp(plans.reduce((sum, plan) => sum + (100 - plan.health.riskScore), 0) / activeGoals) : 0;
  const averageSuccess = activeGoals ? clamp(plans.reduce((sum, plan) => sum + plan.successProbability, 0) / activeGoals) : 0;
  const momentum = activeGoals ? clamp(plans.reduce((sum, plan) => sum + plan.health.momentumScore, 0) / activeGoals) : 0;
  return {
    activeGoals,
    priorityTaskCount: allTasks.length,
    riskCount: risks.length,
    highRiskCount: risks.filter((risk) => risk.severity === "high").length,
    averageGoalHealth: averageHealth,
    averageSuccessProbability: averageSuccess,
    productivityMomentum: momentum,
  };
}

export function buildAiChiefOfStaff({
  user,
  goals = [],
  memories = [],
  records = [],
  chats = [],
  places = [],
  futurePredictions = null,
  learningProfile = null,
} = {}) {
  const userId = user?.id || "";
  const activeGoals = (goals || []).filter((goal) => goal.status !== "completed");
  const allRecords = normalizeRecords({ memories, records, chats, places });

  if (!userId || !activeGoals.length) {
    return {
      version: "NeuroNest AI Chief of Staff v1",
      userId,
      generatedAt: nowIso(),
      empty: true,
      evidencePolicy: "No goals means no generated plans, tasks, risks, or priorities.",
      overview: buildOverview([]),
      activeGoals: [],
      goalHealth: [],
      priorityTasks: [],
      risks: [],
      nextActions: [],
      weeklyFocus: [],
      recommendations: [],
      progressTracking: {
        completionPercent: 0,
        milestonesCompleted: 0,
        totalMilestones: 0,
        stalledTasks: 0,
        missedDeadlines: 0,
      },
    };
  }

  const plans = activeGoals.map((goal, index) => buildGoalPlan({
    goal,
    relatedRecords: relatedRecordsForGoal(goal, allRecords),
    futurePredictions,
    index,
  }));
  const priorityTasks = plans
    .flatMap((plan) => plan.tasks.map((task) => ({
      ...task,
      riskLevel: plan.health.riskLevel,
      successProbability: plan.successProbability,
    })))
    .sort((a, b) => b.importanceScore + b.goalImpact - (a.importanceScore + a.goalImpact))
    .slice(0, 12);
  const risks = plans.flatMap((plan) => plan.risks).sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.severity] || 0) - ({ high: 3, medium: 2, low: 1 }[a.severity] || 0));
  const nextActions = priorityTasks.slice(0, 5).map((task, index) => ({
    id: `next_action_${stableId(task.id)}`,
    rank: index + 1,
    title: task.title,
    goalId: task.goalId,
    goalTitle: task.goalTitle,
    reason: task.reasoning,
    estimatedMinutes: task.estimatedMinutes,
    confidence: clamp((task.importanceScore + task.goalImpact) / 2),
    evidence: task.evidence,
  }));
  const weeklyFocus = plans.slice(0, 4).map((plan) => ({
    goalId: plan.goalId,
    title: plan.title,
    focus: plan.nextAction?.title || "Capture progress evidence for this goal.",
    target: `Move from ${plan.progress}% to ${clamp(plan.progress + 10)}% progress.`,
    riskLevel: plan.health.riskLevel,
    evidence: plan.evidence,
  }));
  const recommendations = [
    nextActions[0]
      ? {
          title: "Most important task",
          body: nextActions[0].title,
          confidence: nextActions[0].confidence,
          evidence: nextActions[0].evidence,
        }
      : null,
    risks[0]
      ? {
          title: `${risks[0].goalTitle} needs attention`,
          body: risks[0].body,
          confidence: risks[0].confidence,
          evidence: risks[0].evidence,
        }
      : null,
    learningProfile?.behaviorProfile?.mostActiveHours?.[0]
      ? {
          title: "Use learned active window",
          body: `Plan the highest-priority task around ${learningProfile.behaviorProfile.mostActiveHours[0].label || learningProfile.behaviorProfile.mostActiveHours[0]}.`,
          confidence: 68,
          evidence: [],
        }
      : null,
  ].filter(Boolean);
  const progressTracking = {
    completionPercent: plans.length ? clamp(plans.reduce((sum, plan) => sum + plan.progress, 0) / plans.length) : 0,
    milestonesCompleted: plans.reduce((sum, plan) => sum + plan.progressTracking.milestonesCompleted, 0),
    totalMilestones: plans.reduce((sum, plan) => sum + plan.progressTracking.totalMilestones, 0),
    stalledTasks: plans.reduce((sum, plan) => sum + plan.progressTracking.stalledTasks, 0),
    missedDeadlines: plans.reduce((sum, plan) => sum + plan.progressTracking.missedDeadlines, 0),
  };

  return {
    version: "NeuroNest AI Chief of Staff v1",
    userId,
    generatedAt: nowIso(),
    empty: false,
    evidencePolicy: "Plans, tasks, risks, and next actions are generated only from declared goals plus real user activity evidence.",
    overview: buildOverview(plans),
    activeGoals: plans,
    goalHealth: plans.map((plan) => ({
      goalId: plan.goalId,
      title: plan.title,
      progress: plan.progress,
      successProbability: plan.successProbability,
      estimatedCompletionDate: plan.estimatedCompletionDate,
      riskLevel: plan.health.riskLevel,
      momentumScore: plan.health.momentumScore,
      relatedSignalCount: plan.health.relatedSignalCount,
      confidence: plan.health.confidence,
      evidence: plan.evidence,
    })),
    priorityTasks,
    risks,
    nextActions,
    weeklyFocus,
    recommendations,
    progressTracking,
  };
}

export function answerChiefOfStaffQuery(query = "", snapshot = {}) {
  const text = String(query || "").toLowerCase();
  if (!/\b(work on today|highest priority|priority task|which goal|goal needs attention|slowing me down|chief of staff|next action|daily task|weekly focus)\b/i.test(text)) {
    return { matched: false };
  }
  if (snapshot.empty || !snapshot.overview?.activeGoals) {
    return {
      matched: true,
      confidence: 0,
      answer: "I do not have any declared goals to execute yet. Add a Life OS goal first, then I can build roadmaps, tasks, risks, and next actions.",
      evidence: [],
    };
  }
  if (/slowing me down|needs attention|which goal/.test(text)) {
    const risk = snapshot.risks?.[0];
    if (!risk) {
      return {
        matched: true,
        confidence: 72,
        answer: "No major execution risk is visible right now. Your safest move is to complete the top priority task and capture a progress memory afterward.",
        evidence: snapshot.priorityTasks?.[0]?.evidence || [],
      };
    }
    return {
      matched: true,
      confidence: risk.confidence,
      answer: `${risk.goalTitle} needs attention: ${risk.body}`,
      evidence: risk.evidence || [],
      risk,
    };
  }
  const action = snapshot.nextActions?.[0] || snapshot.priorityTasks?.[0];
  return {
    matched: true,
    confidence: action?.confidence || clamp((action?.importanceScore || 0) + (action?.goalImpact || 0) / 2),
    answer: action
      ? `Your highest-priority task is: ${action.title}. It supports ${action.goalTitle} and should take about ${action.estimatedMinutes || 30} minutes.`
      : "No priority task is available yet.",
    evidence: action?.evidence || [],
    action,
  };
}
