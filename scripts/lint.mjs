import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const TEXT_EXTENSIONS = new Set([".mjs", ".json", ".md", ".yml", ".yaml", ".txt"]);
const failures = [];

async function walk(directory, output = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if ([".git", "node_modules", "coverage"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

const files = await walk(ROOT);
for (const file of files) {
  const relative = path.relative(ROOT, file).replace(/\\/g, "/");
  if (file.endsWith(".mjs")) {
    const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (check.status !== 0) failures.push(`${relative}: ${check.stderr.trim()}`);
  }
  if (TEXT_EXTENSIONS.has(path.extname(file)) || ["LICENSE", ".gitignore", ".editorconfig"].includes(path.basename(file))) {
    const text = await fs.readFile(file, "utf8");
    text.split(/\r?\n/).forEach((line, index) => {
      if (line !== line.trimEnd()) failures.push(`${relative}:${index + 1}: trailing whitespace`);
    });
  }
}

const pkg = JSON.parse(await fs.readFile(path.join(ROOT, "package.json"), "utf8"));
if (pkg.version !== "0.1.0") failures.push("package version mismatch");
if (pkg.license !== "MIT") failures.push("package must be MIT licensed");
if (!pkg.bin?.["miniapp-packguard"]) failures.push("CLI bin is missing");

if (failures.length) {
  process.stderr.write(`Lint failed:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  process.exit(1);
}
process.stdout.write(`Lint passed (${files.length} files checked).\n`);
