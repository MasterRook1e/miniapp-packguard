import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const NPM_CLI = process.env.npm_execpath;
const REQUIRED_PACKAGE_PATHS = new Set([
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "action.yml",
  "bin/miniapp-packguard.mjs",
  "package.json",
  "schemas/config.schema.json",
  "src/index.mjs"
]);

if (!NPM_CLI) {
  throw new Error("npm_execpath is unavailable; run this check through `npm run pack:test`");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited ${result.status}\n${result.stdout || ""}\n${result.stderr || ""}`,
    );
  }
  return result;
}

function runNpm(args, options = {}) {
  return run(process.execPath, [NPM_CLI, ...args], options);
}

function isAllowedPackagePath(packagePath) {
  return ["bin/", "schemas/", "src/"].some((prefix) => packagePath.startsWith(prefix)) ||
    ["LICENSE", "README.md", "SECURITY.md", "action.yml", "package.json"].includes(packagePath);
}

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "miniapp-packguard-consumer-"));
let tarballPath = null;

try {
  const packed = runNpm(["pack", "--json", "--ignore-scripts"], { cwd: ROOT });
  const metadata = JSON.parse(packed.stdout)[0];
  if (!metadata?.filename || !Array.isArray(metadata.files)) {
    throw new Error("npm pack did not return the expected JSON metadata");
  }

  tarballPath = path.join(ROOT, metadata.filename);
  const packagePaths = metadata.files.map((file) => String(file.path).replace(/\\/g, "/"));
  const unexpected = packagePaths.filter((packagePath) => !isAllowedPackagePath(packagePath));
  if (unexpected.length) {
    throw new Error(`unexpected files in npm package: ${unexpected.join(", ")}`);
  }

  const missing = [...REQUIRED_PACKAGE_PATHS].filter((packagePath) => !packagePaths.includes(packagePath));
  if (missing.length) {
    throw new Error(`required files missing from npm package: ${missing.join(", ")}`);
  }

  const consumerRoot = path.join(tempRoot, "consumer");
  await fs.mkdir(path.join(consumerRoot, "miniprogram", "images"), { recursive: true });
  await fs.writeFile(
    path.join(consumerRoot, "package.json"),
    `${JSON.stringify({ name: "packguard-packed-consumer", private: true, type: "module" }, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(consumerRoot, "miniprogram", "app.js"),
    "const icon = '/images/icon.svg';\nconsole.log(icon);\n",
  );
  await fs.writeFile(
    path.join(consumerRoot, "miniprogram", "images", "icon.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>\n',
  );
  await fs.writeFile(
    path.join(consumerRoot, "miniapp-packguard.config.json"),
    `${JSON.stringify({
      version: 1,
      root: "miniprogram",
      mode: "fs",
      budgets: {
        totalBytes: { limit: 1048576, severity: "error" },
        assetBytes: { limit: 524288, severity: "warning" },
        maxFileBytes: { limit: 262144, severity: "warning" },
        groups: []
      },
      duplicates: { enabled: true, scope: "assets", minBytes: 1, severity: "warning" },
      references: { enabled: true, severity: "warning", ignore: [] },
      failLevel: "error"
    }, null, 2)}\n`,
  );

  runNpm(["install", tarballPath, "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumerRoot
  });

  const installedCli = path.join(
    consumerRoot,
    "node_modules",
    "miniapp-packguard",
    "bin",
    "miniapp-packguard.mjs",
  );
  run(process.execPath, [
    installedCli,
    "audit",
    "--project-root",
    consumerRoot,
    "--config",
    "miniapp-packguard.config.json",
    "--report-dir",
    "reports",
    "--quiet"
  ], { cwd: consumerRoot });

  const report = JSON.parse(await fs.readFile(path.join(consumerRoot, "reports", "report.json"), "utf8"));
  if (!report.summary?.passed || report.tool?.name !== "miniapp-packguard") {
    throw new Error("installed CLI did not produce a passing PackGuard report");
  }

  run(process.execPath, [
    "--input-type=module",
    "--eval",
    "import { normalizeConfig } from 'miniapp-packguard'; const c = normalizeConfig({ version: 1, root: 'miniprogram', mode: 'fs' }); if (c.root !== 'miniprogram') process.exit(1);"
  ], { cwd: consumerRoot });

  process.stdout.write(
    `Packed-package consumer passed (${packagePaths.length} files, ${metadata.size} bytes).\n`,
  );
} finally {
  if (tarballPath) await fs.rm(tarballPath, { force: true });
  await fs.rm(tempRoot, { recursive: true, force: true });
}
