import crypto from "node:crypto";

export const AccountStatus = {
  ACTIVE: "ACTIVE",
  BLOCKED: "BLOCKED",
  SUSPENDED: "SUSPENDED",
  PENDING_REVIEW: "PENDING_REVIEW",
};

export const BlockCategories = [
  "Spam",
  "Abuse",
  "Harassment",
  "Fake Account",
  "Terms Violation",
  "Security Risk",
  "Other",
];

export const SuspensionDurations = {
  "1_day": 1,
  "3_days": 3,
  "7_days": 7,
  "30_days": 30,
};

export const ModerationActions = {
  USER_BLOCKED: "USER_BLOCKED",
  USER_UNBLOCKED: "USER_UNBLOCKED",
  USER_SUSPENDED: "USER_SUSPENDED",
  USER_UNSUSPENDED: "USER_UNSUSPENDED",
  USER_FORCE_LOGOUT: "USER_FORCE_LOGOUT",
  ACCOUNT_NOTE_SAVED: "ACCOUNT_NOTE_SAVED",
  STATUS_PENDING_REVIEW: "STATUS_PENDING_REVIEW",
};

function normalizeStatus(value) {
  const raw = String(value || AccountStatus.ACTIVE).trim().toUpperCase().replace(/-/g, "_");
  if (raw === "ADMIN") return AccountStatus.ACTIVE;
  if (Object.values(AccountStatus).includes(raw)) return raw;
  if (raw === "BLOCKED") return AccountStatus.BLOCKED;
  if (raw === "SUSPENDED") return AccountStatus.SUSPENDED;
  return AccountStatus.ACTIVE;
}

function ensureModerationCollections(db) {
  db.adminUserStatus ||= {};
  db.moderationHistory ||= [];
  db.userNotifications ||= {};
  return db;
}

function getStatusRecord(db, userId) {
  ensureModerationCollections(db);
  return db.adminUserStatus[userId] || { status: AccountStatus.ACTIVE };
}

function saveStatusRecord(db, userId, record) {
  ensureModerationCollections(db);
  db.adminUserStatus[userId] = {
    ...record,
    status: normalizeStatus(record.status),
    updatedAt: new Date().toISOString(),
  };
  return db.adminUserStatus[userId];
}

function addModerationHistory(db, entry) {
  ensureModerationCollections(db);
  const record = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  db.moderationHistory.unshift(record);
  db.moderationHistory = db.moderationHistory.slice(0, 5000);
  return record;
}

function addUserNotification(db, userId, message, type = "moderation") {
  ensureModerationCollections(db);
  db.userNotifications[userId] ||= [];
  const notification = {
    id: crypto.randomUUID(),
    type,
    message,
    createdAt: new Date().toISOString(),
    read: false,
  };
  db.userNotifications[userId].unshift(notification);
  db.userNotifications[userId] = db.userNotifications[userId].slice(0, 200);
  return notification;
}

