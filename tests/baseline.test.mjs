import test from "node:test";
import assert from "node:assert/strict";
import { compareBaseline, createBaseline } from "../src/baseline.mjs";

const baseResult = {
  tool: { name: "miniapp-packguard", version: "0.1.0" },
  root: "miniprogram",
  metrics: { totalBytes: 100, textBytes: 80, assetBytes: 20, otherBytes: 0, fileCount: 2, groups: {} },
  files: [{ path: "app.js", size: 80 }, { path: "icon.png", size: 20 }]
};

test("baseline captures deterministic file sizes", () => {
  const baseline = createBaseline(baseResult);
  assert.equal(baseline.files["app.js"], 80);
  assert.equal(baseline.metrics.totalBytes, 100);
});

test("baseline comparison detects total and file growth", () => {
  const baseline = createBaseline(baseResult);
  const current = {
    ...baseResult,
    metrics: { ...baseResult.metrics, totalBytes: 150 },
    files: [{ path: "app.js", size: 130 }, { path: "icon.png", size: 20 }]
  };
  const issues = compareBaseline(current, baseline, {
    maxTotalGrowthBytes: 20,
    maxTotalGrowthPercent: 20,
    maxFileGrowthBytes: 10,
    severity: "error"
  });
  assert.deepEqual(new Set(issues.map((issue) => issue.ruleId)), new Set([
    "baseline-total-growth-bytes",
    "baseline-total-growth-percent",
    "baseline-file-growth"
  ]));
});
