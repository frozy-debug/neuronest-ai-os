function unique(items) {
  return [...new Set((Array.isArray(items) ? items : []).filter(Boolean))];
}

function dataUrlBytes(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
}

export function createSupabaseProductionStore() {
  const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  const mediaBucket = process.env.SUPABASE_MEDIA_BUCKET || "neuronest-media";

  function ready() {
    return Boolean(baseUrl && serviceKey);
  }

  function headers(extra = {}) {
    return {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...extra,
    };
  }

  async function rest(path, options = {}) {
    if (!ready()) return { skipped: true, reason: "Supabase production store is not configured." };
    const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
      ...options,
      headers: headers(options.headers || {}),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(data?.message || data?.error || text || `Supabase request failed (${response.status}).`);
    return data;
  }

  async function upsert(table, record) {
    return rest(`${table}?on_conflict=id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(record),
    });
  }

  async function bulkUpsert(table, records = []) {
    if (!records.length) return [];
    return rest(`${table}?on_conflict=id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(records),
    });
  }

  async function deleteUserRows(table, userId) {
    if (!ready() || !userId) return null;
    return rest(`${table}?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }

  async function uploadMedia(userId, memoryId, filePayload) {
    if (!ready() || !filePayload?.dataUrl) return null;
    const parsed = dataUrlBytes(filePayload.dataUrl);
    if (!parsed) return null;
    const safeName = String(filePayload.fileName || "upload.bin").replace(/[^\w.\-]+/g, "_");
    const prefix = String(filePayload.storagePrefix || "").replace(/[^\w-]+/g, "");
    const storagePath = prefix
      ? `${prefix}/${userId}/${memoryId}/${safeName}`
      : `${userId}/${memoryId}/${safeName}`;
    const response = await fetch(`${baseUrl}/storage/v1/object/${mediaBucket}/${storagePath}`, {
      method: "POST",
      headers: headers({
        "Content-Type": filePayload.mimeType || parsed.mimeType,
        "x-upsert": "true",
      }),
      body: parsed.bytes,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || `Supabase media upload failed (${response.status}).`);
    return { storageProvider: "supabase-storage", storagePath, size: parsed.bytes.length };
  }

  async function upsertUser(user) {
    if (!user?.id) return null;
    return upsert("neuronest_users", {
      id: user.id,
      google_sub: user.googleSub || null,
      email: user.email,
      name: user.name || null,
      picture: user.picture || null,
      status: user.status || "active",
      settings: user.settings || {},
      created_at: user.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login_at: user.lastLoginAt || null,
    });
  }

  async function upsertMemory(userId, entry, filePayload = null) {
    if (!entry?.id) return null;
    const memory = await upsert("memories", {
      id: entry.id,
      user_id: userId,
      type: entry.type || entry.kind || "memory",
      title: entry.title,
      content: entry.body || "",
      summary: entry.summary || "",
      tags: unique(entry.tags),
      emotions: unique(entry.emotions),
      importance_score: Number(entry.importanceScore || 0),
      ai_score: Number(entry.aiScore || 0),
      location: entry.location || null,
      media: entry.media || null,
      metadata: entry.metadata || {},
      source: entry.source || null,
      created_at: entry.createdAt || new Date().toISOString(),
      updated_at: entry.updatedAt || new Date().toISOString(),
      deleted_at: entry.deletedAt || null,
    });
    await upsert("timeline_events", {
      id: `timeline_${entry.id}`,
      user_id: userId,
      memory_id: entry.id,
      type: entry.type || entry.kind || "memory",
      title: entry.title,
      description: entry.summary || entry.body || "",
      event_at: entry.createdAt || new Date().toISOString(),
      data: { tags: entry.tags || [], emotions: entry.emotions || [], source: entry.source || "manual" },
    });
    const stored = await uploadMedia(userId, entry.id, filePayload);
    if (stored) {
      const kind = String(entry.type || entry.kind || "file").includes("screenshot")
        ? "screenshot"
        : String(entry.type || entry.kind || "").includes("voice")
          ? "voice"
          : String(filePayload.mimeType || "").startsWith("image/")
            ? "image"
          : "file";
      await upsert("media_records", {
        id: `media_${entry.id}`,
        user_id: userId,
        memory_id: entry.id,
        kind,
        storage_provider: stored.storageProvider,
        storage_path: stored.storagePath,
        file_name: filePayload.fileName || null,
        mime_type: filePayload.mimeType || null,
        size_bytes: stored.size,
        transcript: kind === "voice" ? entry.body || "" : null,
        extracted_text: kind === "screenshot" ? entry.metadata?.ocrText || "" : null,
        ai_description: entry.summary || "",
        metadata: entry.metadata || {},
      });
    }
    return memory;
  }

  async function upsertPlaceMemory(userId, visit) {
    if (!visit?.id) return null;
    return upsert("place_memories", {
      id: visit.id,
      user_id: userId,
      memory_id: visit.memoryId || visit.entryId || null,
      place_id: visit.placeId || null,
      place_name: visit.placeName || null,
      category: visit.category || null,
      address: visit.address || null,
      latitude: Number(visit.latitude),
      longitude: Number(visit.longitude),
      arrival_time: visit.arrivalTime,
      departure_time: visit.departureTime,
      duration_minutes: Number(visit.durationMinutes || 0),
      rating: visit.rating == null ? null : Number(visit.rating),
      website: visit.website || null,
      opening_hours: visit.openingHours || null,
      photo_url: visit.photoUrl || null,
      source: visit.source || "AUTOMATIC",
      metadata_status: visit.metadataStatus || "pending",
      data: visit,
      created_at: visit.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  async function upsertChat(userId, message) {
    if (!message?.id) return null;
    return upsert("ai_chats", {
      id: message.id,
      user_id: userId,
      role: message.role,
      content: message.content,
      language: message.language || null,
      model: message.model || null,
      metadata: message.metadata || {},
      created_at: message.createdAt || new Date().toISOString(),
    });
  }

  async function upsertGoal(userId, goal) {
    if (!goal?.id) return null;
    return upsert("goals", {
      id: goal.id,
      user_id: userId,
      title: goal.title,
      description: goal.description || "",
      status: goal.status || "active",
      progress: Number(goal.progress || 0),
      data: goal,
      created_at: goal.createdAt || new Date().toISOString(),
      updated_at: goal.updatedAt || new Date().toISOString(),
    });
  }

  async function upsertIntelligence(userId, collection, record) {
    const typeMap = {
      digitalTwins: "digital-twin",
      relationships: "relationship-graph",
      predictions: "prediction",
      autonomousIntelligence: "insight",
      replays: "replay",
      insights: "insight",
    };
    if (collection === "aiUsage") {
      return upsert("ai_usage", {
        id: record.id,
        user_id: userId,
        capability: record.capability || record.type || "unknown",
        provider: record.provider || null,
        model: record.model || null,
        status: record.status || "completed",
        metadata: record.metadata || {},
        created_at: record.timestamp || record.createdAt || new Date().toISOString(),
      });
    }
    const type = typeMap[collection];
    if (!type) return null;
    return upsert("intelligence_records", {
      id: record.id,
      user_id: userId,
      type,
      version: record.version || "v2",
      evidence_count: Number(record.evidenceMemoryCount || record.memoryCount || 0),
      data: record,
      created_at: record.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  async function upsertSecurityAudit(event = {}) {
    if (!event?.id) return null;
    return upsert("security_audit_logs", {
      id: event.id,
      actor_user_id: event.actorUserId || null,
      actor_email: event.actorEmail || null,
      actor_role: event.actorRole || "USER",
      action: event.action,
      target_user_id: event.targetUserId || null,
      ip: event.ip || null,
      user_agent: event.userAgent || null,
      severity: event.severity || "LOW",
      metadata: event.metadata || {},
      created_at: event.createdAt || new Date().toISOString(),
    });
  }

  async function replaceRelationshipIntelligence(userId, snapshot = {}) {
    if (!ready() || !userId) return null;
    const profiles = (snapshot.relationships || []).map((item) => ({
      id: item.id,
      user_id: userId,
      person_name: item.personName,
      relationship_type: item.relationshipType || "Unknown",
      first_seen: item.firstSeen || item.createdAt || new Date().toISOString(),
      last_seen: item.lastSeen || item.updatedAt || new Date().toISOString(),
      interaction_count: Number(item.interactionCount || 0),
      interaction_frequency: Number(item.interactionFrequency || 0),
      relationship_strength: Number(item.relationshipStrength || 0),
      positive_score: Number(item.positiveScore || 0),
      negative_score: Number(item.negativeScore || 0),
      emotional_impact: item.emotionalImpact || {},
      trust_score: Number(item.trustScore || 0),
      importance_score: Number(item.importanceScore || 0),
      reconnect_score: Number(item.reconnectScore || 0),
      relationship_status: item.relationshipStatus || "Weak",
      data: item,
      created_at: item.createdAt || new Date().toISOString(),
      updated_at: item.updatedAt || new Date().toISOString(),
    }));
    const events = (snapshot.events || []).map((event) => ({
      id: event.id,
      user_id: userId,
      relationship_id: profiles.find((profile) => profile.data?.personName === event.personName)?.id || null,
      source_type: event.sourceType || "memory",
      source_id: event.sourceId || null,
      interaction_type: event.interactionType || "mention",
      sentiment: event.sentiment || "neutral",
      timestamp: event.timestamp || new Date().toISOString(),
      metadata: { ...(event.metadata || {}), personName: event.personName, sourceTitle: event.sourceTitle },
    }));
    const insights = (snapshot.insights || []).map((insight) => ({
      id: insight.id,
      user_id: userId,
      relationship_id: insight.relationshipId || null,
      insight_type: insight.insightType || "relationship",
      insight_text: insight.insightText || "",
      confidence: Number(insight.confidence || 0),
      evidence: insight.evidence || [],
      created_at: insight.createdAt || new Date().toISOString(),
    }));
    const clusters = (snapshot.clusters || []).map((cluster) => ({
      id: cluster.id,
      user_id: userId,
      cluster_name: cluster.clusterName,
      members: cluster.members || [],
      confidence: Number(cluster.confidence || 0),
      created_at: cluster.createdAt || new Date().toISOString(),
    }));

    await Promise.all([
      deleteUserRows("relationship_events", userId),
      deleteUserRows("relationship_insights", userId),
      deleteUserRows("relationship_clusters", userId),
      deleteUserRows("relationships", userId),
    ]);
    await bulkUpsert("relationships", profiles);
    await bulkUpsert("relationship_events", events);
    await bulkUpsert("relationship_insights", insights);
    await bulkUpsert("relationship_clusters", clusters);
    return { relationships: profiles.length, events: events.length, insights: insights.length, clusters: clusters.length };
  }

  async function replaceFuturePredictions(userId, snapshot = {}) {
    if (!ready() || !userId) return null;
    const predictions = (snapshot.predictions || []).map((item) => ({
      id: item.id,
      user_id: userId,
      type: item.type || "prediction",
      title: item.title || "Prediction",
      summary: item.summary || "",
      confidence: Number(item.confidence || 0),
      evidence: item.evidence || [],
      evidence_count: Number(item.evidenceCount || (item.evidence || []).length || 0),
      prediction_score: Number(item.predictionScore || item.score || 0),
      risk_level: item.riskLevel || "Low",
      status: item.status || "active",
      generated_at: item.generatedAt || snapshot.generatedAt || new Date().toISOString(),
      valid_until: item.validUntil || null,
      data: item,
    }));
    const models = (snapshot.models || []).map((model) => ({
      id: model.id,
      user_id: userId,
      model_type: model.modelType || model.type || "prediction",
      evidence_count: Number(model.evidenceCount || 0),
      prediction_count: Number(model.predictionCount || 0),
      average_confidence: Number(model.averageConfidence || 0),
      average_score: Number(model.averageScore || 0),
      updated_at: model.updatedAt || snapshot.generatedAt || new Date().toISOString(),
      data: model,
    }));
    const history = (snapshot.history || []).map((item) => ({
      id: item.id,
      user_id: userId,
      prediction_id: item.predictionId || null,
      prediction_type: item.predictionType || "prediction",
      outcome: item.outcome || "unknown",
      success: Boolean(item.success),
      confidence: Number(item.confidence || 0),
      evidence: item.evidence || [],
      evaluated_at: item.evaluatedAt || snapshot.generatedAt || new Date().toISOString(),
      data: item,
    }));

    await Promise.all([
      deleteUserRows("prediction_history", userId),
      deleteUserRows("prediction_models", userId),
      deleteUserRows("predictions", userId),
    ]);
    await bulkUpsert("predictions", predictions);
    await bulkUpsert("prediction_models", models);
    await bulkUpsert("prediction_history", history);
    return { predictions: predictions.length, models: models.length, history: history.length };
  }

  async function hydrateAdminDb(db) {
    if (!ready()) return { skipped: true };
    const optionalRest = async (path) => {
      try {
        return await rest(path);
      } catch {
        return [];
      }
    };
    const [users, memories, chats, goals, media, intelligence, usage, embeddings, placeMemories, relationshipProfiles, relationshipEvents, relationshipInsights, relationshipClusters, futurePredictions, predictionModels, predictionHistory, securityAuditLogs] = await Promise.all([
      rest("neuronest_users?select=*&limit=5000"),
      rest("memories?select=*&order=created_at.desc&limit=5000"),
      rest("ai_chats?select=*&order=created_at.desc&limit=5000"),
      rest("goals?select=*&order=updated_at.desc&limit=5000"),
      rest("media_records?select=*&order=created_at.desc&limit=5000"),
      rest("intelligence_records?select=*&order=updated_at.desc&limit=5000"),
      rest("ai_usage?select=*&order=created_at.desc&limit=5000"),
      rest("memory_vectors?select=id,memory_id,user_id,type,provider,model,created_at,updated_at&order=updated_at.desc&limit=5000"),
      optionalRest("place_memories?select=*&order=departure_time.desc&limit=5000"),
      optionalRest("relationships?select=*&order=updated_at.desc&limit=5000"),
      optionalRest("relationship_events?select=*&order=timestamp.desc&limit=5000"),
      optionalRest("relationship_insights?select=*&order=created_at.desc&limit=5000"),
      optionalRest("relationship_clusters?select=*&order=created_at.desc&limit=5000"),
      optionalRest("predictions?select=*&order=generated_at.desc&limit=5000"),
      optionalRest("prediction_models?select=*&order=updated_at.desc&limit=5000"),
      optionalRest("prediction_history?select=*&order=evaluated_at.desc&limit=5000"),
      optionalRest("security_audit_logs?select=*&order=created_at.desc&limit=5000"),
    ]);

    db.users = users.map((user) => ({
      id: user.id,
      googleSub: user.google_sub || "",
      email: user.email,
      name: user.name || user.email,
      picture: user.picture || "",
      status: user.status || "active",
      settings: user.settings || {},
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
      updatedAt: user.updated_at,
    }));
    db.entries = {};
    db.chats = {};
    db.lifeGoals = {};
    db.warehouse ||= {};
    const warehouse = db.warehouse;
    warehouse.memories = [];
    warehouse.screenshots = [];
    warehouse.voiceNotes = [];
    warehouse.places = [];
    warehouse.placeMemories = placeMemories.map((visit) => ({
      ...(visit.data || {}),
      id: visit.id,
      userId: visit.user_id,
      memoryId: visit.memory_id,
      entryId: visit.memory_id,
      placeId: visit.place_id,
      placeName: visit.place_name,
      category: visit.category,
      address: visit.address,
      latitude: visit.latitude,
      longitude: visit.longitude,
      arrivalTime: visit.arrival_time,
      departureTime: visit.departure_time,
      durationMinutes: visit.duration_minutes,
      rating: visit.rating,
      website: visit.website,
      openingHours: visit.opening_hours,
      photoUrl: visit.photo_url,
      source: visit.source,
      metadataStatus: visit.metadata_status,
      createdAt: visit.created_at,
    }));
    warehouse.locationSamples ||= [];
    warehouse.passivePlaceStates ||= {};
    warehouse.placeMetadataQueue ||= [];
    warehouse.timelineEvents = [];
    warehouse.aiChats = [];
    warehouse.goals = [];
    warehouse.aiUsage = usage.map((item) => ({
      id: item.id,
      userId: item.user_id,
      capability: item.capability,
      provider: item.provider,
      model: item.model,
      status: item.status,
      metadata: item.metadata || {},
      timestamp: item.created_at,
    }));
    warehouse.fileStorage = [];
    warehouse.embeddings = embeddings.map((item) => ({
      id: item.id,
      memoryId: item.memory_id,
      userId: item.user_id,
      type: item.type,
      provider: item.provider || "openai",
      model: item.model || "text-embedding-3-small",
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));
    warehouse.relationships = [];
    warehouse.relationshipProfiles = relationshipProfiles.map((item) => ({
      ...(item.data || {}),
      id: item.id,
      userId: item.user_id,
      personName: item.person_name,
      relationshipType: item.relationship_type,
      firstSeen: item.first_seen,
      lastSeen: item.last_seen,
      interactionCount: item.interaction_count,
      interactionFrequency: item.interaction_frequency,
      relationshipStrength: item.relationship_strength,
      positiveScore: item.positive_score,
      negativeScore: item.negative_score,
      emotionalImpact: item.emotional_impact || {},
      trustScore: item.trust_score,
      importanceScore: item.importance_score,
      reconnectScore: item.reconnect_score,
      relationshipStatus: item.relationship_status,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));
    warehouse.relationshipEvents = relationshipEvents.map((item) => ({
      id: item.id,
      userId: item.user_id,
      relationshipId: item.relationship_id,
      sourceType: item.source_type,
      sourceId: item.source_id,
      interactionType: item.interaction_type,
      sentiment: item.sentiment,
      timestamp: item.timestamp,
      metadata: item.metadata || {},
      personName: item.metadata?.personName || "",
      sourceTitle: item.metadata?.sourceTitle || "",
    }));
    warehouse.relationshipInsights = relationshipInsights.map((item) => ({
      id: item.id,
      userId: item.user_id,
      relationshipId: item.relationship_id,
      insightType: item.insight_type,
      insightText: item.insight_text,
      confidence: item.confidence,
      evidence: item.evidence || [],
      createdAt: item.created_at,
    }));
    warehouse.relationshipClusters = relationshipClusters.map((item) => ({
      id: item.id,
      userId: item.user_id,
      clusterName: item.cluster_name,
      members: item.members || [],
      confidence: item.confidence,
      createdAt: item.created_at,
    }));
    warehouse.digitalTwins = [];
    warehouse.predictions = [];
    warehouse.futurePredictions = futurePredictions.map((item) => ({
      ...(item.data || {}),
      id: item.id,
      userId: item.user_id,
      type: item.type,
      title: item.title,
      summary: item.summary,
      confidence: item.confidence,
      evidence: item.evidence || [],
      evidenceCount: item.evidence_count,
      predictionScore: item.prediction_score,
      riskLevel: item.risk_level,
      status: item.status,
      generatedAt: item.generated_at,
      validUntil: item.valid_until,
    }));
    warehouse.predictionModels = predictionModels.map((item) => ({
      ...(item.data || {}),
      id: item.id,
      userId: item.user_id,
      modelType: item.model_type,
      evidenceCount: item.evidence_count,
      predictionCount: item.prediction_count,
      averageConfidence: item.average_confidence,
      averageScore: item.average_score,
      updatedAt: item.updated_at,
    }));
    warehouse.predictionHistory = predictionHistory.map((item) => ({
      ...(item.data || {}),
      id: item.id,
      userId: item.user_id,
      predictionId: item.prediction_id,
      predictionType: item.prediction_type,
      outcome: item.outcome,
      success: item.success,
      confidence: item.confidence,
      evidence: item.evidence || [],
      evaluatedAt: item.evaluated_at,
    }));
    db.securityAuditLogs = securityAuditLogs.map((item) => ({
      id: item.id,
      actorUserId: item.actor_user_id || "",
      actorEmail: item.actor_email || "",
      actorRole: item.actor_role || "USER",
      action: item.action,
      targetUserId: item.target_user_id || "",
      ip: item.ip || "",
      userAgent: item.user_agent || "",
      severity: item.severity || "LOW",
      metadata: item.metadata || {},
      createdAt: item.created_at,
    }));
    warehouse.securityAuditLogs = [...db.securityAuditLogs];
    warehouse.replays = [];
    warehouse.insights = [];
    warehouse.aiJobs ||= [];

    for (const memory of memories) {
      const entry = {
        id: memory.id,
        kind: memory.type,
        type: memory.type,
        title: memory.title,
        body: memory.content || "",
        summary: memory.summary || "",
        tags: memory.tags || [],
        emotions: memory.emotions || [],
        importanceScore: memory.importance_score || 0,
        aiScore: memory.ai_score || 0,
        location: memory.location,
        media: memory.media,
        metadata: memory.metadata || {},
        source: memory.source || "",
        createdAt: memory.created_at,
        updatedAt: memory.updated_at,
        deletedAt: memory.deleted_at,
      };
      db.entries[memory.user_id] ||= [];
      db.entries[memory.user_id].push(entry);
      if (!memory.deleted_at) {
        warehouse.memories.push({
          id: `memory_${memory.id}`,
          entryId: memory.id,
          userId: memory.user_id,
          title: memory.title,
          content: memory.content || memory.summary || "",
          type: memory.type,
          importance: memory.importance_score || 0,
          createdDate: memory.created_at,
          tags: memory.tags || [],
          embeddingId: null,
        });
        warehouse.timelineEvents.push({
          id: `timeline_${memory.id}`,
          entryId: memory.id,
          userId: memory.user_id,
          title: memory.title,
          type: memory.type,
          timestamp: memory.created_at,
        });
        if (memory.type === "place") {
          const passiveVisit = warehouse.placeMemories.find((visit) => visit.memoryId === memory.id);
          warehouse.places.push({
            ...(passiveVisit || {}),
            id: passiveVisit?.id || `place_${memory.id}`,
            entryId: memory.id,
            userId: memory.user_id,
            placeName: passiveVisit?.placeName || memory.title,
            location: memory.location,
            createdDate: memory.created_at,
          });
        }
      }
    }

    for (const chat of chats) {
      const record = { id: chat.id, role: chat.role, content: chat.content, createdAt: chat.created_at, metadata: chat.metadata || {} };
      db.chats[chat.user_id] ||= [];
      db.chats[chat.user_id].push(record);
      warehouse.aiChats.push({ ...record, userId: chat.user_id, message: chat.content, response: chat.role === "assistant" ? chat.content : "" });
    }
    for (const goal of goals) {
      const record = { ...(goal.data || {}), id: goal.id, title: goal.title, description: goal.description, status: goal.status, progress: goal.progress, createdAt: goal.created_at, updatedAt: goal.updated_at };
      db.lifeGoals[goal.user_id] ||= [];
      db.lifeGoals[goal.user_id].push(record);
      warehouse.goals.push({ ...record, userId: goal.user_id });
    }
    for (const item of media) {
      const fileUrl = `${mediaBucket}/${item.storage_path}`;
      warehouse.fileStorage.push({ id: item.id, userId: item.user_id, fileName: item.file_name, fileUrl, mimeType: item.mime_type, kind: item.kind, createdAt: item.created_at });
      if (item.kind === "screenshot") warehouse.screenshots.push({ id: item.id, userId: item.user_id, entryId: item.memory_id, fileName: item.file_name, fileUrl, uploadDate: item.created_at, ocrSummary: item.ai_description || item.extracted_text || "" });
      if (item.kind === "voice") warehouse.voiceNotes.push({ id: item.id, userId: item.user_id, entryId: item.memory_id, audioUrl: fileUrl, transcript: item.transcript || "", createdDate: item.created_at });
    }
    const collectionMap = {
      "digital-twin": "digitalTwins",
      "relationship-graph": "relationships",
      prediction: "predictions",
      replay: "replays",
      insight: "insights",
    };
    for (const item of intelligence) {
      const data = item.data || {};
      const collection = data.type === "autonomous-intelligence" ? "autonomousIntelligence" : collectionMap[item.type];
      if (collection) warehouse[collection].push({ ...data, id: item.id, userId: item.user_id, createdAt: item.created_at, updatedAt: item.updated_at });
    }
    warehouse.lastSyncAt = new Date().toISOString();
    warehouse.productionSource = "supabase";
    return { users: users.length, memories: memories.length, chats: chats.length, media: media.length, intelligence: intelligence.length };
  }

  return {
    ready,
    upsertUser,
    upsertMemory,
    upsertPlaceMemory,
    upsertChat,
    upsertGoal,
    upsertIntelligence,
    upsertSecurityAudit,
    replaceRelationshipIntelligence,
    replaceFuturePredictions,
    hydrateAdminDb,
  };
}
