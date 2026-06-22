export function createAdminSyncService({
  databaseService,
  userService,
  memoryService,
  screenshotService,
  voiceNoteService,
  placeService,
  timelineService,
  goalService,
  chatService,
  activityService,
}) {
  function syncEntry(db, userId, entry, filePayload = null, options = {}) {
    if (!entry?.id) return db;
    databaseService.normalizeWarehouse(db);
    const silent = Boolean(options.silent);

    memoryService.syncFromEntry(db, userId, entry, { silent });
    timelineService.syncFromEntry(db, userId, entry);

    const kind = String(entry.type || entry.kind || "").toLowerCase();
    if (kind.includes("screenshot")) {
      screenshotService.saveScreenshot(db, userId, entry, filePayload, { silent });
    } else if (kind.includes("voice")) {
      const fileRecord = filePayload ? databaseService.saveFile(userId, filePayload) : null;
      voiceNoteService.syncFromEntry(db, userId, entry, fileRecord, { silent });
    } else if (kind.includes("place")) {
      placeService.syncFromEntry(db, userId, entry, { silent });
    }

    return db;
  }

  function syncUserLogin(db, user, { isNew = false, silent = false } = {}) {
    userService.syncUser(db, user, { isNew, silent });
    return db;
  }

  function syncChat(db, userId, userMessage, assistantMessage = null, options = {}) {
    chatService.syncChatMessage(db, userId, userMessage, assistantMessage, options);
    return db;
  }

  function syncGoal(db, userId, goal, action = "GOAL_CREATED", options = {}) {
    goalService.syncGoal(db, userId, goal, action, options);
    return db;
  }

  function syncDecision(db, userId, decision, options = {}) {
    databaseService.normalizeWarehouse(db);
    if (!decision?.id || !userId) return null;
    const now = new Date().toISOString();
    const record = {
      ...decision,
      userId,
      type: "life-decision",
      createdAt: decision.createdAt || now,
      updatedAt: decision.updatedAt || now,
    };
    const index = db.warehouse.decisions.findIndex((item) => item.id === decision.id && item.userId === userId);
    if (index === -1) db.warehouse.decisions.unshift(record);
    else db.warehouse.decisions[index] = { ...db.warehouse.decisions[index], ...record };
    db.warehouse.decisions = db.warehouse.decisions.slice(0, 10_000);
    if (!options.silent) {
      activityService.logActivity(db, userId, activityService.ActivityActions.MEMORY_CREATED, {
        decisionId: decision.id,
        title: decision.decision,
        kind: "life-decision",
      });
    }
    return record;
  }

  function syncIntelligenceRecord(db, collection, userId, record = {}) {
    databaseService.normalizeWarehouse(db);
    const allowed = new Set([
      "embeddings",
      "relationships",
      "relationshipProfiles",
      "relationshipEvents",
      "relationshipInsights",
      "relationshipClusters",
      "digitalTwins",
      "predictions",
      "decisions",
      "futurePredictions",
      "predictionModels",
      "predictionHistory",
      "autonomousIntelligence",
      "chiefOfStaff",
      "memoryTimeMachine",
      "memoryAtlas",
      "decisionIntelligence",
      "opportunityEngine",
      "replays",
      "insights",
      "aiJobs",
      "aiUsage",
    ]);
    if (!allowed.has(collection) || !userId) return null;
    const now = new Date().toISOString();
    const id = String(record.id || `${collection}_${userId}`);
    const next = {
      ...record,
      id,
      userId,
      createdAt: record.createdAt || now,
      updatedAt: now,
    };
    const rows = db.warehouse[collection];
    const index = rows.findIndex((item) => item.id === id && item.userId === userId);
    if (index === -1) rows.unshift(next);
    else rows[index] = { ...rows[index], ...next, createdAt: rows[index].createdAt || next.createdAt };
    db.warehouse[collection] = rows.slice(0, 5000);
    return next;
  }

  function syncEntryDeleted(db, userId, entryId, options = {}) {
    memoryService.removeByEntryId(db, userId, entryId, options);
    databaseService.normalizeWarehouse(db);
    db.warehouse.screenshots = db.warehouse.screenshots.filter((item) => !(item.userId === userId && item.entryId === entryId));
    db.warehouse.voiceNotes = db.warehouse.voiceNotes.filter((item) => !(item.userId === userId && item.entryId === entryId));
    db.warehouse.places = db.warehouse.places.filter((item) => !(item.userId === userId && item.entryId === entryId));
    db.warehouse.placeMemories = db.warehouse.placeMemories.filter((item) => !(item.userId === userId && item.entryId === entryId));
    db.warehouse.timelineEvents = db.warehouse.timelineEvents.filter((item) => !(item.userId === userId && item.entryId === entryId));
    return db;
  }

  function migrateLegacyData(db) {
    databaseService.normalizeWarehouse(db);
    if (db.warehouse.migratedAt) return db;

    for (const user of db.users) {
      userService.syncUser(db, user, { isNew: false, silent: true });
    }

    for (const [userId, entries] of Object.entries(db.entries || {})) {
      for (const entry of entries || []) {
        if (!entry.deletedAt) syncEntry(db, userId, entry, null, { silent: true });
      }
    }

    for (const [userId, messages] of Object.entries(db.chats || {})) {
      const sorted = [...(messages || [])].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      for (let i = 0; i < sorted.length; i += 1) {
        const message = sorted[i];
        if (message.role === "user") {
          const assistant = sorted[i + 1]?.role === "assistant" ? sorted[i + 1] : null;
          chatService.syncChatMessage(db, userId, message, assistant, { silent: true });
        }
      }
    }

    for (const [userId, goals] of Object.entries(db.lifeGoals || {})) {
      for (const goal of goals || []) {
        goalService.syncGoal(db, userId, goal, "GOAL_CREATED", { silent: true });
      }
    }

    db.warehouse.migratedAt = new Date().toISOString();
    return db;
  }

  function buildUserStats(db, userId) {
    const memories = memoryService.getUserMemories(db, userId, 10000);
    const chats = chatService.getUserChats(db, userId, 10000);
    const voiceNotes = voiceNoteService.getUserVoiceNotes(db, userId, 10000);
    const screenshots = screenshotService.getUserScreenshots(db, userId, 10000);
    const places = placeService.getUserPlaces(db, userId, 10000);
    const timeline = timelineService.getUserTimeline(db, userId, 10000);
    const aiUsage = chatService.getUserAiUsage(db, userId, 10000);

    return {
      memoryCount: memories.length,
      chatCount: chats.length,
      voiceNotesCount: voiceNotes.length,
      screenshotCount: screenshots.length,
      placeCount: places.length,
      passivePlaceCount: placeService.getUserPlaceMemories(db, userId, 10000).length,
      timelineCount: timeline.length,
      aiRequestsCount: aiUsage.length,
      goalCount: goalService.getUserGoals(db, userId, 10000).length,
    };
  }

  function buildUserDetail(db, userId) {
    const profile = userService.getUserProfile(db, userId);
    if (!profile) return null;

    const stats = buildUserStats(db, userId);
    return {
      profile,
      stats,
      memories: memoryService.getUserMemories(db, userId, 50),
      screenshots: screenshotService.getUserScreenshots(db, userId, 50),
      chats: chatService.getUserChats(db, userId, 50),
      voiceNotes: voiceNoteService.getUserVoiceNotes(db, userId, 50),
      places: placeService.getUserPlaces(db, userId, 50),
      placeMemories: placeService.getUserPlaceMemories(db, userId, 50),
      timeline: timelineService.getUserTimeline(db, userId, 50),
      goals: goalService.getUserGoals(db, userId, 50),
      decisions: db.warehouse.decisions.filter((item) => item.userId === userId).slice(0, 50),
      aiUsage: chatService.getUserAiUsage(db, userId, 50),
      relationshipProfiles: db.warehouse.relationshipProfiles.filter((item) => item.userId === userId).slice(0, 50),
      relationshipEvents: db.warehouse.relationshipEvents.filter((item) => item.userId === userId).slice(0, 50),
      relationshipInsights: db.warehouse.relationshipInsights.filter((item) => item.userId === userId).slice(0, 50),
      relationshipClusters: db.warehouse.relationshipClusters.filter((item) => item.userId === userId).slice(0, 50),
      futurePredictions: db.warehouse.futurePredictions.filter((item) => item.userId === userId).slice(0, 50),
      predictionModels: db.warehouse.predictionModels.filter((item) => item.userId === userId).slice(0, 50),
      predictionHistory: db.warehouse.predictionHistory.filter((item) => item.userId === userId).slice(0, 50),
      autonomousIntelligence: db.warehouse.autonomousIntelligence.filter((item) => item.userId === userId).slice(0, 20),
      chiefOfStaff: db.warehouse.chiefOfStaff.filter((item) => item.userId === userId).slice(0, 20),
      memoryTimeMachine: db.warehouse.memoryTimeMachine.filter((item) => item.userId === userId).slice(0, 20),
      memoryAtlas: db.warehouse.memoryAtlas.filter((item) => item.userId === userId).slice(0, 20),
      decisionIntelligence: db.warehouse.decisionIntelligence.filter((item) => item.userId === userId).slice(0, 20),
      opportunityEngine: db.warehouse.opportunityEngine.filter((item) => item.userId === userId).slice(0, 20),
      activityHistory: activityService.getUserActivity(db, userId, 50),
    };
  }

  function buildSyncSnapshot(db) {
    databaseService.normalizeWarehouse(db);
    return {
      lastSyncAt: db.warehouse.lastSyncAt,
      migratedAt: db.warehouse.migratedAt || null,
      totals: {
        users: db.users.length,
        memories: db.warehouse.memories.length,
        screenshots: db.warehouse.screenshots.length,
        voiceNotes: db.warehouse.voiceNotes.length,
        places: db.warehouse.places.length,
        placeMemories: db.warehouse.placeMemories.length,
        timelineEvents: db.warehouse.timelineEvents.length,
        aiChats: db.warehouse.aiChats.length,
        decisions: db.warehouse.decisions.length,
        activityEvents: db.warehouse.activityStream.length,
        embeddings: db.warehouse.embeddings.length,
        relationships: db.warehouse.relationships.length,
        relationshipProfiles: db.warehouse.relationshipProfiles.length,
        relationshipEvents: db.warehouse.relationshipEvents.length,
        relationshipInsights: db.warehouse.relationshipInsights.length,
        relationshipClusters: db.warehouse.relationshipClusters.length,
        digitalTwins: db.warehouse.digitalTwins.length,
        predictions: db.warehouse.predictions.length,
        futurePredictions: db.warehouse.futurePredictions.length,
        predictionModels: db.warehouse.predictionModels.length,
        predictionHistory: db.warehouse.predictionHistory.length,
        autonomousIntelligence: db.warehouse.autonomousIntelligence.length,
        chiefOfStaff: db.warehouse.chiefOfStaff.length,
        memoryTimeMachine: db.warehouse.memoryTimeMachine.length,
        memoryAtlas: db.warehouse.memoryAtlas.length,
        decisionIntelligence: db.warehouse.decisionIntelligence.length,
        opportunityEngine: db.warehouse.opportunityEngine.length,
        securityAuditLogs: db.warehouse.securityAuditLogs.length,
        replays: db.warehouse.replays.length,
        insights: db.warehouse.insights.length,
        aiJobs: db.warehouse.aiJobs.length,
      },
      recentActivity: activityService.getRecentActivity(db, 24),
    };
  }

  function getWarehouseCollection(db, collection, limit = 300) {
    databaseService.normalizeWarehouse(db);
    const warehouse = db.warehouse;
    const map = {
      memories: warehouse.memories,
      screenshots: warehouse.screenshots,
      voiceNotes: warehouse.voiceNotes,
      places: warehouse.places,
      placeMemories: warehouse.placeMemories,
      timeline: warehouse.timelineEvents,
      aiChats: warehouse.aiChats,
      goals: warehouse.goals,
      decisions: warehouse.decisions,
      aiUsage: warehouse.aiUsage,
      activityStream: warehouse.activityStream,
      fileStorage: warehouse.fileStorage,
      embeddings: warehouse.embeddings,
      vectors: warehouse.embeddings,
      relationships: warehouse.relationships,
      relationshipProfiles: warehouse.relationshipProfiles,
      relationshipEvents: warehouse.relationshipEvents,
      relationshipInsights: warehouse.relationshipInsights,
      relationshipClusters: warehouse.relationshipClusters,
      digitalTwins: warehouse.digitalTwins,
      predictions: warehouse.predictions,
      futurePredictions: warehouse.futurePredictions,
      predictionModels: warehouse.predictionModels,
      predictionHistory: warehouse.predictionHistory,
      autonomousIntelligence: warehouse.autonomousIntelligence,
      chiefOfStaff: warehouse.chiefOfStaff,
      memoryTimeMachine: warehouse.memoryTimeMachine,
      memoryAtlas: warehouse.memoryAtlas,
      decisionIntelligence: warehouse.decisionIntelligence,
      opportunityEngine: warehouse.opportunityEngine,
      securityAuditLogs: warehouse.securityAuditLogs,
      replays: warehouse.replays,
      insights: warehouse.insights,
      aiJobs: warehouse.aiJobs,
    };
    const rows = (map[collection] || []).slice(0, limit);
    return rows;
  }

  function purgeUserWarehouse(db, userId) {
    databaseService.normalizeWarehouse(db);
    const filterOut = (list) => list.filter((item) => item.userId !== userId);
    db.warehouse.memories = filterOut(db.warehouse.memories);
    db.warehouse.screenshots = filterOut(db.warehouse.screenshots);
    db.warehouse.voiceNotes = filterOut(db.warehouse.voiceNotes);
    db.warehouse.places = filterOut(db.warehouse.places);
    db.warehouse.placeMemories = filterOut(db.warehouse.placeMemories);
    db.warehouse.locationSamples = filterOut(db.warehouse.locationSamples);
    delete db.warehouse.passivePlaceStates[userId];
    db.warehouse.placeMetadataQueue = filterOut(db.warehouse.placeMetadataQueue);
    db.warehouse.timelineEvents = filterOut(db.warehouse.timelineEvents);
    db.warehouse.aiChats = filterOut(db.warehouse.aiChats);
    db.warehouse.goals = filterOut(db.warehouse.goals);
    db.warehouse.decisions = filterOut(db.warehouse.decisions);
    db.warehouse.aiUsage = filterOut(db.warehouse.aiUsage);
    db.warehouse.activityStream = filterOut(db.warehouse.activityStream);
    db.warehouse.fileStorage = filterOut(db.warehouse.fileStorage);
    db.warehouse.embeddings = filterOut(db.warehouse.embeddings);
    db.warehouse.relationships = filterOut(db.warehouse.relationships);
    db.warehouse.relationshipProfiles = filterOut(db.warehouse.relationshipProfiles);
    db.warehouse.relationshipEvents = filterOut(db.warehouse.relationshipEvents);
    db.warehouse.relationshipInsights = filterOut(db.warehouse.relationshipInsights);
    db.warehouse.relationshipClusters = filterOut(db.warehouse.relationshipClusters);
    db.warehouse.digitalTwins = filterOut(db.warehouse.digitalTwins);
    db.warehouse.predictions = filterOut(db.warehouse.predictions);
    db.warehouse.futurePredictions = filterOut(db.warehouse.futurePredictions);
    db.warehouse.predictionModels = filterOut(db.warehouse.predictionModels);
    db.warehouse.predictionHistory = filterOut(db.warehouse.predictionHistory);
    db.warehouse.autonomousIntelligence = filterOut(db.warehouse.autonomousIntelligence);
    db.warehouse.chiefOfStaff = filterOut(db.warehouse.chiefOfStaff);
    db.warehouse.memoryTimeMachine = filterOut(db.warehouse.memoryTimeMachine);
    db.warehouse.memoryAtlas = filterOut(db.warehouse.memoryAtlas);
    db.warehouse.decisionIntelligence = filterOut(db.warehouse.decisionIntelligence);
    db.warehouse.opportunityEngine = filterOut(db.warehouse.opportunityEngine);
    db.warehouse.replays = filterOut(db.warehouse.replays);
    db.warehouse.insights = filterOut(db.warehouse.insights);
    db.warehouse.aiJobs = filterOut(db.warehouse.aiJobs);
    return db;
  }

  return {
    syncEntry,
    syncUserLogin,
    syncChat,
    syncGoal,
    syncDecision,
    syncIntelligenceRecord,
    syncEntryDeleted,
    migrateLegacyData,
    buildUserDetail,
    buildUserStats,
    buildSyncSnapshot,
    getWarehouseCollection,
    purgeUserWarehouse,
  };
}
