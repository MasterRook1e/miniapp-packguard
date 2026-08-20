import fs from "node:fs/promises";
import path from "node:path";
import { assertInside, normalizeSeverity, parseNumber } from "./util.mjs";

export const DEFAULT_CONFIG = Object.freeze({
  version: 1,
  root: "miniprogram",
  mode: "git",
  include: ["**/*"],
  exclude: [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/*.map"
  ],
  followSymlinks: false,
  textExtensions: [".js", ".mjs", ".cjs", ".ts", ".json", ".wxml", ".wxss", ".css", ".html", ".md"],
  assetExtensions: [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".mp3", ".wav", ".ogg", ".ttf", ".otf", ".woff", ".woff2"],
  aliases: {
    "/": ""
  },
  references: {
    enabled: true,
    severity: "warning",
    ignore: [],
    extraPatterns: [],
    maxTextFileBytes: 2097152
  },
  duplicates: {
    enabled: true,
    scope: "assets",
    minBytes: 1,
    severity: "warning"
  },
  collisions: {
    caseInsensitive: "error",
    unicodeNfc: "error"
  },
  requiredFiles: [],
  budgets: {
    totalBytes: null,
    textBytes: null,
    assetBytes: null,
    maxFileBytes: null,
    groups: []
  },
  baseline: {
    path: null,
    maxTotalGrowthBytes: null,
    maxTotalGrowthPercent: null,
    maxFileGrowthBytes: null,
    severity: "error"
  },
  reporting: {
    largestFiles: 20
  },
  failLevel: "error"
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeObject(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return override ?? base;
  const output = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
  for (const [key, value] of Object.entries(override)) {
    output[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergeObject(output[key], value)
      : value;
  }
  return output;
}

function normalizeExtension(value) {
  const extension = String(value).toLowerCase();
  return extension.startsWith(".") ? extension : `.${extension}`;
}

function normalizeBudget(value, defaultSeverity = "error") {
  if (value == null) return null;
  if (typeof value === "number") {
    return { limit: parseNumber(value, "budget limit"), severity: defaultSeverity };
  }
  if (typeof value !== "object") throw new Error("budget must be a number, object, or null");
  return {
    limit: parseNumber(value.limit, "budget limit"),
    severity: normalizeSeverity(value.severity, defaultSeverity)
  };
}

export function normalizeConfig(input) {
  const config = mergeObject(clone(DEFAULT_CONFIG), input || {});
  if (config.version !== 1) throw new Error(`unsupported config version: ${config.version}`);
  if (!Array.isArray(config.include) || !Array.isArray(config.exclude)) throw new Error("include and exclude must be arrays");
  if (!Array.isArray(config.textExtensions) || !Array.isArray(config.assetExtensions)) {
    throw new Error("textExtensions and assetExtensions must be arrays");
  }
  config.textExtensions = [...new Set(config.textExtensions.map(normalizeExtension))].sort();
  config.assetExtensions = [...new Set(config.assetExtensions.map(normalizeExtension))].sort();
  config.mode = config.mode === "fs" ? "fs" : "git";
  config.failLevel = config.failLevel === "off" ? "off" : normalizeSeverity(config.failLevel, "error");
  config.references.severity = normalizeSeverity(config.references.severity, "warning");
  config.duplicates.severity = normalizeSeverity(config.duplicates.severity, "warning");
  config.collisions.caseInsensitive = normalizeSeverity(config.collisions.caseInsensitive, "error");
  config.collisions.unicodeNfc = normalizeSeverity(config.collisions.unicodeNfc, "error");
  config.baseline.severity = normalizeSeverity(config.baseline.severity, "error");
  config.references.maxTextFileBytes = Math.max(1, parseNumber(config.references.maxTextFileBytes, "references.maxTextFileBytes"));
  config.duplicates.minBytes = Math.max(0, parseNumber(config.duplicates.minBytes, "duplicates.minBytes"));
  config.reporting.largestFiles = Math.max(1, Math.trunc(parseNumber(config.reporting.largestFiles, "reporting.largestFiles")));

  config.budgets.totalBytes = normalizeBudget(config.budgets.totalBytes);
  config.budgets.textBytes = normalizeBudget(config.budgets.textBytes);
  config.budgets.assetBytes = normalizeBudget(config.budgets.assetBytes);
  config.budgets.maxFileBytes = normalizeBudget(config.budgets.maxFileBytes);
  config.budgets.groups = (config.budgets.groups || []).map((group, index) => {
    if (!group || typeof group !== "object" || !group.name) throw new Error(`budgets.groups[${index}] requires a name`);
    return {
      name: String(group.name),
      extensions: (group.extensions || []).map(normalizeExtension),
      patterns: Array.isArray(group.patterns) ? group.patterns.map(String) : [],
      budget: normalizeBudget(group.limit == null ? group.budget : { limit: group.limit, severity: group.severity })
    };
  });
  config.requiredFiles = (config.requiredFiles || []).map(String);
  config.references.ignore = (config.references.ignore || []).map(String);
  config.references.extraPatterns = (config.references.extraPatterns || []).map(String);
  config.aliases = Object.fromEntries(Object.entries(config.aliases || {}).map(([key, value]) => [String(key), String(value)]));
  return config;
}

export async function loadConfig({ projectRoot, configPath = null, overrides = {} }) {
  const absoluteProjectRoot = path.resolve(projectRoot || process.cwd());
  let source = {};
  let resolvedConfigPath = null;
  if (configPath) {
    resolvedConfigPath = path.resolve(absoluteProjectRoot, configPath);
    assertInside(absoluteProjectRoot, resolvedConfigPath, "config path");
    source = JSON.parse(await fs.readFile(resolvedConfigPath, "utf8"));
  } else {
    for (const candidate of ["miniapp-packguard.config.json", ".miniapp-packguard.json"]) {
      const absolute = path.join(absoluteProjectRoot, candidate);
      try {
        source = JSON.parse(await fs.readFile(absolute, "utf8"));
        resolvedConfigPath = absolute;
        break;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }
  }
  const config = normalizeConfig(mergeObject(source, overrides));
  const scanRoot = path.resolve(absoluteProjectRoot, config.root);
  assertInside(absoluteProjectRoot, scanRoot, "scan root");
  return { config, projectRoot: absoluteProjectRoot, scanRoot, configPath: resolvedConfigPath };
}

export function createExampleConfig() {
  return {
    version: 1,
    root: "miniprogram",
    mode: "git",
    include: ["**/*"],
    exclude: ["**/*.map", "**/node_modules/**"],
    budgets: {
      totalBytes: { limit: 2097152, severity: "error" },
      assetBytes: { limit: 786432, severity: "warning" },
      maxFileBytes: { limit: 262144, severity: "warning" },
      groups: [
        { name: "scripts", extensions: [".js", ".ts"], limit: 786432, severity: "error" },
        { name: "templates", extensions: [".wxml", ".html"], limit: 393216, severity: "warning" },
        { name: "styles", extensions: [".wxss", ".css"], limit: 393216, severity: "warning" }
      ]
    },
    references: { enabled: true, severity: "warning", ignore: [] },
    duplicates: { enabled: true, scope: "assets", minBytes: 1024, severity: "warning" },
    baseline: { path: ".packguard-baseline.json", maxTotalGrowthBytes: 131072, maxTotalGrowthPercent: 10, severity: "error" },
    failLevel: "error"
  };
}
