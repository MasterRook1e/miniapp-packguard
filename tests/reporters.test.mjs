import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown, renderSarif } from "../src/reporters.mjs";

const result = {
  tool: { name: "miniapp-packguard", version: "0.1.0" },
  root: "miniprogram",
  mode: "fs",
  metrics: { fileCount: 1, totalBytes: 10, textBytes: 10, assetBytes: 0 },
  summary: { passed: false, errors: 1, warnings: 0, notes: 0 },
  issues: [{ ruleId: "budget-total", severity: "error", path: "app.js", message: "Too large", fingerprint: "abc", details: {} }],
  largestFiles: [{ path: "app.js", size: 10 }]
};

test("markdown reporter contains findings", () => {
  const markdown = renderMarkdown(result);
  assert.match(markdown, /budget-total/);
  assert.match(markdown, /FAIL/);
});

test("SARIF reporter emits version 2.1.0", () => {
  const sarif = JSON.parse(renderSarif(result));
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results[0].ruleId, "budget-total");
});
