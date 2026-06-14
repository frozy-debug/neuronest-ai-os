import crypto from "node:crypto";

function upsertByKey(list, key, value, record) {
  const index = list.findIndex((item) => item[key] === value);
  if (index === -1) list.unshift(record);
  else list[index] = { ...list[index], ...record };
  return record;
}

export function createScreenshotService({ databaseService, activityService }) {
  function syncFromEntry(db, userId, entry, fileRecord = null, { silent = false } = {}) {
    const kind = String(entry?.type || entry?.kind || "").toLowerCase();
    if (!entry?.id || entry.deletedAt || !kind.includes("screenshot")) return null;

    databaseService.normalizeWarehouse(db);
    const existing = db.warehouse.screenshots.find((item) => item.entryId === entry.id && item.userId === userId);
    const memoryLinks = (entry.relatedMemories || []).map((item) => (typeof item === "string" ? item : item?.id)).filter(Boolean);
    const record = {
      id: entry.warehouseScreenshotId || crypto.randomUUID(),
      userId,
      entryId: entry.id,
      fileUrl: fileRecord?.fileUrl || entry.media?.fileUrl || entry.metadata?.fileUrl || "",
      fileName: fileRecord?.fileName || entry.metadata?.fileName || entry.title || "screenshot",
      uploadDate: entry.createdAt || new Date().toISOString(),
      ocrSummary: entry.summary || entry.body || entry.metadata?.ocrText || "",
      tags: entry.tags || [],
      memoryLinks,
    };

    if (fileRecord) {
      db.warehouse.fileStorage.unshift({
        id: fileRecord.id,
        userId,
        fileUrl: fileRecord.fileUrl,
        fileName: fileRecord.fileName,
        mimeType: fileRecord.mimeType,
        kind: "screenshot",
        createdAt: fileRecord.createdAt,
      });
      db.warehouse.fileStorage = db.warehouse.fileStorage.slice(0, 5000);
    }

    upsertByKey(db.warehouse.screenshots, "entryId", entry.id, record);
    if (!silent && !existing) {
      activityService.logActivity(db, userId, activityService.ActivityActions.SCREENSHOT_UPLOADED, {
        entryId: entry.id,
        fileName: record.fileName,
        fileUrl: record.fileUrl,
      });
    }
    return record;
  }

  function saveScreenshot(db, userId, entry, filePayload, options = {}) {
    const fileRecord = filePayload ? databaseService.saveFile(userId, filePayload) : null;
    return syncFromEntry(db, userId, entry, fileRecord, options);
  }

  function getUserScreenshots(db, userId, limit = 100) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.screenshots
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate))
      .slice(0, limit);
  }

  return {
    syncFromEntry,
    saveScreenshot,
    getUserScreenshots,
  };
}
