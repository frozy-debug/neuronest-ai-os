import crypto from "node:crypto";

export const SECURITY_ROLES = Object.freeze({
  USER: "USER",
  MODERATOR: "MODERATOR",
  SUPPORT_ADMIN: "SUPPORT_ADMIN",
  AI_ADMIN: "AI_ADMIN",
  SECURITY_ADMIN: "SECURITY_ADMIN",
  DATABASE_ADMIN: "DATABASE_ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
  OWNER: "OWNER",
});

export const ROLE_RANK = Object.freeze({
  USER: 0,
  MODERATOR: 10,
  SUPPORT_ADMIN: 20,
  AI_ADMIN: 30,
  SECURITY_ADMIN: 40,
  DATABASE_ADMIN: 45,
  SUPER_ADMIN: 80,
  OWNER: 100,
});

const PERMISSIONS = Object.freeze({
  ADMIN_ACCESS: ["MODERATOR", "SUPPORT_ADMIN", "AI_ADMIN", "SECURITY_ADMIN", "DATABASE_ADMIN", "SUPER_ADMIN", "OWNER"],
  USER_READ: ["SUPPORT_ADMIN", "SECURITY_ADMIN", "DATABASE_ADMIN", "SUPER_ADMIN", "OWNER"],
  USER_PRIVATE_READ: ["SUPER_ADMIN", "OWNER"],
  USER_MODERATE: ["MODERATOR", "SUPPORT_ADMIN", "SECURITY_ADMIN", "SUPER_ADMIN", "OWNER"],
  USER_DELETE: ["OWNER"],
  USER_EXPORT: ["SUPER_ADMIN", "OWNER"],
  DATABASE_READ: ["DATABASE_ADMIN", "SUPER_ADMIN", "OWNER"],
  DATABASE_WRITE: ["OWNER"],
  SECURITY_READ: ["SECURITY_ADMIN", "SUPER_ADMIN", "OWNER"],
  SECURITY_ADMIN: ["SECURITY_ADMIN", "SUPER_ADMIN", "OWNER"],
  SYSTEM_READ: ["SUPPORT_ADMIN", "SECURITY_ADMIN", "SUPER_ADMIN", "OWNER"],
  SYSTEM_WRITE: ["OWNER"],
  AI_ADMIN: ["AI_ADMIN", "SUPER_ADMIN", "OWNER"],
  ANNOUNCEMENT_WRITE: ["SUPPORT_ADMIN", "SUPER_ADMIN", "OWNER"],
  EXPORT_ALL: ["OWNER"],
  OWNER_ACTION: ["OWNER"],
});

const SECRET_PATTERNS = [
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\bGOCSPX-[0-9A-Za-z_-]{16,}\b/g,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  /\b(service_role|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|GROQ_API_KEY|GOOGLE_CLIENT_SECRET|SESSION_SECRET|ADMIN_SECRET)\s*[:=]\s*['"]?[^'",\s}]+/gi,
];

const ALLOWED_UPLOADS = Object.freeze({
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "audio/webm": [".webm"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/x-wav": [".wav"],
  "audio/mp4": [".m4a", ".mp4"],
});

const DANGEROUS_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".exe",
  ".hta",
  ".html",
  ".js",
  ".mjs",
  ".php",
  ".ps1",
  ".sh",
  ".svg",
  ".vbs",
]);

export function normalizeRole(role = "USER") {
  const normalized = String(role || "USER")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
  return SECURITY_ROLES[normalized] || SECURITY_ROLES.USER;
}

export function roleAtLeast(role, minimumRole) {
  return (ROLE_RANK[normalizeRole(role)] || 0) >= (ROLE_RANK[normalizeRole(minimumRole)] || 0);
}

export function hasPermission(role, permission) {
  const normalized = normalizeRole(role);
  if (normalized === SECURITY_ROLES.OWNER) return true;
  return (PERMISSIONS[permission] || []).includes(normalized);
}

export function parseEmailList(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Set();
  let values = [];
  if (raw.startsWith("[")) {
    try {
      values = JSON.parse(raw);
    } catch {
      values = raw.split(",");
    }
  } else {
    values = raw.split(",");
  }
  return new Set(
    values
      .map((item) => String(item || "").replace(/^mailto:/i, "").trim().toLowerCase())
      .filter(Boolean),
  );
}

