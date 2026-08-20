import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { compileGlobs, matchesSelection } from "./glob.mjs";
import { assertInside, makeIssue, normalizeRelative, toPosix } from "./util.mjs";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(`${command} exited ${code}: ${Buffer.concat(stderr).toString("utf8").trim()}`));
    });
  });
}

async function listGitFiles(projectRoot, scanRoot) {
  const scanRelative = normalizeRelative(toPosix(path.relative(projectRoot, scanRoot))) || ".";
  const buffer = await run("git", ["-C", projectRoot, "ls-files", "-z", "--", scanRelative]);
  return buffer.toString("utf8").split("\0").filter(Boolean).map((projectRelative) => ({
    absolutePath: path.resolve(projectRoot, projectRelative),
    projectRelative: normalizeRelative(projectRelative),
    relativePath: normalizeRelative(toPosix(path.relative(scanRoot, path.resolve(projectRoot, projectRelative))))
  }));
}

async function walk(root, followSymlinks, issues, current = root, output = []) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const absolutePath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      const real = await fs.realpath(absolutePath);
      if (!followSymlinks) {
        issues.push(makeIssue({
          ruleId: "unsafe-symlink",
          severity: "warning",
          path: normalizeRelative(toPosix(path.relative(root, absolutePath))),
          message: "Symbolic link was skipped because followSymlinks is disabled.",
          details: { target: real }
        }));
        continue;
      }
      assertInside(root, real, "symbolic link target");
      const stat = await fs.stat(real);
      if (stat.isDirectory()) await walk(root, followSymlinks, issues, real, output);
      else if (stat.isFile()) output.push(absolutePath);
    } else if (entry.isDirectory()) {
      await walk(root, followSymlinks, issues, absolutePath, output);
    } else if (entry.isFile()) {
      output.push(absolutePath);
    }
  }
  return output;
}

async function listFsFiles(projectRoot, scanRoot, followSymlinks, issues) {
  const absoluteFiles = await walk(scanRoot, followSymlinks, issues);
  return absoluteFiles.map((absolutePath) => ({
    absolutePath,
    projectRelative: normalizeRelative(toPosix(path.relative(projectRoot, absolutePath))),
    relativePath: normalizeRelative(toPosix(path.relative(scanRoot, absolutePath)))
  }));
}

async function changedPaths(projectRoot, scanRoot, ref) {
  if (!ref) return null;
  const scanRelative = normalizeRelative(toPosix(path.relative(projectRoot, scanRoot))) || ".";
  const buffer = await run("git", ["-C", projectRoot, "diff", "--name-only", "-z", `${ref}...HEAD`, "--", scanRelative]);
  return new Set(buffer.toString("utf8").split("\0").filter(Boolean).map(normalizeRelative));
}

export async function discoverFiles({ projectRoot, scanRoot, config, changedSince = null }) {
  const issues = [];
  await fs.access(scanRoot);
  const include = compileGlobs(config.include);
  const exclude = compileGlobs(config.exclude);
  const rawFiles = config.mode === "git"
    ? await listGitFiles(projectRoot, scanRoot)
    : await listFsFiles(projectRoot, scanRoot, config.followSymlinks, issues);
  const changed = await changedPaths(projectRoot, scanRoot, changedSince);
  const textExtensions = new Set(config.textExtensions);
  const assetExtensions = new Set(config.assetExtensions);
  const files = [];
  for (const candidate of rawFiles) {
    assertInside(scanRoot, candidate.absolutePath, "discovered file");
    if (!candidate.relativePath || candidate.relativePath.startsWith("..")) continue;
    if (!matchesSelection(candidate.relativePath, include, exclude)) continue;
    let stat;
    try {
      stat = await fs.stat(candidate.absolutePath);
    } catch (error) {
      issues.push(makeIssue({
        ruleId: "file-unreadable",
        severity: "error",
        path: candidate.relativePath,
        message: `Unable to stat tracked file: ${error.message}`
      }));
      continue;
    }
    if (!stat.isFile()) continue;
    const extension = path.extname(candidate.relativePath).toLowerCase();
    const kind = textExtensions.has(extension) ? "text" : assetExtensions.has(extension) ? "asset" : "other";
    files.push({
      ...candidate,
      size: stat.size,
      extension,
      kind,
      changed: changed ? changed.has(candidate.projectRelative) : null
    });
  }
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));
  return { files, issues, changedCount: changed ? files.filter((file) => file.changed).length : null };
}
