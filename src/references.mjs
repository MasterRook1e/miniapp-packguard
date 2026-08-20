import fs from "node:fs/promises";
import path from "node:path";
import { compileGlobs, matchesAny } from "./glob.mjs";
import { normalizeRelative, safeDecodeUri, stripQueryAndHash, toPosix } from "./util.mjs";

const REMOTE_SCHEMES = /^(?:https?:|data:|blob:|wxfile:|cloud:|file:|mailto:|tel:|#)/i;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractCandidates(text, assetExtensions, extraPatterns) {
  const extensionPattern = assetExtensions.map((extension) => escapeRegex(extension.slice(1))).join("|");
  const candidates = new Set();
  const patterns = [
    /url\(\s*(["']?)([^"')]+)\1\s*\)/gi,
    /\b(?:src|href|icon|poster|cover|thumb|image|background)\s*=\s*["']([^"']+)["']/gi,
    new RegExp(`["'\\x60]([^"'\\x60\\n]+\\.(?:${extensionPattern})(?:[?#][^"'\\x60\\n]*)?)["'\\x60]`, "gi")
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) candidates.add(match[2] || match[1]);
  }
  for (const source of extraPatterns) {
    const pattern = new RegExp(source, "gi");
    let match;
    while ((match = pattern.exec(text))) candidates.add(match[1] || match[0]);
  }
  return [...candidates];
}

function applyAlias(token, aliases) {
  const entries = Object.entries(aliases).sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, replacement] of entries) {
    if (token.startsWith(prefix)) return `${replacement}${token.slice(prefix.length)}`;
  }
  return null;
}

function resolveCandidate(token, sourcePath, aliases) {
  let value = safeDecodeUri(stripQueryAndHash(String(token).trim())).replace(/\\/g, "/");
  if (!value || REMOTE_SCHEMES.test(value)) return null;
  let resolved;
  if (value.startsWith("/")) {
    resolved = value.slice(1);
  } else {
    const aliased = applyAlias(value, aliases);
    if (aliased != null) value = aliased;
    resolved = value.startsWith("/")
      ? value.slice(1)
      : path.posix.join(path.posix.dirname(sourcePath), value);
  }
  resolved = normalizeRelative(resolved);
  if (!resolved || resolved.startsWith("..")) return null;
  return resolved;
}

export async function analyzeReferences(files, config) {
  const assets = files.filter((file) => file.kind === "asset");
  const assetPaths = new Set(assets.map((file) => file.relativePath));
  const referencedBy = new Map(assets.map((file) => [file.relativePath, []]));
  const ignore = compileGlobs(config.references.ignore);
  const unresolved = [];
  if (!config.references.enabled) return { referencedBy, unreferenced: [], unresolved };
  for (const file of files.filter((entry) => entry.kind === "text" && entry.size <= config.references.maxTextFileBytes)) {
    const text = await fs.readFile(file.absolutePath, "utf8");
    const candidates = extractCandidates(text, config.assetExtensions, config.references.extraPatterns);
    for (const candidate of candidates) {
      const resolved = resolveCandidate(candidate, file.relativePath, config.aliases);
      if (!resolved) continue;
      if (assetPaths.has(resolved)) {
        referencedBy.get(resolved).push(file.relativePath);
      } else if (config.assetExtensions.some((extension) => resolved.toLowerCase().endsWith(extension))) {
        unresolved.push({ source: file.relativePath, token: candidate, resolved });
      }
    }
  }
  for (const references of referencedBy.values()) references.sort();
  const unreferenced = assets
    .filter((asset) => referencedBy.get(asset.relativePath).length === 0 && !matchesAny(asset.relativePath, ignore))
    .map((asset) => asset.relativePath)
    .sort();
  unresolved.sort((a, b) => `${a.source}:${a.resolved}`.localeCompare(`${b.source}:${b.resolved}`, "en"));
  return { referencedBy, unreferenced, unresolved };
}
