import crypto from "node:crypto";

export const PAGE_LABELS = {
  home: "Home",
  "ai-chat": "AI Chat",
  memories: "Memories",
  timeline: "Timeline",
  "place-hunter": "Place Hunter",
  voice: "Voice Assistant",
  "digital-twin": "Digital Twin",
  "ai-systems": "AI Systems",
  "mission-control": "Mission Control",
  map: "Map View",
  places: "Places",
  insights: "Insights",
  tags: "Tags",
  trash: "Trash",
  profile: "Profile Hub",
};

const STALE_MS = 90_000;

export function createLiveMonitorService({ databaseService, activityService } = {}) {
  function ensureLiveMonitoring(db) {
    db.liveMonitoring ||= {
      activeSessions: {},
      sessionHistory: [],
      liveFeed: [],
      loginHistory: [],
      analytics: {
        peakOnlineToday: 0,
        peakOnlineAt: null,
        pageVisits: {},
        featureUsage: {},
        dailyActive: {},
        weeklyActive: {},
      },
    };
    db.liveMonitoring.activeSessions ||= {};
    db.liveMonitoring.sessionHistory ||= [];
    db.liveMonitoring.liveFeed ||= [];
    db.liveMonitoring.loginHistory ||= [];
    db.liveMonitoring.analytics ||= {
      peakOnlineToday: 0,
      peakOnlineAt: null,
      pageVisits: {},
      featureUsage: {},
      dailyActive: {},
      weeklyActive: {},
    };
    return db.liveMonitoring;
  }

  function dayKey(value = new Date()) {
    return new Date(value).toISOString().slice(0, 10);
  }

  function weekKey(value = new Date()) {
    const date = new Date(value);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours) return `${hours}h ${minutes}m`;
    if (minutes) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function parseUserAgent(ua = "") {
    const agent = String(ua);
    let browser = "Unknown Browser";
    let os = "Unknown OS";
    let deviceType = "Desktop";

    if (/Edg\//.test(agent)) browser = "Edge";
    else if (/Chrome\//.test(agent)) browser = "Chrome";
    else if (/Firefox\//.test(agent)) browser = "Firefox";
    else if (/Safari\//.test(agent) && !/Chrome\//.test(agent)) browser = "Safari";

    if (/Windows NT/.test(agent)) os = "Windows";
    else if (/Mac OS X/.test(agent)) os = "macOS";
    else if (/Android/.test(agent)) os = "Android";
    else if (/iPhone|iPad/.test(agent)) os = "iOS";
    else if (/Linux/.test(agent)) os = "Linux";

    if (/Mobile|Android|iPhone/.test(agent)) deviceType = "Mobile";
    else if (/iPad|Tablet/.test(agent)) deviceType = "Tablet";

    return { browser, os, deviceType, userAgent: agent.slice(0, 240) };
  }

  function addFeedEvent(db, event) {
    const live = ensureLiveMonitoring(db);
    const record = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };
    live.liveFeed.unshift(record);
    live.liveFeed = live.liveFeed.slice(0, 500);
    return record;
  }

  function bumpAnalytics(db, sessionCount, page, feature) {
    const live = ensureLiveMonitoring(db);
    const today = dayKey();
    const week = weekKey();
    live.analytics.dailyActive[today] ||= new Set();
    if (live.analytics.dailyActive[today] instanceof Set) {
      // migrated below
    }
    if (!live.analytics.dailyActive[today] || typeof live.analytics.dailyActive[today] === "object") {
      // store as object with user ids
    }
    if (sessionCount > (live.analytics.peakOnlineToday || 0)) {
      live.analytics.peakOnlineToday = sessionCount;
      live.analytics.peakOnlineAt = new Date().toISOString();
    }
    if (page) {
      live.analytics.pageVisits[page] = (live.analytics.pageVisits[page] || 0) + 1;
    }
    if (feature) {
      live.analytics.featureUsage[feature] = (live.analytics.featureUsage[feature] || 0) + 1;
    }
    live.analytics.dailyActive[today] = Math.max(Number(live.analytics.dailyActive[today] || 0), sessionCount);
    live.analytics.weeklyActive[week] = Math.max(Number(live.analytics.weeklyActive[week] || 0), sessionCount);
  }

  function trackDailyUser(db, userId) {
    const live = ensureLiveMonitoring(db);
    const key = `_users_${dayKey()}`;
    live.analytics[key] ||= [];
    if (!live.analytics[key].includes(userId)) live.analytics[key].push(userId);
    live.analytics.dailyActive[dayKey()] = live.analytics[key].length;
    const week = weekKey();
    const weekKeyUsers = `_users_${week}`;
    live.analytics[weekKeyUsers] ||= [];
    if (!live.analytics[weekKeyUsers].includes(userId)) live.analytics[weekKeyUsers].push(userId);
    live.analytics.weeklyActive[week] = live.analytics[weekKeyUsers].length;
  }

  function pruneStaleSessions(db) {
    const live = ensureLiveMonitoring(db);
    const now = Date.now();
    for (const [sessionId, session] of Object.entries(live.activeSessions)) {
      const last = new Date(session.lastHeartbeatAt || session.loginAt || 0).getTime();
      if (now - last > STALE_MS) {
        endSession(db, sessionId, "heartbeat_timeout");
      }
    }
  }

  function endSession(db, sessionId, reason = "logout") {
    const live = ensureLiveMonitoring(db);
    const session = live.activeSessions[sessionId];
    if (!session) return null;
    session.online = false;
    session.endedAt = new Date().toISOString();
    session.endReason = reason;
    session.durationMs = new Date(session.endedAt).getTime() - new Date(session.sessionStartAt || session.loginAt).getTime();
    live.sessionHistory.unshift({ ...session });
    live.sessionHistory = live.sessionHistory.slice(0, 2000);
    delete live.activeSessions[sessionId];
    return session;
  }

  function recordLogin(db, user, meta = {}) {
    if (!user?.id) return null;
    const live = ensureLiveMonitoring(db);
    const now = new Date().toISOString();
    const sessionId = crypto.randomUUID();
    const device = parseUserAgent(meta.userAgent || meta.device?.userAgent || "");
    const session = {
      sessionId,
      userId: user.id,
      name: user.name || user.email,
      email: user.email || "",
      picture: user.picture || "",
      online: true,
      loginAt: now,
      sessionStartAt: now,
      lastHeartbeatAt: now,
      lastActivityAt: now,
      currentPage: meta.page || "home",
      currentPageLabel: PAGE_LABELS[meta.page || "home"] || "Home",
      currentAction: "Logged in",
      device: {
        ...device,
        screenResolution: meta.device?.screenResolution || meta.screenResolution || "",
      },
      network: {
        ip: meta.ip || "",
        country: meta.country || "Unknown",
        region: meta.region || "Unknown",
        city: meta.city || "Unknown",
      },
    };
    live.activeSessions[sessionId] = session;
    live.loginHistory.unshift({
      id: crypto.randomUUID(),
      userId: user.id,
      email: user.email,
      sessionId,
      loginAt: now,
      ip: meta.ip || "",
      device,
    });
    live.loginHistory = live.loginHistory.slice(0, 2000);
    trackDailyUser(db, user.id);
    addFeedEvent(db, {
      userId: user.id,
      userName: user.name || user.email,
      action: "USER_LOGIN",
      message: `${user.name || user.email} logged in`,
      page: session.currentPage,
      pageLabel: session.currentPageLabel,
    });
    activityService?.logActivity?.(db, user.id, "USER_LOGIN", { sessionId });
    bumpAnalytics(db, Object.keys(live.activeSessions).length, session.currentPage, "login");
    return session;
  }

  function recordLogout(db, userId, sessionId) {
    const session = endSession(db, sessionId, "logout");
    if (!session) return null;
    addFeedEvent(db, {
      userId,
      userName: session.name,
      action: "USER_LOGOUT",
      message: `${session.name || "User"} logged out`,
    });
    activityService?.logActivity?.(db, userId, "USER_LOGOUT", { sessionId });
    return session;
  }

  function updatePresence(db, userId, payload = {}, meta = {}) {
    pruneStaleSessions(db);
    const live = ensureLiveMonitoring(db);
    let sessionId = payload.sessionId;
    let session = sessionId ? live.activeSessions[sessionId] : null;

    if (!session) {
      session = Object.values(live.activeSessions).find((item) => item.userId === userId && item.online);
      sessionId = session?.sessionId;
    }

    if (!session) {
      const user = db.users?.find((item) => item.id === userId);
      if (!user) return null;
      session = recordLogin(db, user, { ...meta, page: payload.page, device: payload.device });
      sessionId = session.sessionId;
    }

    const now = new Date().toISOString();
    const page = payload.page || session.currentPage || "home";
    const pageLabel = PAGE_LABELS[page] || payload.pageLabel || page;
    const action = payload.action || payload.currentAction || session.currentAction || `Using ${pageLabel}`;
    const pageChanged = page !== session.currentPage;

    session.lastHeartbeatAt = now;
    session.lastActivityAt = now;
    session.currentPage = page;
    session.currentPageLabel = pageLabel;
    session.currentAction = action;
    if (payload.device?.screenResolution) {
      session.device = { ...session.device, ...parseUserAgent(payload.device.userAgent || ""), screenResolution: payload.device.screenResolution };
    }
    if (meta.ip) session.network.ip = meta.ip;

    if (pageChanged) {
      addFeedEvent(db, {
        userId,
        userName: session.name,
        action: "PAGE_VIEW",
        message: `${session.name} opened ${pageLabel}`,
        page,
        pageLabel,
      });
      bumpAnalytics(db, Object.keys(live.activeSessions).length, page);
    }

    live.activeSessions[sessionId] = session;
    trackDailyUser(db, userId);
    return session;
  }

  function recordLiveAction(db, userId, action, meta = {}) {
    const live = ensureLiveMonitoring(db);
    const session = Object.values(live.activeSessions).find((item) => item.userId === userId && item.online);
    const user = db.users?.find((item) => item.id === userId);
    const name = session?.name || user?.name || user?.email || "User";
    const labels = {
      AI_CHAT: "AI Chat",
      MEMORY_CREATED: "Creating Memory",
      SCREENSHOT_UPLOADED: "Uploading Screenshot",
      PLACE_SAVED: "Saving Place",
      VOICE_ASSISTANT: "Voice Assistant",
      TIMELINE_VIEW: "Timeline",
      DIGITAL_TWIN: "Digital Twin",
      AI_SYSTEMS: "AI Systems",
    };
    const actionLabel = meta.label || labels[action] || action.replace(/_/g, " ");
    if (session) {
      session.currentAction = actionLabel;
      session.lastActivityAt = new Date().toISOString();
      session.lastHeartbeatAt = session.lastActivityAt;
      if (meta.page) {
        session.currentPage = meta.page;
        session.currentPageLabel = PAGE_LABELS[meta.page] || meta.page;
      }
    }
    addFeedEvent(db, {
      userId,
      userName: name,
      action,
      message: `${name} ${meta.message || actionLabel.toLowerCase()}`,
      page: meta.page || session?.currentPage,
      pageLabel: meta.pageLabel || session?.currentPageLabel,
    });
    bumpAnalytics(db, Object.keys(live.activeSessions).length, meta.page, action);
    return session;
  }

  function enrichOnlineUser(db, session) {
    const user = db.users?.find((item) => item.id === session.userId);
    const durationMs = Date.now() - new Date(session.sessionStartAt || session.loginAt).getTime();
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      name: session.name || user?.name || "Unknown",
      email: session.email || user?.email || "",
      picture: session.picture || user?.picture || "",
      googleId: user?.googleSub || "",
      signupDate: user?.createdAt || "",
      lastLogin: user?.lastLoginAt || "",
      online: true,
      currentPage: session.currentPage,
      currentPageLabel: session.currentPageLabel,
      currentAction: session.currentAction,
      sessionDuration: formatDuration(durationMs),
      sessionDurationMs: durationMs,
      loginTime: session.loginAt,
      lastActivityTime: session.lastActivityAt,
      device: session.device || {},
      network: session.network || {},
    };
  }

  function buildOnlineUsers(db) {
    pruneStaleSessions(db);
    return Object.values(ensureLiveMonitoring(db).activeSessions)
      .filter((session) => session.online)
      .sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt))
      .map((session) => enrichOnlineUser(db, session));
  }

  function buildLiveFeed(db, limit = 50) {
    pruneStaleSessions(db);
    return ensureLiveMonitoring(db).liveFeed.slice(0, limit).map((item) => ({
      ...item,
      timeLabel: new Date(item.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    }));
  }

  function buildLiveAnalytics(db) {
    pruneStaleSessions(db);
    const live = ensureLiveMonitoring(db);
    const online = buildOnlineUsers(db);
    const sessions = live.sessionHistory.slice(0, 500);
    const avgDuration =
      sessions.length > 0
        ? sessions.reduce((sum, item) => sum + Number(item.durationMs || 0), 0) / sessions.length
        : 0;
    const pageVisits = Object.entries(live.analytics.pageVisits || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([page, visits]) => ({ page, label: PAGE_LABELS[page] || page, visits }));
    const features = Object.entries(live.analytics.featureUsage || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([feature, count]) => ({ feature, count }));

    return {
      currentlyOnline: online.length,
      peakOnlineToday: live.analytics.peakOnlineToday || online.length,
      peakOnlineAt: live.analytics.peakOnlineAt,
      dailyActiveUsers: Number(live.analytics.dailyActive[dayKey()] || 0),
      weeklyActiveUsers: Number(live.analytics.weeklyActive[weekKey()] || 0),
      averageSessionDuration: formatDuration(avgDuration),
      averageSessionDurationMs: avgDuration,
      mostVisitedPages: pageVisits,
      mostUsedFeatures: features,
    };
  }

  function getUserLiveDetail(db, userId) {
    pruneStaleSessions(db);
    const live = ensureLiveMonitoring(db);
    const user = db.users?.find((item) => item.id === userId);
    if (!user) return null;
    const active = Object.values(live.activeSessions).filter((item) => item.userId === userId);
    const history = live.sessionHistory.filter((item) => item.userId === userId).slice(0, 40);
    const logins = live.loginHistory.filter((item) => item.userId === userId).slice(0, 40);
    const feed = live.liveFeed.filter((item) => item.userId === userId).slice(0, 40);
    const totalSessionTime = history.reduce((sum, item) => sum + Number(item.durationMs || 0), 0);
    return {
      profile: {
        name: user.name,
        email: user.email,
        userId: user.id,
        googleId: user.googleSub || "",
        signupDate: user.createdAt,
        lastLogin: user.lastLoginAt,
        picture: user.picture || "",
      },
      liveSession: active[0] ? enrichOnlineUser(db, active[0]) : null,
      currentSessions: active.map((session) => enrichOnlineUser(db, session)),
      sessionHistory: history,
      loginHistory: logins,
      activityFeed: feed,
      totalSessionTime: formatDuration(totalSessionTime),
      deviceHistory: history.map((item) => item.device).filter(Boolean),
    };
  }

  function buildLiveMonitorSnapshot(db) {
    return {
      generatedAt: new Date().toISOString(),
      onlineUsers: buildOnlineUsers(db),
      feed: buildLiveFeed(db, 40),
      analytics: buildLiveAnalytics(db),
    };
  }

  function endAllUserSessions(db, userId, reason = "force_logout") {
    const live = ensureLiveMonitoring(db);
    const user = db.users?.find((item) => item.id === userId);
    for (const sessionId of Object.keys(live.activeSessions)) {
      const session = live.activeSessions[sessionId];
      if (session?.userId !== userId) continue;
      endSession(db, sessionId, reason);
      addFeedEvent(db, {
        userId,
        userName: session.name || user?.name || user?.email || "User",
        action: "USER_FORCE_LOGOUT",
        message: `${session.name || user?.name || "User"} was force logged out`,
      });
    }
  }

  return {
    PAGE_LABELS,
    ensureLiveMonitoring,
    pruneStaleSessions,
    recordLogin,
    recordLogout,
    updatePresence,
    recordLiveAction,
    buildOnlineUsers,
    buildLiveFeed,
    buildLiveAnalytics,
    getUserLiveDetail,
    buildLiveMonitorSnapshot,
    endAllUserSessions,
    endSession,
    formatDuration,
    parseUserAgent,
  };
}
