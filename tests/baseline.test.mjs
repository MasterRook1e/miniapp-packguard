import test from "node:test";
import assert from "node:assert/strict";
import { compareBaseline, createBaseline, readBaseline, writeBaseline } from "../src/baseline.mjs";

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

const growthPolicy = { maxTotalGrowthBytes: 20, maxTotalGrowthPercent: 20, maxFileGrowthBytes: 10, severity: "error" };

test("baseline rejects malformed evidence rather than silently passing growth checks", () => {
  const corruptions = [
    (b) => { b.metrics.totalBytes = "100"; },
    (b) => { b.metrics.totalBytes = Infinity; },
    (b) => { b.metrics.totalBytes = Number.MAX_SAFE_INTEGER + 1; },
    (b) => { b.files["app.js"] = -1; },
    (b) => { b.files["app.js"] = NaN; },
    (b) => { b.files["app.js"] = "80"; },
    (b) => { b.files["app.js"] = 0.5; },
    (b) => { b.metrics.totalBytes = 101; },
    (b) => { b.metrics.fileCount = 3; },
    (b) => { b.metrics.assetBytes = 21; },
    (b) => { b.metrics.groups = []; },
    (b) => { b.metrics.groups = { images: -10 }; },
    (b) => { b.files = []; },
    (b) => { b.schemaVersion = 999; },
    (b) => { b.root = "../elsewhere"; }
  ];
  for (const corrupt of corruptions) {
    const baseline = createBaseline(baseResult);
    corrupt(baseline);
    assert.throws(() => compareBaseline(baseResult, baseline, growthPolicy), /baseline/);
  }
  assert.throws(() => compareBaseline(baseResult, {}, growthPolicy), /baseline/);
});

test("baseline cannot be reused for a different package root", () => {
  assert.throws(() => compareBaseline({ ...baseResult, root: "other-app" }, createBaseline(baseResult), growthPolicy), /root/);
});

test("baseline rejects unsafe or ambiguous inventory paths", () => {
  for (const bad of ["../app.js", "/app.js", "a/../app.js", "./app.js", "a//app.js", "C:/app.js", "a\\app.js", "a\0app.js"]) {
    const baseline = createBaseline(baseResult);
    delete baseline.files["app.js"];
    baseline.files[bad] = 80;
    assert.throws(() => compareBaseline(baseResult, baseline, growthPolicy), /paths/);
  }
});

test("a zero-byte baseline has explicit growth semantics", () => {
  const empty = { ...baseResult, metrics: { totalBytes: 0, textBytes: 0, assetBytes: 0, otherBytes: 0, fileCount: 0, groups: {} }, files: [] };
  const baseline = createBaseline(empty);
  assert.equal(compareBaseline(empty, baseline, growthPolicy).length, 0);
  assert.equal(compareBaseline(baseResult, baseline, growthPolicy).some((issue) => issue.ruleId === "baseline-total-growth-percent"), true);
});

test("baseline treats prototype-like filenames as ordinary own inventory keys", () => {
  const result = { ...baseResult, metrics: { totalBytes: 9, textBytes: 9, assetBytes: 0, otherBytes: 0, fileCount: 2, groups: {} }, files: [{ path: "__proto__", size: 4 }, { path: "constructor", size: 5 }] };
  const baseline = createBaseline(result);
  assert.equal(Object.hasOwn(baseline.files, "__proto__"), true);
  assert.deepEqual(compareBaseline(result, baseline, growthPolicy), []);
});

test("baseline I/O distinguishes no policy, missing evidence, invalid JSON and a valid roundtrip", async (t) => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "packguard-baseline-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  assert.equal(await readBaseline(root, null), null);
  await assert.rejects(readBaseline(root, "missing.json"), /configured baseline is missing/);
  const file = path.join(root, "baseline.json");
  await fs.writeFile(file, "{");
  await assert.rejects(readBaseline(root, "baseline.json"), SyntaxError);
  await fs.writeFile(file, JSON.stringify({ schemaVersion: 1 }));
  await assert.rejects(readBaseline(root, "baseline.json"), /invalid baseline/);
  await writeBaseline(file, baseResult);
  const loaded = await readBaseline(root, "baseline.json");
  assert.deepEqual(loaded.baseline, createBaseline(baseResult));
});
