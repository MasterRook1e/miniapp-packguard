import path from "node:path";
import { escapeMarkdown, formatBytes, stableStringify } from "./util.mjs";

function topologyPackages(result) {
  if (!result.topology?.enabled || !result.topology.mainPackage) return [];
  return [result.topology.mainPackage, ...(result.topology.subpackages || [])];
}

export function renderConsole(result) {
  const lines = [
    `MiniApp PackGuard ${result.tool.version}`,
    `Root: ${result.root} (${result.mode} mode)`,
    `Files: ${result.metrics.fileCount} | Total: ${formatBytes(result.metrics.totalBytes)} | Assets: ${formatBytes(result.metrics.assetBytes)} | Text: ${formatBytes(result.metrics.textBytes)}`
  ];
  const packages = topologyPackages(result);
  if (packages.length) {
    const subpackages = packages.slice(1);
    const subpackageBytes = subpackages.reduce((sum, entry) => sum + entry.totalBytes, 0);
    lines.push(
      `Packages: Main ${formatBytes(packages[0].totalBytes)} | Subpackages: ${subpackages.length} / ${formatBytes(subpackageBytes)} | Routes: ${result.topology.routes.length}`
    );
  }
  lines.push(`Issues: ${result.summary.errors} error(s), ${result.summary.warnings} warning(s), ${result.summary.notes} note(s)`);
  if (result.issues.length) {
    lines.push("");
    for (const issue of result.issues) {
      lines.push(`${issue.severity.toUpperCase().padEnd(7)} ${issue.ruleId}${issue.path ? ` ${issue.path}` : ""}: ${issue.message}`);
    }
  }
  lines.push("", result.summary.passed ? "PASS" : "FAIL");
  return `${lines.join("\n")}\n`;
}

export function renderJson(result) {
  return stableStringify(result);
}

export function renderMarkdown(result) {
  const lines = [
    "# MiniApp PackGuard report",
    "",
    `**Status:** ${result.summary.passed ? "PASS" : "FAIL"}`,
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Files | ${result.metrics.fileCount} |`,
    `| Total bytes | ${result.metrics.totalBytes} (${formatBytes(result.metrics.totalBytes)}) |`,
    `| Text bytes | ${result.metrics.textBytes} (${formatBytes(result.metrics.textBytes)}) |`,
    `| Asset bytes | ${result.metrics.assetBytes} (${formatBytes(result.metrics.assetBytes)}) |`,
    `| Errors | ${result.summary.errors} |`,
    `| Warnings | ${result.summary.warnings} |`,
    `| Notes | ${result.summary.notes} |`,
    ""
  ];

  const packages = topologyPackages(result);
  if (packages.length) {
    lines.push(
      "## Package topology",
      "",
      `Declared routes: ${result.topology.routes.length}; tab-bar routes: ${result.topology.tabBarRoutes.length}.`,
      "",
      "| Package | Root | Pages | Files | Total bytes | Text bytes | Asset bytes | Other bytes |",
      "|---|---|---:|---:|---:|---:|---:|---:|"
    );
    for (const entry of packages) {
      lines.push(
        `| ${escapeMarkdown(entry.name)} | \`${escapeMarkdown(entry.root || ".")}\` | ${entry.pageCount} | ${entry.fileCount} | ${entry.totalBytes} | ${entry.textBytes} | ${entry.assetBytes} | ${entry.otherBytes} |`
      );
    }
    lines.push("");
  }

  lines.push("## Findings", "");
  if (!result.issues.length) lines.push("No findings.");
  else {
    lines.push("| Severity | Rule | Path | Message |", "|---|---|---|---|");
    for (const issue of result.issues) {
      lines.push(`| ${issue.severity} | \`${escapeMarkdown(issue.ruleId)}\` | ${issue.path ? `\`${escapeMarkdown(issue.path)}\`` : ""} | ${escapeMarkdown(issue.message)} |`);
    }
  }
  lines.push("", "## Largest files", "", "| Path | Bytes |", "|---|---:|");
  for (const file of result.largestFiles) lines.push(`| \`${escapeMarkdown(file.path)}\` | ${file.size} |`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

export function renderSarif(result) {
  const uniqueRules = [...new Set(result.issues.map((issue) => issue.ruleId))].sort();
  const rules = uniqueRules.map((ruleId) => ({
    id: ruleId,
    name: ruleId,
    shortDescription: { text: ruleId.replace(/-/g, " ") },
    defaultConfiguration: {
      level: result.issues.some((issue) => issue.ruleId === ruleId && issue.severity === "error") ? "error" :
        result.issues.some((issue) => issue.ruleId === ruleId && issue.severity === "warning") ? "warning" : "note"
    }
  }));
  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [{
      tool: { driver: { name: result.tool.name, version: result.tool.version, informationUri: "https://github.com/MasterRook1e/miniapp-packguard", rules } },
      results: result.issues.map((issue) => ({
        ruleId: issue.ruleId,
        level: issue.severity === "error" ? "error" : issue.severity === "warning" ? "warning" : "note",
        message: { text: issue.message },
        partialFingerprints: { primaryLocationLineHash: issue.fingerprint },
        locations: issue.path ? [{ physicalLocation: { artifactLocation: { uri: path.posix.join(result.root === "." ? "" : result.root, issue.path) }, region: { startLine: 1 } } }] : undefined,
        properties: issue.details
      }))
    }]
  };
  return stableStringify(sarif);
}

export function renderReport(result, format) {
  if (format === "json") return renderJson(result);
  if (format === "markdown" || format === "md") return renderMarkdown(result);
  if (format === "sarif") return renderSarif(result);
  return renderConsole(result);
}
