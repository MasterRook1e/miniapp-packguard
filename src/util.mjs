import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const SEVERITY_RANK = Object.freeze({ note: 0, warning: 1, error: 2 });

export function toPosix(value) {
  return String(value).replace(/\\/g, "/");
}

export function normalizeRelative(value) {
  const normalized = path.posix.normalize(toPosix(value || "."));
  return normalized === "." ? "" : normalized.replace(/^\.\//, "");
}

export function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function assertInside(parent, candidate, label = "path") {
  if (!isInside(parent, candidate)) {
    throw new Error(`${label} escapes the project boundary: ${candidate}`);
  }
}

export function normalizeSeverity(value, fallback = "error") {
  return Object.hasOwn(SEVERITY_RANK, value) ? value : fallback;
}

export function shouldFail(issues, failLevel) {
  if (failLevel === "off") return false;
  const threshold = SEVERITY_RANK[normalizeSeverity(failLevel, "error")];
  return issues.some((issue) => SEVERITY_RANK[issue.severity] >= threshold);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "n/a";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes;
  let index = -1;
  do {
    value /= 1024;
    index += 1;
  } while (value >= 1024 && index < units.length - 1);
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[index]}`;
}

export function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableSortObject(value[key])]),
  );
}

export function stableStringify(value, space = 2) {
  return `${JSON.stringify(stableSortObject(value), null, space)}\n`;
}

export function fingerprint(parts) {
  return crypto.createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24);
}

export async function sha256File(filePath) {
  const handle = await fs.open(filePath, "r");
  const hash = crypto.createHash("sha256");
  try {
    for await (const chunk of handle.readableWebStream()) {
      hash.update(Buffer.from(chunk));
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

export async function writeTextAtomic(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporary, content, "utf8");
  await fs.rename(temporary, filePath);
}

export function stripQueryAndHash(value) {
  return value.split(/[?#]/, 1)[0];
}

export function safeDecodeUri(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function escapeMarkdown(value) {
  return String(value).replace(/([|\\])/g, "\\$1").replace(/\r?\n/g, " ");
}

export function parseNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number`);
  return number;
}

export function makeIssue({ ruleId, severity, message, path: issuePath = null, details = {}, help = null }) {
  const normalizedSeverity = normalizeSeverity(severity, "error");
  return {
    ruleId,
    severity: normalizedSeverity,
    message,
    path: issuePath,
    details,
    help,
    fingerprint: fingerprint([ruleId, normalizedSeverity, issuePath || "", message]),
  };
}
