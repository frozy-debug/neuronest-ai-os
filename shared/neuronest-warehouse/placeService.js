import crypto from "node:crypto";

function upsertByKey(list, key, value, record) {
  const index = list.findIndex((item) => item[key] === value);
  if (index === -1) list.unshift(record);
  else list[index] = { ...list[index], ...record };
  return record;
}

export function createPlaceService({ databaseService, activityService }) {
  function syncFromEntry(db, userId, entry, { silent = false } = {}) {
    const kind = String(entry?.type || entry?.kind || "").toLowerCase();
    if (!entry?.id || entry.deletedAt || !kind.includes("place")) return null;

    databaseService.normalizeWarehouse(db);
    const existing = db.warehouse.places.find((item) => item.entryId === entry.id && item.userId === userId);
    const location = entry.location || entry.metadata?.location || {};
    const record = {
      id: entry.warehousePlaceId || crypto.randomUUID(),
      userId,
      entryId: entry.id,
      placeName: entry.title || location.label || "Saved place",
      latitude: Number(location.lat ?? location.latitude ?? 0),
      longitude: Number(location.lng ?? location.longitude ?? 0),
      address: location.label || entry.meta || entry.body || "",
      placeId: entry.metadata?.placeId || location.placeId || null,
      category: entry.metadata?.category || entry.meta || null,
      arrivalTime: entry.metadata?.arrivalTime || null,
      departureTime: entry.metadata?.departureTime || null,
      durationMinutes: Number(entry.metadata?.durationMinutes || 0) || null,
      rating: Number(entry.metadata?.rating || 0) || null,
      website: entry.metadata?.website || null,
      openingHours: entry.metadata?.openingHours || null,
      photoUrl: entry.metadata?.photoUrl || entry.media?.fileUrl || null,
      photoAttributions: entry.metadata?.photoAttributions || [],
      source: entry.source || entry.metadata?.source || "MANUAL",
      metadataStatus: entry.metadata?.metadataStatus || null,
      createdDate: entry.createdAt || new Date().toISOString(),
    };

    upsertByKey(db.warehouse.places, "entryId", entry.id, record);
    if (entry.metadata?.passivePlaceVisit) {
      const placeMemory = {
        ...record,
        id: entry.metadata.visitId || record.id,
        memoryId: entry.id,
        createdAt: entry.createdAt || new Date().toISOString(),
      };
      upsertByKey(db.warehouse.placeMemories, "id", placeMemory.id, placeMemory);
    }
    if (!silent && !existing) {
      activityService.logActivity(db, userId, activityService.ActivityActions.PLACE_SAVED, {
        entryId: entry.id,
        placeName: record.placeName,
      });
    }
    return record;
  }

  function getUserPlaces(db, userId, limit = 100) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.places
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))
      .slice(0, limit);
  }

  function getUserPlaceMemories(db, userId, limit = 100) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.placeMemories
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.departureTime || b.createdAt) - new Date(a.departureTime || a.createdAt))
      .slice(0, limit);
  }

  return {
    syncFromEntry,
    getUserPlaces,
    getUserPlaceMemories,
  };
}

export function createTimelineService({ databaseService }) {
  function syncFromEntry(db, userId, entry) {
    if (!entry?.id || entry.deletedAt) return null;

    databaseService.normalizeWarehouse(db);
    const record = {
      id: entry.warehouseTimelineId || crypto.randomUUID(),
      userId,
      entryId: entry.id,
      title: entry.title || "Timeline event",
      description: entry.body || entry.summary || "",
      timestamp: entry.createdAt || new Date().toISOString(),
      type: entry.type || entry.kind || "memory",
    };

    upsertByKey(db.warehouse.timelineEvents, "entryId", entry.id, record);
    return record;
  }

  function getUserTimeline(db, userId, limit = 100) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.timelineEvents
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  return {
    syncFromEntry,
    getUserTimeline,
  };
}

export function createGoalService({ databaseService, activityService }) {
  function syncGoal(db, userId, goal, action = "GOAL_CREATED", { silent = false } = {}) {
    if (!goal?.id) return null;
    databaseService.normalizeWarehouse(db);
    const existing = db.warehouse.goals.find((item) => item.goalId === goal.id && item.userId === userId);
    const record = {
      id: goal.warehouseGoalId || crypto.randomUUID(),
      userId,
      goalId: goal.id,
      title: goal.title || "",
      description: goal.description || "",
      category: goal.category || "life",
      priority: goal.priority || "medium",
      progress: goal.progress || 0,
      status: goal.status || "active",
      createdDate: goal.createdAt || new Date().toISOString(),
      updatedDate: goal.updatedAt || goal.createdAt || new Date().toISOString(),
    };

    upsertByKey(db.warehouse.goals, "goalId", goal.id, record);
    if (!silent) {
      activityService.logActivity(
        db,
        userId,
        action === "GOAL_UPDATED" || existing ? activityService.ActivityActions.GOAL_UPDATED : activityService.ActivityActions.GOAL_CREATED,
        { goalId: goal.id, title: goal.title },
      );
    }
    return record;
  }

  function getUserGoals(db, userId, limit = 100) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.goals
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.updatedDate) - new Date(a.updatedDate))
      .slice(0, limit);
  }

  return {
    syncGoal,
    getUserGoals,
  };
}
