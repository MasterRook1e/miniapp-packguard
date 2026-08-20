import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createTempProject, removeTempProject } from "./helpers.mjs";

const CLI = path.resolve("bin/miniapp-packguard.mjs");

test("init writes a valid config", async () => {
  const root = await createTempProject({});
  try {
    const run = spawnSync(process.execPath, [CLI, "init", "--project-root", root], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const config = JSON.parse(await fs.readFile(path.join(root, "miniapp-packguard.config.json"), "utf8"));
    assert.equal(config.version, 1);
  } finally {
    await removeTempProject(root);
  }
});

test("CLI returns one on policy failure", async () => {
  const root = await createTempProject({
    "miniprogram/app.js": "x".repeat(50),
    "miniapp-packguard.config.json": JSON.stringify({ version: 1, root: "miniprogram", mode: "fs", budgets: { totalBytes: 10, groups: [] } })
  });
  try {
    const run = spawnSync(process.execPath, [CLI, "audit", "--project-root", root, "--format", "json"], { encoding: "utf8" });
    assert.equal(run.status, 1);
    assert.equal(JSON.parse(run.stdout).summary.passed, false);
  } finally {
    await removeTempProject(root);
  }
});
