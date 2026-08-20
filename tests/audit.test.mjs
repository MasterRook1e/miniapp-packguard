import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { auditProject } from "../src/audit.mjs";
import { normalizeConfig } from "../src/config.mjs";
import { createTempProject, removeTempProject } from "./helpers.mjs";

function config(overrides = {}) {
  return normalizeConfig({
    root: "miniprogram",
    mode: "fs",
    budgets: { totalBytes: 100000, assetBytes: 100000, maxFileBytes: 100000, groups: [] },
    duplicates: { enabled: true, minBytes: 1, severity: "warning" },
    references: { enabled: true, severity: "warning", ignore: [] },
    ...overrides
  });
}

test("audit recognizes referenced assets and passes", async () => {
  const root = await createTempProject({
    "miniprogram/app.js": "const icon = '/images/icon.png';\n",
    "miniprogram/images/icon.png": "image-bytes"
  });
  try {
    const result = await auditProject({ projectRoot: root, scanRoot: path.join(root, "miniprogram"), config: config() });
    assert.equal(result.summary.passed, true);
    assert.equal(result.references.unreferencedAssets.length, 0);
    assert.equal(result.metrics.assetCount, 1);
  } finally {
    await removeTempProject(root);
  }
});

test("audit reports duplicate and unreferenced assets", async () => {
  const root = await createTempProject({
    "miniprogram/app.js": "console.log('ok');\n",
    "miniprogram/images/a.png": "same",
    "miniprogram/images/b.png": "same"
  });
  try {
    const result = await auditProject({ projectRoot: root, scanRoot: path.join(root, "miniprogram"), config: config() });
    assert.equal(result.issues.filter((issue) => issue.ruleId === "duplicate-content").length, 1);
    assert.equal(result.issues.filter((issue) => issue.ruleId === "asset-unreferenced").length, 2);
  } finally {
    await removeTempProject(root);
  }
});

test("budget violations fail at configured severity", async () => {
  const root = await createTempProject({ "miniprogram/app.js": "x".repeat(20) });
  try {
    const result = await auditProject({
      projectRoot: root,
      scanRoot: path.join(root, "miniprogram"),
      config: config({ budgets: { totalBytes: { limit: 10, severity: "error" }, groups: [] } })
    });
    assert.equal(result.summary.passed, false);
    assert.equal(result.issues.some((issue) => issue.ruleId === "budget-total"), true);
  } finally {
    await removeTempProject(root);
  }
});