export function adminRoleForEmail(email, env = process.env) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return SECURITY_ROLES.USER;
  const roleSources = [
    [SECURITY_ROLES.OWNER, env.OWNER_EMAILS],
    [SECURITY_ROLES.SUPER_ADMIN, env.SUPER_ADMIN_EMAILS],
    [SECURITY_ROLES.DATABASE_ADMIN, env.DATABASE_ADMIN_EMAILS],
    [SECURITY_ROLES.SECURITY_ADMIN, env.SECURITY_ADMIN_EMAILS],
    [SECURITY_ROLES.AI_ADMIN, env.AI_ADMIN_EMAILS],
    [SECURITY_ROLES.SUPPORT_ADMIN, env.SUPPORT_ADMIN_EMAILS],
    [SECURITY_ROLES.MODERATOR, env.MODERATOR_EMAILS],
  ];
  for (const [role, list] of roleSources) {
    if (parseEmailList(list).has(normalizedEmail)) return role;
  }
  return SECURITY_ROLES.USER;
}

export function redactSecrets(value) {
  if (typeof value === "string") {
    return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[REDACTED_SECRET]"), value);
  }
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /secret|token|key|credential|password/i.test(key) ? "[REDACTED_SECRET]" : redactSecrets(item),
      ]),
    );
  }
  return value;
}

export function sanitizeMetadata(metadata = {}) {
  return redactSecrets(metadata || {});
}

export function createAuditEvent({
  actor = {},
  action,
  targetUserId = "",
  ip = "",
  userAgent = "",
  severity = "LOW",
  metadata = {},
} = {}) {
  return {
    id: crypto.randomUUID(),
    actorUserId: actor.id || actor.userId || "",
    actorEmail: String(actor.email || "").toLowerCase(),
    actorRole: normalizeRole(actor.role || actor.adminRole || SECURITY_ROLES.USER),
    action: String(action || "UNKNOWN_ACTION").slice(0, 120),
    targetUserId: String(targetUserId || ""),
    ip: String(ip || "").slice(0, 120),
    userAgent: String(userAgent || "").slice(0, 500),
    severity: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(String(severity).toUpperCase())
      ? String(severity).toUpperCase()
      : "LOW",
    metadata: sanitizeMetadata(metadata),
    createdAt: new Date().toISOString(),
  };
}

export function recordAuditEvent(db, event) {
  if (!db || !event) return null;
  db.securityAuditLogs ||= [];
  db.securityAuditLogs.unshift(event);
  db.securityAuditLogs = db.securityAuditLogs.slice(0, 5000);
  db.warehouse ||= {};
  db.warehouse.securityAuditLogs ||= [];
  db.warehouse.securityAuditLogs.unshift(event);
  db.warehouse.securityAuditLogs = db.warehouse.securityAuditLogs.slice(0, 5000);
  return event;
}

export function buildSecurityAnalytics(db = {}) {
  const logs = [...(db.securityAuditLogs || []), ...(db.warehouse?.securityAuditLogs || [])]
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const seen = new Set();
  const deduped = logs.filter((log) => {
    if (!log.id || seen.has(log.id)) return false;
    seen.add(log.id);
    return true;
  });
  const bySeverity = deduped.reduce((acc, item) => {
    const severity = String(item.severity || "LOW").toUpperCase();
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {});
  const byAction = deduped.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});
  return {
    generatedAt: new Date().toISOString(),
    totalEvents: deduped.length,
    criticalEvents: bySeverity.CRITICAL || 0,
    highEvents: bySeverity.HIGH || 0,
    mediumEvents: bySeverity.MEDIUM || 0,
    lowEvents: bySeverity.LOW || 0,
    failedLogins: deduped.filter((item) => /LOGIN_FAILED|ACCESS_DENIED/i.test(item.action)).length,
    rateLimitEvents: deduped.filter((item) => /RATE_LIMIT/i.test(item.action)).length,
    uploadRejections: deduped.filter((item) => /UPLOAD_REJECTED/i.test(item.action)).length,
    aiAbuseAttempts: deduped.filter((item) => /AI_ABUSE/i.test(item.action)).length,
    adminActions: deduped.filter((item) => /^ADMIN_/i.test(item.action) || item.actorRole !== "USER").length,
    bySeverity,
    byAction,
    recentEvents: deduped.slice(0, 120),
  };
}

export function dataUrlInfo(dataUrl = "") {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    size: Buffer.byteLength(match[2], "base64"),
  };
}

export function sanitizeFileName(fileName = "upload.bin") {
  const raw = String(fileName || "upload.bin").trim() || "upload.bin";
  const base = raw
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
  return base || "upload.bin";
}

