import path from "node:path";
import { compileGlobs, matchesAny } from "./glob.mjs";
import { discoverFiles } from "./files.mjs";
import { analyzeReferences } from "./references.mjs";
import { compareBaseline, readBaseline } from "./baseline.mjs";
import { REPORT_SCHEMA_VERSION, TOOL_NAME, TOOL_VERSION } from "./version.mjs";
import { makeIssue, sha256File, shouldFail } from "./util.mjs";

function budgetIssue(ruleId, budget, actual, label, issuePath = null) {
  if (!budget || actual <= budget.limit) return null;
  return makeIssue({
    ruleId,
    severity: budget.severity,
    path: issuePath,
    message: `${label} is ${actual} bytes; limit is ${budget.limit} bytes.`,
    details: { actual, limit: budget.limit, excess: actual - budget.limit }
  });
}

function detectCollisions(files, config) {
  const issues = [];
  const caseMap = new Map();
  const unicodeMap = new Map();
  for (const file of files) {
    const lower = file.relativePath.toLocaleLowerCase("en-US");
    const nfc = file.relativePath.normalize("NFC");
    const caseGroup = caseMap.get(lower) || [];
    caseGroup.push(file.relativePath);
    caseMap.set(lower, caseGroup);
    const unicodeGroup = unicodeMap.get(nfc) || [];
    unicodeGroup.push(file.relativePath);
    unicodeMap.set(nfc, unicodeGroup);
  }
  for (const group of caseMap.values()) {
    if (new Set(group).size > 1) {
      issues.push(makeIssue({
        ruleId: "path-case-collision",
        severity: config.collisions.caseInsensitive,
        path: group[0],
        message: `Paths collide on case-insensitive file systems: ${group.join(", ")}.`,
        details: { paths: group }
      }));
    }
  }
  for (const group of unicodeMap.values()) {
    if (new Set(group).size > 1) {
      issues.push(makeIssue({
        ruleId: "path-unicode-collision",
        severity: config.collisions.unicodeNfc,
        path: group[0],
        message: `Paths collide after Unicode NFC normalization: ${group.join(", ")}.`,
        details: { paths: group }
      }));
    }
  }
  return issues;
}

async function detectDuplicates(files, config) {
  if (!config.duplicates.enabled) return { issues: [], groups: [] };
  const candidates = files.filter((file) =>
    file.size >= config.duplicates.minBytes &&
    (config.duplicates.scope === "all" || file.kind === "asset"),
  );
  const byKey = new Map();
  for (const file of candidates) {
    const hash = await sha256File(file.absolutePath);
    const key = `${file.size}:${hash}`;
    const group = byKey.get(key) || { hash, size: file.size, paths: [] };
    group.paths.push(file.relativePath);
    byKey.set(key, group);
  }
  const groups = [...byKey.values()].filter((group) => group.paths.length > 1);
  groups.forEach((group) => group.paths.sort());
  groups.sort((a, b) => a.paths[0].localeCompare(b.paths[0], "en"));
  const issues = groups.map((group) => makeIssue({
    ruleId: "duplicate-content",
    severity: config.duplicates.severity,
    path: group.paths[0],
    message: `${group.paths.length} files have identical content (${group.size} bytes each).`,
    details: group
  }));
  return { issues, groups };
}

function calculateMetrics(files, config) {
  const metrics = {
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    textBytes: files.filter((file) => file.kind === "text").reduce((sum, file) => sum + file.size, 0),
    assetBytes: files.filter((file) => file.kind === "asset").reduce((sum, file) => sum + file.size, 0),
    otherBytes: files.filter((file) => file.kind === "other").reduce((sum, file) => sum + file.size, 0),
    fileCount: files.length,
    textCount: files.filter((file) => file.kind === "text").length,
    assetCount: files.filter((file) => file.kind === "asset").length,
    otherCount: files.filter((file) => file.kind === "other").length,
    extensions: {},
    groups: {}
  };
  for (const file of files) {
    const key = file.extension || "[no extension]";
    metrics.extensions[key] = (metrics.extensions[key] || 0) + file.size;
  }
  for (const group of config.budgets.groups) {
    const patterns = compileGlobs(group.patterns);
    const extensions = new Set(group.extensions);
    metrics.groups[group.name] = files
      .filter((file) => extensions.has(file.extension) || matchesAny(file.relativePath, patterns))
      .reduce((sum, file) => sum + file.size, 0);
  }
  return metrics;
}

