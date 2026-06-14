import crypto from "node:crypto";

export const ActivityActions = {
  USER_REGISTERED: "USER_REGISTERED",
  USER_LOGIN: "USER_LOGIN",
  MEMORY_CREATED: "MEMORY_CREATED",
  MEMORY_DELETED: "MEMORY_DELETED",
  MEMORY_RESTORED: "MEMORY_RESTORED",
  CHAT_SENT: "CHAT_SENT",
  SCREENSHOT_UPLOADED: "SCREENSHOT_UPLOADED",
  VOICE_NOTE_CREATED: "VOICE_NOTE_CREATED",
  PLACE_SAVED: "PLACE_SAVED",
  GOAL_CREATED: "GOAL_CREATED",
  GOAL_UPDATED: "GOAL_UPDATED",
  AI_REQUEST: "AI_REQUEST",
  ACTIVITY_CAPTURED: "ACTIVITY_CAPTURED",
};

export function createActivityService({ databaseService }) {
  function logActivity(db, userId, action, metadata = {}) {
    if (!userId || !action) return null;
    databaseService.normalizeWarehouse(db);
    const event = {
      id: crypto.randomUUID(),
      userId,
      action,
      metadata,
      timestamp: new Date().toISOString(),
    };
    db.warehouse.activityStream.unshift(event);
    db.warehouse.activityStream = db.warehouse.activityStream.slice(0, 5000);
    return event;
  }

  function getUserActivity(db, userId, limit = 50) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.activityStream.filter((item) => item.userId === userId).slice(0, limit);
  }

  function getRecentActivity(db, limit = 100) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.activityStream.slice(0, limit);
  }

  return {
    logActivity,
    getUserActivity,
    getRecentActivity,
    ActivityActions,
  };
}
