import fs from "node:fs/promises";
import path from "node:path";
import { BASELINE_SCHEMA_VERSION } from "./version.mjs";
import { makeIssue, stableStringify, writeTextAtomic } from "./util.mjs";

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function byteCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`invalid baseline: ${label} must be a non-negative safe integer`);
  }
  return value;
}

function canonicalPath(value, allowRoot = false) {
  if (typeof value !== "string" || !value || /[\\\0]/.test(value) ||
      path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value) ||
      value.split("/").some((part) => part === ".." || part === "") ||
      path.posix.normalize(value) !== value || (!allowRoot && value === ".")) {
    throw new Error("invalid baseline: paths must be canonical relative POSIX paths");
  }
  return value;
}

function validateBaseline(baseline) {
  if (!plainObject(baseline) || baseline.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    throw new Error("invalid baseline: unsupported or missing schema version");
  }
  canonicalPath(baseline.root, true);
  if (!plainObject(baseline.metrics) || !plainObject(baseline.files)) {
    throw new Error("invalid baseline: metrics and files must be objects");
  }
  const total = byteCount(baseline.metrics.totalBytes, "totalBytes");
  let sum = 0;
  for (const [filePath, size] of Object.entries(baseline.files)) {
    canonicalPath(filePath);
    sum = byteCount(sum + byteCount(size, "file size"), "file-size sum");
  }
  if (sum !== total) throw new Error("invalid baseline: file sizes do not sum to totalBytes");
  if (baseline.metrics.fileCount != null &&
      byteCount(baseline.metrics.fileCount, "fileCount") !== Object.keys(baseline.files).length) {
    throw new Error("invalid baseline: fileCount does not match the file inventory");
  }
  const categories = ["textBytes", "assetBytes", "otherBytes"];
  for (const key of categories) {
    if (Object.hasOwn(baseline.metrics, key)) byteCount(baseline.metrics[key], key);
  }
  if (categories.every((key) => Object.hasOwn(baseline.metrics, key)) &&
      categories.reduce((count, key) => count + baseline.metrics[key], 0) !== total) {
    throw new Error("invalid baseline: category bytes do not sum to totalBytes");
  }
  if (baseline.metrics.groups != null) {
    if (!plainObject(baseline.metrics.groups)) throw new Error("invalid baseline: groups must be an object");
    for (const size of Object.values(baseline.metrics.groups)) byteCount(size, "group bytes");
  }
  return baseline;
}

export function createBaseline(result) {
  return validateBaseline({
    schemaVersion: BASELINE_SCHEMA_VERSION,
    tool: result.tool,
    root: result.root,
    metrics: {
      totalBytes: result.metrics.totalBytes,
      textBytes: result.metrics.textBytes,
      assetBytes: result.metrics.assetBytes,
      otherBytes: result.metrics.otherBytes,
      fileCount: result.metrics.fileCount,
      groups: result.metrics.groups
    },
    files: Object.fromEntries(result.files.map((file) => [file.path, file.size]))
  });
}

export async function readBaseline(projectRoot, baselinePath) {
  if (!baselinePath) return null;
  const absolute = path.resolve(projectRoot, baselinePath);
  try {
    const baseline = validateBaseline(JSON.parse(await fs.readFile(absolute, "utf8")));
    return { baseline, absolute };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("configured baseline is missing; create it explicitly before enforcing growth limits");
    }
    throw error;
  }
}

export function compareBaseline(result, baseline, config) {
  if (!baseline) return [];
  validateBaseline(baseline);
  if (canonicalPath(result.root, true) !== baseline.root) {
    throw new Error("baseline root does not match the audited package root");
  }
  const issues = [];
  const severity = config.severity;
  const totalGrowth = result.metrics.totalBytes - Number(baseline.metrics?.totalBytes || 0);
  if (config.maxTotalGrowthBytes != null && totalGrowth > config.maxTotalGrowthBytes) {
    issues.push(makeIssue({
      ruleId: "baseline-total-growth-bytes",
      severity,
      message: `Package grew by ${totalGrowth} bytes; allowed growth is ${config.maxTotalGrowthBytes} bytes.`,
      details: { previous: baseline.metrics.totalBytes, current: result.metrics.totalBytes, delta: totalGrowth }
    }));
  }
  const previousTotal = Number(baseline.metrics?.totalBytes || 0);
  const growthPercent = previousTotal > 0 ? (totalGrowth / previousTotal) * 100 : totalGrowth > 0 ? 100 : 0;
  if (config.maxTotalGrowthPercent != null && growthPercent > config.maxTotalGrowthPercent) {
    issues.push(makeIssue({
      ruleId: "baseline-total-growth-percent",
      severity,
      message: `Package grew by ${growthPercent.toFixed(2)}%; allowed growth is ${config.maxTotalGrowthPercent}%.`,
      details: { previous: previousTotal, current: result.metrics.totalBytes, growthPercent }
    }));
  }
  if (config.maxFileGrowthBytes != null) {
    const previousFiles = baseline.files || {};
    for (const file of result.files) {
      if (!Object.hasOwn(previousFiles, file.path)) continue;
      const delta = file.size - Number(previousFiles[file.path]);
      if (delta > config.maxFileGrowthBytes) {
        issues.push(makeIssue({
          ruleId: "baseline-file-growth",
          severity,
          path: file.path,
          message: `File grew by ${delta} bytes; allowed growth is ${config.maxFileGrowthBytes} bytes.`,
          details: { previous: previousFiles[file.path], current: file.size, delta }
        }));
      }
    }
  }
  return issues;
}

export async function writeBaseline(filePath, result) {
  await writeTextAtomic(path.resolve(filePath), stableStringify(createBaseline(result)));
}
