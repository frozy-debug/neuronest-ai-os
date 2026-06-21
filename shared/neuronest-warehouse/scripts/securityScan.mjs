import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const startDir = path.resolve(process.argv[2] || process.cwd());

function git(args, cwd = startDir) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function repoRoot() {
  try {
    return git(["rev-parse", "--show-toplevel"]);
  } catch {
    return startDir;
  }
}

const root = repoRoot();
const patterns = [
  { name: "OpenAI API key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "Groq API key", regex: /\bgsk_[A-Za-z0-9_-]{20,}\b/g },
  { name: "Google API key", regex: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { name: "Google client secret", regex: /\bGOCSPX-[0-9A-Za-z_-]{16,}\b/g },
  { name: "JWT-like token", regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  { name: "Service role assignment", regex: /\b(SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|GROQ_API_KEY|GOOGLE_CLIENT_SECRET|SESSION_SECRET|ADMIN_SECRET)\s*=\s*[^#\s]+/g },
];

const allowedPlaceholder = /<[^>]+>|your[-_]|your_|placeholder|example|dummy|replace_me|changeme|change-this|make-|xxxxx|\[REDACTED/i;
const skippedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".mp3", ".wav", ".webm", ".pdf"]);

function trackedFiles() {
  try {
    return git(["ls-files"], root).split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function isTextFile(file) {
  if (skippedExtensions.has(path.extname(file).toLowerCase())) return false;
  const stat = fs.statSync(path.join(root, file));
  return stat.size <= 2_000_000;
}

const findings = [];
for (const file of trackedFiles()) {
  if (!isTextFile(file)) continue;
  if (/\.env\.example$/i.test(file)) continue;
  const absolute = path.join(root, file);
  const content = fs.readFileSync(absolute, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(line);
      if (!match || allowedPlaceholder.test(match[0])) continue;
      findings.push({ file, line: index + 1, type: pattern.name });
    }
  });
}

const gitignorePath = path.join(root, ".gitignore");
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, "utf8");
  if (!/(^|\n)(\*\*\/)?\.env(\n|$)|(^|\n)(\*\*\/)?\.env\*(\n|$)/.test(gitignore)) {
    findings.push({ file: ".gitignore", line: 1, type: ".env files are not ignored" });
  }
} else {
  findings.push({ file: ".gitignore", line: 1, type: ".gitignore missing; .env files may be committed" });
}

if (findings.length) {
  console.error("Security scan failed. Potential secret exposure found:");
  for (const finding of findings) {
    console.error(`- ${finding.type} at ${finding.file}:${finding.line}`);
  }
  process.exit(1);
}

console.log("Security scan passed. No tracked secret patterns found.");
