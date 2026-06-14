import crypto from "node:crypto";

export function createChatService({ databaseService, activityService }) {
  function syncChatMessage(db, userId, message, assistantMessage = null, { silent = false } = {}) {
    if (!message?.id) return null;
    databaseService.normalizeWarehouse(db);
    const existing = db.warehouse.aiChats.find((item) => item.chatId === message.id && item.userId === userId);
    if (existing) return existing;

    const userRecord = {
      id: crypto.randomUUID(),
      userId,
      chatId: message.id,
      role: message.role || "user",
      message: message.role === "user" ? message.content : "",
      response: message.role === "assistant" ? message.content : assistantMessage?.content || "",
      timestamp: message.createdAt || new Date().toISOString(),
    };
    db.warehouse.aiChats.unshift(userRecord);

    if (assistantMessage?.id) {
      db.warehouse.aiChats.unshift({
        id: crypto.randomUUID(),
        userId,
        chatId: assistantMessage.id,
        role: "assistant",
        message: "",
        response: assistantMessage.content || "",
        timestamp: assistantMessage.createdAt || new Date().toISOString(),
      });
    }

    db.warehouse.aiChats = db.warehouse.aiChats.slice(0, 10000);
    db.warehouse.aiUsage.unshift({
      id: crypto.randomUUID(),
      userId,
      action: "AI_CHAT",
      metadata: {
        chatId: message.id,
        messagePreview: String(message.content || "").slice(0, 180),
      },
      timestamp: message.createdAt || new Date().toISOString(),
    });
    db.warehouse.aiUsage = db.warehouse.aiUsage.slice(0, 10000);

    if (!silent) {
      activityService.logActivity(db, userId, activityService.ActivityActions.CHAT_SENT, {
        chatId: message.id,
        preview: String(message.content || "").slice(0, 180),
      });
      activityService.logActivity(db, userId, activityService.ActivityActions.AI_REQUEST, {
        chatId: assistantMessage?.id || message.id,
      });
    }

    return userRecord;
  }

  function getUserChats(db, userId, limit = 100) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.aiChats
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  function getUserAiUsage(db, userId, limit = 100) {
    databaseService.normalizeWarehouse(db);
    return db.warehouse.aiUsage
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  return {
    syncChatMessage,
    getUserChats,
    getUserAiUsage,
  };
}