function applyBudgets(files, metrics, config) {
  const issues = [];
  for (const issue of [
    budgetIssue("budget-total", config.budgets.totalBytes, metrics.totalBytes, "Total package size"),
    budgetIssue("budget-text", config.budgets.textBytes, metrics.textBytes, "Text source size"),
    budgetIssue("budget-assets", config.budgets.assetBytes, metrics.assetBytes, "Asset size")
  ]) if (issue) issues.push(issue);
  if (config.budgets.maxFileBytes) {
    for (const file of files) {
      const issue = budgetIssue("budget-file", config.budgets.maxFileBytes, file.size, "File size", file.relativePath);
      if (issue) issues.push(issue);
    }
  }
  for (const group of config.budgets.groups) {
    const issue = budgetIssue(`budget-group-${group.name}`, group.budget, metrics.groups[group.name], `Group ${group.name}`);
    if (issue) issues.push(issue);
  }
  return issues;
}

function requiredFileIssues(files, config) {
  const paths = new Set(files.map((file) => file.relativePath));
  return config.requiredFiles
    .filter((required) => !paths.has(required))
    .map((required) => makeIssue({
      ruleId: "required-file-missing",
      severity: "error",
      path: required,
      message: "Required package file is missing."
    }));
}

export async function auditProject({ projectRoot, scanRoot, config, changedSince = null, baselinePath = null }) {
  const started = performance.now();
  const discovery = await discoverFiles({ projectRoot, scanRoot, config, changedSince });
  const files = discovery.files;
  const metrics = calculateMetrics(files, config);
  const references = await analyzeReferences(files, config);
  const duplicates = await detectDuplicates(files, config);
  const resultFiles = files.map((file) => ({
    path: file.relativePath,
    projectPath: file.projectRelative,
    size: file.size,
    extension: file.extension,
    kind: file.kind,
    changed: file.changed
  }));
  let issues = [
    ...discovery.issues,
    ...detectCollisions(files, config),
    ...requiredFileIssues(files, config),
    ...applyBudgets(files, metrics, config),
    ...duplicates.issues,
    ...references.unreferenced.map((assetPath) => makeIssue({
      ruleId: "asset-unreferenced",
      severity: config.references.severity,
      path: assetPath,
      message: "Asset was not referenced by any scanned text file."
    })),
    ...references.unresolved.map((entry) => makeIssue({
      ruleId: "asset-reference-unresolved",
      severity: "note",
      path: entry.source,
      message: `Asset-like reference could not be resolved: ${entry.token}`,
      details: entry
    }))
  ];
  const provisional = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    generatedAt: new Date().toISOString(),
    projectRoot: path.basename(projectRoot),
    root: path.relative(projectRoot, scanRoot).replace(/\\/g, "/") || ".",
    mode: config.mode,
    changedSince,
    changedCount: discovery.changedCount,
    metrics,
    files: resultFiles,
    duplicates: duplicates.groups,
    references: {
      referencedAssets: [...references.referencedBy.values()].filter((refs) => refs.length > 0).length,
      unreferencedAssets: references.unreferenced,
      unresolved: references.unresolved
    }
  };
  const baselineInfo = await readBaseline(projectRoot, baselinePath || config.baseline.path);
  issues.push(...compareBaseline(provisional, baselineInfo?.baseline, config.baseline));
  issues.sort((a, b) => {
    const rank = { error: 0, warning: 1, note: 2 };
    return rank[a.severity] - rank[b.severity] || (a.path || "").localeCompare(b.path || "", "en") || a.ruleId.localeCompare(b.ruleId, "en");
  });
  const largestFiles = [...resultFiles].sort((a, b) => b.size - a.size || a.path.localeCompare(b.path, "en")).slice(0, config.reporting.largestFiles);
  return {
    ...provisional,
    durationMs: Math.round((performance.now() - started) * 100) / 100,
    largestFiles,
    issues,
    summary: {
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      notes: issues.filter((issue) => issue.severity === "note").length,
      passed: !shouldFail(issues, config.failLevel),
      failLevel: config.failLevel,
      baselineLoaded: Boolean(baselineInfo)
    }
  };
}
