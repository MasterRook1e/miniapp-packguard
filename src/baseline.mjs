import fs from "node:fs/promises";
import path from "node:path";
import { BASELINE_SCHEMA_VERSION } from "./version.mjs";
import { makeIssue, stableStringify, writeTextAtomic } from "./util.mjs";

export function createBaseline(result) {
  return {
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
  };
}

export async function readBaseline(projectRoot, baselinePath) {
  if (!baselinePath) return null;
  const absolute = path.resolve(projectRoot, baselinePath);
  try {
    const baseline = JSON.parse(await fs.readFile(absolute, "utf8"));
    if (baseline.schemaVersion !== BASELINE_SCHEMA_VERSION) {
      throw new Error(`unsupported baseline schema: ${baseline.schemaVersion}`);
    }
    return { baseline, absolute };
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export function compareBaseline(result, baseline, config) {
  if (!baseline) return [];
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
