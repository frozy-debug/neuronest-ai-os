import crypto from "node:crypto";

function upsertByKey(list, key, value, record) {
  const index = list.findIndex((item) => item[key] === value);
  if (index === -1) list.unshift(record);
  else list[index] = { ...list[index], ...record };
  return record;
}

export function createVoiceNoteService({ databaseService, activityService }) {
  function syncFromEntry(db, userId, entry, fileRecord = null, { silent = false } = {}) {
    const kind = String(entry?.type || entry?.kind || "").toLowerCase();
    if (!entry?.id || entry.deletedAt || !kind.includes("voice")) return null;

    databaseService.normalizeWarehouse(db);
    const existing = db.warehouse.voiceNotes.find((item) => item.entryId === entry.id && item.userId === userId);
    const record = {
      id: entry.warehouseVoiceId || crypto.randomUUID(),
      userId,
      entryId: entry.id,
      audioUrl: fileRecord?.fileUrl || entry.media?.fileUrl || entry.metadata?.audioUrl || "",
      transcript: entry.body || entry.metadata?.voiceTranscript || entry.summary || "",
      createdDate: entry.createdAt || new Date().toISOString(),
    };

    if (fileRecord) {
      db.warehouse.fileStorage.unshift({
        id: fileRecord.id,
        userId,
        fileUrl: fileRecord.fileUrl,
        fileName: fileRecord.fileName,
        mimeType: fileRecord.mimeType,
        kind: "voice",
        createdAt: fileRecord.createdAt,
      });
      db.warehouse.fileStorage = db.warehouse.fileStorage.slice(0, 5000);
    }

    upsertByKey(db.warehouse.voiceNotes, "entryId", entry.id, record);
    if (!silent && !existing) {
      activityService.logActivity(db, userId, activityService.ActivityActions.VOICE_NOTE_CREATED, {
        entryId: entry.id,
        transcript: String(record.transcript || "").slice(0, 180),
      });
    }
    return record;
  }

  function getUserVoiceNotes(db, userId, limit = 100) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.voiceNotes
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate))
      .slice(0, limit);
  }

  return {
    syncFromEntry,
    getUserVoiceNotes,
  };
}
