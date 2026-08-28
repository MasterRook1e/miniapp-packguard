import test from "node:test";
import assert from "node:assert/strict";
import { renderConsole, renderMarkdown, renderSarif } from "../src/reporters.mjs";

const result = {
  tool: { name: "miniapp-packguard", version: "0.1.1" },
  root: "miniprogram",
  mode: "fs",
  metrics: { fileCount: 1, totalBytes: 10, textBytes: 10, assetBytes: 0 },
  summary: { passed: false, errors: 1, warnings: 0, notes: 0 },
  issues: [{ ruleId: "budget-total", severity: "error", path: "app.js", message: "Too large", fingerprint: "abc", details: {} }],
  largestFiles: [{ path: "app.js", size: 10 }]
};

const topologyResult = {
  ...result,
  topology: {
    enabled: true,
    routes: ["feature/pages/detail/index", "pages/home/index"],
    tabBarRoutes: ["pages/home/index"],
    mainPackage: {
      name: "main",
      root: "",
      pageCount: 1,
      fileCount: 3,
      totalBytes: 100,
      textBytes: 80,
      assetBytes: 20,
      otherBytes: 0
    },
    subpackages: [{
      name: "feature",
      root: "feature",
      pageCount: 1,
      fileCount: 2,
      totalBytes: 50,
      textBytes: 40,
      assetBytes: 10,
      otherBytes: 0
    }]
  }
};

test("markdown reporter contains findings", () => {
  const markdown = renderMarkdown(result);
  assert.match(markdown, /budget-total/);
  assert.match(markdown, /FAIL/);
});

test("console and Markdown reporters contain package topology", () => {
  assert.match(renderConsole(topologyResult), /Subpackages: 1/);
  const markdown = renderMarkdown(topologyResult);
  assert.match(markdown, /Package topology/);
  assert.match(markdown, /`feature`/);
  assert.match(markdown, /Declared routes: 2/);
});

test("SARIF reporter emits version 2.1.0", () => {
  const sarif = JSON.parse(renderSarif(result));
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results[0].ruleId, "budget-total");
});