export function validateUploadPayload(payload = {}, options = {}) {
  const dataUrl = String(payload.dataUrl || payload.imageData || payload.audioData || payload.fileData || payload.base64 || "").trim();
  if (!dataUrl) return { ok: false, error: "File data is required.", code: "UPLOAD_DATA_MISSING" };
  const info = dataUrlInfo(dataUrl);
  if (!info) return { ok: false, error: "Only base64 data URL uploads are accepted.", code: "UPLOAD_DATA_URL_REQUIRED" };

  const declaredMime = String(payload.mimeType || payload.type || info.mimeType || "").toLowerCase();
  const mimeType = info.mimeType || declaredMime;
  if (!ALLOWED_UPLOADS[mimeType] || declaredMime && declaredMime !== mimeType) {
    return { ok: false, error: `Unsupported or unsafe file type: ${declaredMime || mimeType || "unknown"}.`, code: "UPLOAD_MIME_REJECTED" };
  }

  const fileName = sanitizeFileName(payload.fileName || payload.name || "upload.bin");
  const extMatch = fileName.toLowerCase().match(/\.[a-z0-9]+$/);
  const ext = extMatch?.[0] || "";
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return { ok: false, error: "This file extension is not allowed.", code: "UPLOAD_EXTENSION_REJECTED" };
  }
  if (ext && !ALLOWED_UPLOADS[mimeType].includes(ext)) {
    return { ok: false, error: "File extension does not match its MIME type.", code: "UPLOAD_EXTENSION_MISMATCH" };
  }

  const maxBytes = Number(options.maxBytes || process.env.MAX_UPLOAD_BYTES || 25_000_000);
  if (info.size > maxBytes) {
    return { ok: false, error: `File is too large. Maximum allowed size is ${Math.round(maxBytes / 1_000_000)} MB.`, code: "UPLOAD_TOO_LARGE" };
  }

  return {
    ok: true,
    fileName,
    mimeType,
    size: info.size,
    dataUrl,
  };
}

export function detectSuspiciousAiRequest(text = "") {
  const normalized = String(text || "").toLowerCase();
  const categories = [];
  if (/(ignore|bypass|override).{0,40}(system|developer|security|instruction|policy)/i.test(normalized)) categories.push("prompt-injection");
  if (/(show|reveal|print|leak|expose).{0,60}(api[_\s-]?key|openai[_\s-]?api[_\s-]?key|secret|token|credential|password|env|environment)/i.test(normalized)) categories.push("secret-exfiltration");
  if (/(another user|other user|all users|someone else|admin data|database dump|service role)/i.test(normalized)) categories.push("cross-user-data");
  if (/(system prompt|developer message|hidden instruction|internal policy)/i.test(normalized)) categories.push("system-prompt");
  return {
    blocked: categories.some((item) => ["secret-exfiltration", "cross-user-data", "system-prompt"].includes(item)),
    suspicious: categories.length > 0,
    categories,
    severity: categories.includes("secret-exfiltration") || categories.includes("cross-user-data") ? "HIGH" : categories.length ? "MEDIUM" : "LOW",
    reason: categories.length ? `Suspicious AI request: ${categories.join(", ")}` : "",
  };
}

export function getRequestIp(req) {
  return String(req?.headers?.["x-forwarded-for"] || "")
    .split(",")[0]
    .trim() || req?.socket?.remoteAddress || "unknown";
}

export function validateOrigin(req, allowedOrigins = []) {
  const method = String(req.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return { ok: true };
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return { ok: true };
  const host = String(req.headers.host || "").trim();
  const sameHost = origin.replace(/^https?:\/\//, "") === host;
  const allowlist = new Set((allowedOrigins || []).map((item) => String(item).trim()).filter(Boolean));
  return sameHost || allowlist.has(origin)
    ? { ok: true }
    : { ok: false, origin, error: "Request origin is not allowed." };
}

export function securityHeaders({ production = false, connectSrc = [] } = {}) {
  const connect = ["'self'", ...connectSrc].filter(Boolean).join(" ");
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self), payment=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://maps.googleapis.com",
      "frame-src 'self' https://accounts.google.com",
      "worker-src 'self' blob:",
      `connect-src ${connect} https://accounts.google.com https://oauth2.googleapis.com https://maps.googleapis.com https://places.googleapis.com https://*.supabase.co https://api.openai.com https://api.groq.com`,
    ].join("; "),
  };
  if (production) headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return headers;
}