function computeSuspensionEndDate(durationKey, customDate) {
  if (durationKey === "custom" && customDate) {
    const date = new Date(customDate);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const days = SuspensionDurations[durationKey] || 7;
  const end = new Date();
  end.setDate(end.getDate() + days);
  return end.toISOString();
}

function remainingDays(endDate) {
  const diff = new Date(endDate).getTime() - Date.now();
  if (diff <= 0) return 0;
  return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

function formatDisplayDate(value) {
  if (!value) return "Not available";
  return new Date(value).toLocaleString();
}

export function createModerationService({ databaseService, activityService } = {}) {
  function maybeExpireSuspension(db, userId) {
    const record = getStatusRecord(db, userId);
    if (normalizeStatus(record.status) !== AccountStatus.SUSPENDED) return record;
    if (!record.suspensionEndDate) return record;
    if (new Date(record.suspensionEndDate).getTime() > Date.now()) return record;

    const restored = {
      ...record,
      status: AccountStatus.ACTIVE,
      unsuspendedBy: "system",
      unsuspendedAt: new Date().toISOString(),
      unsuspensionReason: "Suspension period ended automatically.",
      lastModerationAction: ModerationActions.USER_UNSUSPENDED,
    };
    saveStatusRecord(db, userId, restored);
    addModerationHistory(db, {
      action: ModerationActions.USER_UNSUSPENDED,
      adminEmail: "system@neuronest.ai",
      targetUserId: userId,
      reason: "Suspension period ended automatically.",
    });
    addUserNotification(db, userId, "Your account has been restored.");
    activityService?.logActivity?.(db, userId, "USER_UNSUSPENDED", { automatic: true });
    return restored;
  }

  function getEffectiveStatus(db, userId) {
    ensureModerationCollections(db);
    const record = maybeExpireSuspension(db, userId);
    return normalizeStatus(record.status);
  }

  function buildModerationView(db, userId) {
    const record = maybeExpireSuspension(db, userId);
    const status = normalizeStatus(record.status);
    const base = {
      status,
      allowed: status === AccountStatus.ACTIVE,
      forceLogout: false,
      message: "",
      supportMessage: "If you believe this was a mistake, please contact NeuroNest support.",
    };

    if (status === AccountStatus.BLOCKED) {
      return {
        ...base,
        allowed: false,
        title: "Account Blocked",
        headline: "Your NeuroNest account has been blocked.",
        reason: record.blockReason || record.reason || "No reason provided.",
        category: record.blockCategory || "",
        blockedOn: formatDisplayDate(record.blockedAt),
        blockedBy: record.blockedBy || record.updatedBy || "NeuroNest Admin",
        internalNotes: record.blockInternalNotes || "",
        statusLabel: "BLOCKED",
      };
    }

    if (status === AccountStatus.SUSPENDED) {
      return {
        ...base,
        allowed: false,
        title: "Account Suspended",
        headline: "Your NeuroNest account has been suspended.",
        reason: record.suspensionReason || record.reason || "No reason provided.",
        suspendedUntil: formatDisplayDate(record.suspensionEndDate),
        suspendedOn: formatDisplayDate(record.suspendedAt),
        suspendedBy: record.suspendedBy || record.updatedBy || "NeuroNest Admin",
        remainingDays: remainingDays(record.suspensionEndDate),
        statusLabel: "SUSPENDED",
      };
    }

    if (status === AccountStatus.PENDING_REVIEW) {
      return {
        ...base,
        allowed: false,
        title: "Account Under Review",
        headline: "Your account is currently being reviewed.",
        message: "Please wait while the NeuroNest team reviews your account.",
        statusLabel: "PENDING_REVIEW",
      };
    }

    return {
      ...base,
      title: "Account Active",
      headline: "Your account is active.",
      statusLabel: "ACTIVE",
    };
  }

  function getAccountAccess(db, userId, { sessionCreatedAt = 0 } = {}) {
    const record = maybeExpireSuspension(db, userId);
    const view = buildModerationView(db, userId);
    const forceLogout = Boolean(
      record.forceLogoutAt && sessionCreatedAt && new Date(record.forceLogoutAt).getTime() > Number(sessionCreatedAt),
    );
    return {
      ...view,
      forceLogout,
      record: sanitizeStatusForAdmin(record),
      notifications: (db.userNotifications?.[userId] || []).slice(0, 20),
    };
  }

  function sanitizeStatusForAdmin(record = {}) {
    return {
      status: normalizeStatus(record.status),
      blockedBy: record.blockedBy || "",
      blockedAt: record.blockedAt || "",
      blockReason: record.blockReason || "",
      blockCategory: record.blockCategory || "",
      blockInternalNotes: record.blockInternalNotes || "",
      suspendedBy: record.suspendedBy || "",
      suspendedAt: record.suspendedAt || "",
      suspensionReason: record.suspensionReason || "",
      suspensionEndDate: record.suspensionEndDate || "",
      unblockedBy: record.unblockedBy || "",
      unblockedAt: record.unblockedAt || "",
      unblockReason: record.unblockReason || "",
      unsuspendedBy: record.unsuspendedBy || "",
      unsuspendedAt: record.unsuspendedAt || "",
      unsuspensionReason: record.unsuspensionReason || "",
      forceLogoutAt: record.forceLogoutAt || "",
      accountNotes: record.accountNotes || "",
      updatedAt: record.updatedAt || "",
      updatedBy: record.updatedBy || "",
      lastModerationAction: record.lastModerationAction || "",
    };
  }

  function getUserModerationPanel(db, userId) {
    const record = maybeExpireSuspension(db, userId);
    const history = (db.moderationHistory || []).filter((item) => item.targetUserId === userId).slice(0, 30);
    const view = buildModerationView(db, userId);
    const last = history[0] || null;
    return {
      currentStatus: normalizeStatus(record.status),
      statusLabel: view.statusLabel,
      lastModerationAction: record.lastModerationAction || last?.action || "None",
      reason: view.reason || record.blockReason || record.suspensionReason || "",
      adminResponsible: last?.adminEmail || record.updatedBy || "Not available",
      accountNotes: record.accountNotes || "",
      details: sanitizeStatusForAdmin(record),
      history,
      notifications: (db.userNotifications?.[userId] || []).slice(0, 20),
    };
  }

  function normalizeModerationPayload(action, payload = {}) {
    const normalized = { ...payload };
    normalized.reason = String(payload.reason || payload.note || payload.message || "Moderation action").trim() || "Moderation action";
    if (action === "block") {
      const category = String(payload.category || "Other").trim();
      normalized.category = BlockCategories.includes(category) ? category : "Other";
    }
    if (action === "suspend" && !normalized.duration) {
      normalized.duration = "7_days";
    }
    return normalized;
  }

  function blockUser(db, userId, adminEmail, payload = {}) {
    const normalized = normalizeModerationPayload("block", payload);
    const reason = normalized.reason;
    const category = normalized.category;

    const now = new Date().toISOString();
    const record = {
      ...getStatusRecord(db, userId),
      status: AccountStatus.BLOCKED,
      blockedBy: adminEmail,
      blockedAt: now,
      blockReason: reason.slice(0, 500),
      blockCategory: category,
      blockInternalNotes: String(payload.internalNotes || "").slice(0, 2000),
      lastModerationAction: ModerationActions.USER_BLOCKED,
      updatedBy: adminEmail,
      forceLogoutAt: now,
    };
    saveStatusRecord(db, userId, record);
    addModerationHistory(db, {
      action: ModerationActions.USER_BLOCKED,
      adminEmail,
      targetUserId: userId,
      reason,
      category,
      internalNotes: record.blockInternalNotes,
    });
    addUserNotification(db, userId, "Your account has been blocked.");
    activityService?.logActivity?.(db, userId, "USER_BLOCKED", { reason, category, adminEmail });
    return getUserModerationPanel(db, userId);
  }

  function unblockUser(db, userId, adminEmail, payload = {}) {
    const reason = normalizeModerationPayload("unblock", payload).reason;

    const now = new Date().toISOString();
    const record = {
      ...getStatusRecord(db, userId),
      status: AccountStatus.ACTIVE,
      unblockedBy: adminEmail,
      unblockedAt: now,
      unblockReason: reason.slice(0, 500),
      lastModerationAction: ModerationActions.USER_UNBLOCKED,
      updatedBy: adminEmail,
      forceLogoutAt: "",
    };
    saveStatusRecord(db, userId, record);
    addModerationHistory(db, {
      action: ModerationActions.USER_UNBLOCKED,
      adminEmail,
      targetUserId: userId,
      reason,
    });
    addUserNotification(db, userId, "Your account has been restored.");
    activityService?.logActivity?.(db, userId, "USER_UNBLOCKED", { reason, adminEmail });
    return getUserModerationPanel(db, userId);
  }

  function suspendUser(db, userId, adminEmail, payload = {}) {
    const normalized = normalizeModerationPayload("suspend", payload);
    const reason = normalized.reason;
    const duration = String(normalized.duration || "7_days");

    const now = new Date().toISOString();
    const suspensionEndDate = computeSuspensionEndDate(duration, payload.customEndDate);
    const record = {
      ...getStatusRecord(db, userId),
      status: AccountStatus.SUSPENDED,
      suspendedBy: adminEmail,
      suspendedAt: now,
      suspensionReason: reason.slice(0, 500),
      suspensionEndDate,
      suspensionDuration: duration,
      lastModerationAction: ModerationActions.USER_SUSPENDED,
      updatedBy: adminEmail,
      forceLogoutAt: now,
    };
    saveStatusRecord(db, userId, record);
    addModerationHistory(db, {
      action: ModerationActions.USER_SUSPENDED,
      adminEmail,
      targetUserId: userId,
      reason,
      duration,
      suspensionEndDate,
    });
    addUserNotification(db, userId, "Your account has been suspended.");
    activityService?.logActivity?.(db, userId, "USER_SUSPENDED", { reason, duration, adminEmail });
    return getUserModerationPanel(db, userId);
  }

  function unsuspendUser(db, userId, adminEmail, payload = {}) {
    const reason = normalizeModerationPayload("unsuspend", payload).reason;

    const now = new Date().toISOString();
    const record = {
      ...getStatusRecord(db, userId),
      status: AccountStatus.ACTIVE,
      unsuspendedBy: adminEmail,
      unsuspendedAt: now,
      unsuspensionReason: reason.slice(0, 500),
      lastModerationAction: ModerationActions.USER_UNSUSPENDED,
      updatedBy: adminEmail,
      forceLogoutAt: "",
    };
    saveStatusRecord(db, userId, record);
    addModerationHistory(db, {
      action: ModerationActions.USER_UNSUSPENDED,
      adminEmail,
      targetUserId: userId,
      reason,
    });
    addUserNotification(db, userId, "Your account has been restored.");
    activityService?.logActivity?.(db, userId, "USER_UNSUSPENDED", { reason, adminEmail });
    return getUserModerationPanel(db, userId);
  }

  function forceLogoutUser(db, userId, adminEmail) {
    const now = new Date().toISOString();
    const record = {
      ...getStatusRecord(db, userId),
      forceLogoutAt: now,
      lastModerationAction: ModerationActions.USER_FORCE_LOGOUT,
      updatedBy: adminEmail,
    };
    saveStatusRecord(db, userId, record);
    addModerationHistory(db, {
      action: ModerationActions.USER_FORCE_LOGOUT,
      adminEmail,
      targetUserId: userId,
      reason: "Force logout executed by Super Admin.",
    });
    activityService?.logActivity?.(db, userId, "USER_FORCE_LOGOUT", { adminEmail });
    return getUserModerationPanel(db, userId);
  }

  function saveAccountNotes(db, userId, adminEmail, notes = "") {
    const record = {
      ...getStatusRecord(db, userId),
      accountNotes: String(notes || "").slice(0, 4000),
      updatedBy: adminEmail,
      lastModerationAction: ModerationActions.ACCOUNT_NOTE_SAVED,
    };
    saveStatusRecord(db, userId, record);
    addModerationHistory(db, {
      action: ModerationActions.ACCOUNT_NOTE_SAVED,
      adminEmail,
      targetUserId: userId,
      reason: "Private account notes updated.",
    });
    return getUserModerationPanel(db, userId);
  }

  function setPendingReview(db, userId, adminEmail, payload = {}) {
    const reason = String(payload.reason || "Account flagged for review.").trim();
    const record = {
      ...getStatusRecord(db, userId),
      status: AccountStatus.PENDING_REVIEW,
      reviewReason: reason,
      reviewedBy: adminEmail,
      reviewedAt: new Date().toISOString(),
      lastModerationAction: ModerationActions.STATUS_PENDING_REVIEW,
      updatedBy: adminEmail,
      forceLogoutAt: new Date().toISOString(),
    };
    saveStatusRecord(db, userId, record);
    addModerationHistory(db, {
      action: ModerationActions.STATUS_PENDING_REVIEW,
      adminEmail,
      targetUserId: userId,
      reason,
    });
    addUserNotification(db, userId, "Your account is under review.");
    return getUserModerationPanel(db, userId);
  }

  function buildModerationAnalytics(db) {
    ensureModerationCollections(db);
    const counts = {
      active: 0,
      blocked: 0,
      suspended: 0,
      pendingReview: 0,
    };
    for (const user of db.users || []) {
      const status = getEffectiveStatus(db, user.id);
      if (status === AccountStatus.BLOCKED) counts.blocked += 1;
      else if (status === AccountStatus.SUSPENDED) counts.suspended += 1;
      else if (status === AccountStatus.PENDING_REVIEW) counts.pendingReview += 1;
      else counts.active += 1;
    }

    const history = db.moderationHistory || [];
    const last7Days = history.filter((item) => Date.now() - new Date(item.timestamp).getTime() <= 7 * 24 * 60 * 60 * 1000);
    const trendMap = new Map();
    for (const item of last7Days) {
      const key = item.action || "UNKNOWN";
      trendMap.set(key, (trendMap.get(key) || 0) + 1);
    }

    return {
      activeUsers: counts.active,
      blockedUsers: counts.blocked,
      suspendedUsers: counts.suspended,
      pendingReviewUsers: counts.pendingReview,
      totalActions: history.length,
      recentActions: history.slice(0, 12),
      trends: [...trendMap.entries()].map(([action, value]) => ({ action, value })),
    };
  }

  function applyModerationAction(db, userId, adminEmail, action, payload = {}) {
    const normalized = normalizeModerationPayload(action, payload);
    switch (action) {
      case "block":
        return blockUser(db, userId, adminEmail, normalized);
      case "unblock":
        return unblockUser(db, userId, adminEmail, normalized);
      case "suspend":
        return suspendUser(db, userId, adminEmail, normalized);
      case "unsuspend":
        return unsuspendUser(db, userId, adminEmail, normalized);
      case "forceLogout":
      case "logoutAllDevices":
        return forceLogoutUser(db, userId, adminEmail);
      case "saveAccountNotes":
        return saveAccountNotes(db, userId, adminEmail, payload.notes);
      case "pendingReview":
        return setPendingReview(db, userId, adminEmail, payload);
      default:
        throw new Error("Unsupported moderation action.");
    }
  }

  return {
    AccountStatus,
    BlockCategories,
    SuspensionDurations,
    ModerationActions,
    normalizeStatus,
    getEffectiveStatus,
    getAccountAccess,
    getUserModerationPanel,
    buildModerationView,
    buildModerationAnalytics,
    applyModerationAction,
    blockUser,
    unblockUser,
    suspendUser,
    unsuspendUser,
    forceLogoutUser,
    saveAccountNotes,
    setPendingReview,
  };
}
