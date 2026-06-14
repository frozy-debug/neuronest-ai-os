import crypto from "node:crypto";

function upsertByKey(list, key, value, record) {
  const index = list.findIndex((item) => item[key] === value);
  if (index === -1) list.unshift(record);
  else list[index] = { ...list[index], ...record };
  return record;
}

export function createMemoryService({ databaseService, activityService }) {
  function syncFromEntry(db, userId, entry, { silent = false } = {}) {
    if (!entry?.id || entry.deletedAt) return removeByEntryId(db, userId, entry.id, { silent });

    databaseService.normalizeWarehouse(db);
    const existing = db.warehouse.memories.find((item) => item.entryId === entry.id && item.userId === userId);
    const record = {
      id: existing?.id || entry.warehouseMemoryId || crypto.randomUUID(),
      userId,
      entryId: entry.id,
      title: entry.title || "Untitled",
      content: entry.body || entry.summary || "",
      type: entry.type || entry.kind || "memory",
      importance: entry.importanceScore || entry.aiScore || 50,
      createdDate: entry.createdAt || new Date().toISOString(),
      tags: entry.tags || [],
      embeddingId: entry.embeddingId || null,
    };

    upsertByKey(db.warehouse.memories, "entryId", entry.id, record);
    if (!silent && !existing) {
      activityService.logActivity(db, userId, activityService.ActivityActions.MEMORY_CREATED, {
        entryId: entry.id,
        title: record.title,
        type: record.type,
      });
    }
    return record;
  }

  function removeByEntryId(db, userId, entryId, { silent = false } = {}) {
    databaseService.normalizeWarehouse(db);
    db.warehouse.memories = db.warehouse.memories.filter((item) => !(item.userId === userId && item.entryId === entryId));
    if (!silent) {
      activityService.logActivity(db, userId, activityService.ActivityActions.MEMORY_DELETED, { entryId });
    }
    return true;
  }

  function restoreByEntryId(db, userId, entry) {
    return syncFromEntry(db, userId, entry);
  }

  function getUserMemories(db, userId, limit = 100) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.memories
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))
      .slice(0, limit);
  }

  return {
    syncFromEntry,
    removeByEntryId,
    restoreByEntryId,
    getUserMemories,
  };
}
