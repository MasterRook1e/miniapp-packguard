import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { auditProject } from "../src/audit.mjs";
import { normalizeConfig } from "../src/config.mjs";
import { normalizeTopologyRoot, normalizeTopologyRoute } from "../src/topology.mjs";
import { createTempProject, removeTempProject } from "./helpers.mjs";

function config(overrides = {}) {
  return normalizeConfig({
    root: "miniprogram",
    mode: "fs",
    budgets: {
      totalBytes: 1000000,
      assetBytes: 1000000,
      maxFileBytes: 1000000,
      groups: []
    },
    duplicates: { enabled: false, minBytes: 1, severity: "warning" },
    references: { enabled: false, severity: "warning", ignore: [] },
    topology: {
      enabled: true,
      manifest: "app.json",
      requiredPageExtensions: [".wxml"],
      packageBudgets: []
    },
    ...overrides
  });
}

async function audit(root, auditConfig = config()) {
  return auditProject({
    projectRoot: root,
    scanRoot: path.join(root, "miniprogram"),
    config: auditConfig
  });
}

test("topology routes and roots normalize without escaping", () => {
  assert.equal(normalizeTopologyRoute("/pages/home/index.wxml"), "pages/home/index");
  assert.equal(normalizeTopologyRoute("pages/home/index.js"), "pages/home/index");
  assert.equal(normalizeTopologyRoot("feature/archive/"), "feature/archive");
  assert.equal(normalizeTopologyRoute("../private/page"), null);
  assert.equal(normalizeTopologyRoot("C:/private"), null);
});

test("audit reports deterministic main and subpackage metrics", async () => {
  const manifest = JSON.stringify({
    pages: ["pages/home/index"],
    subPackages: [{
      name: "feature-package",
      root: "feature",
      pages: ["pages/detail/index"]
    }],
    tabBar: {
      list: [{ pagePath: "pages/home/index", text: "Home" }]
    }
  }, null, 2);
  const root = await createTempProject({
    "miniprogram/app.json": `${manifest}\n`,
    "miniprogram/pages/home/index.wxml": "<view>home</view>\n",
    "miniprogram/pages/home/index.wxss": ".home {}\n",
    "miniprogram/images/logo.png": "main-image",
    "miniprogram/feature/pages/detail/index.wxml": "<view>detail</view>\n",
    "miniprogram/feature/images/detail.png": "subpackage-image"
  });

  try {
    const result = await audit(root);
    const topologyIssues = result.issues.filter((issue) =>
      issue.ruleId.startsWith("topology-") ||
      issue.ruleId.startsWith("budget-main-package") ||
      issue.ruleId.startsWith("budget-subpackage"));
    assert.deepEqual(topologyIssues, []);
    assert.equal(result.topology.enabled, true);
    assert.deepEqual(result.topology.routes, [
      "feature/pages/detail/index",
      "pages/home/index"
    ]);
    assert.deepEqual(result.topology.tabBarRoutes, ["pages/home/index"]);
    assert.equal(result.topology.mainPackage.pageCount, 1);
    assert.equal(result.topology.subpackages.length, 1);
    assert.equal(result.topology.subpackages[0].root, "feature");
    assert.deepEqual(result.topology.subpackages[0].pages, [
      "feature/pages/detail/index"
    ]);

    const expectedMainBytes = result.files
      .filter((file) => !file.path.startsWith("feature/"))
      .reduce((sum, file) => sum + file.size, 0);
    const expectedSubpackageBytes = result.files
      .filter((file) => file.path.startsWith("feature/"))
      .reduce((sum, file) => sum + file.size, 0);
    assert.equal(result.topology.mainPackage.totalBytes, expectedMainBytes);
    assert.equal(result.topology.subpackages[0].totalBytes, expectedSubpackageBytes);
  } finally {
    await removeTempProject(root);
  }
});

test("topology detects duplicate routes missing files overlapping roots and tab-bar drift", async () => {
  const root = await createTempProject({
    "miniprogram/app.json": `${JSON.stringify({
      pages: ["pages/home/index", "pages/home/index.wxml"],
      subpackages: [
        { root: "feature", pages: ["pages/missing/index"] },
        { root: "feature/nested", pages: [] }
      ],
      tabBar: { list: [{ pagePath: "pages/not-declared/index" }] }
    }, null, 2)}\n`
  });

  try {
    const result = await audit(root);
    const rules = new Set(result.issues.map((issue) => issue.ruleId));
    assert.equal(rules.has("topology-route-duplicate"), true);
    assert.equal(rules.has("topology-page-file-missing"), true);
    assert.equal(rules.has("topology-subpackage-root-overlap"), true);
    assert.equal(rules.has("topology-tabbar-route-missing"), true);
    assert.equal(result.summary.passed, false);
  } finally {
    await removeTempProject(root);
  }
});

test("topology enforces main subpackage and named package budgets", async () => {
  const root = await createTempProject({
    "miniprogram/app.json": `${JSON.stringify({
      pages: ["pages/home/index"],
      subPackages: [{ root: "feature", pages: ["pages/detail/index"] }]
    })}\n`,
    "miniprogram/pages/home/index.wxml": "home",
    "miniprogram/feature/pages/detail/index.wxml": "detail"
  });

  try {
    const result = await audit(root, config({
      topology: {
        enabled: true,
        manifest: "app.json",
        requiredPageExtensions: [".wxml"],
        mainPackageBytes: { limit: 1, severity: "error" },
        subpackageBytes: { limit: 1, severity: "error" },
        packageBudgets: [
          { name: "feature-tight", root: "feature", limit: 1, severity: "error" }
        ]
      }
    }));
    const rules = result.issues.map((issue) => issue.ruleId);
    assert.equal(rules.includes("budget-main-package"), true);
    assert.equal(rules.includes("budget-subpackage"), true);
    assert.equal(rules.includes("budget-package-feature-tight"), true);
  } finally {
    await removeTempProject(root);
  }
});

test("disabled topology is a no-op when no manifest exists", async () => {
  const root = await createTempProject({
    "miniprogram/app.js": "console.log('no topology');\n"
  });

  try {
    const result = await audit(root, config({ topology: { enabled: false } }));
    assert.equal(result.topology.enabled, false);
    assert.equal(result.topology.mainPackage, null);
    assert.equal(result.issues.some((issue) => issue.ruleId.startsWith("topology-")), false);
  } finally {
    await removeTempProject(root);
  }
});

test("invalid topology JSON fails closed", async () => {
  const root = await createTempProject({ "miniprogram/app.json": "{" });
  try {
    const result = await audit(root);
    assert.equal(
      result.issues.some((issue) => issue.ruleId === "topology-manifest-invalid"),
      true
    );
    assert.equal(result.summary.passed, false);
  } finally {
    await removeTempProject(root);
  }
});

test("topology configuration rejects boundary escapes and duplicate overrides", () => {
  assert.throws(
    () => config({ topology: { enabled: true, manifest: "../app.json" } }),
    /escapes the package root/
  );
  assert.throws(
    () => config({
      topology: {
        enabled: true,
        packageBudgets: [
          { name: "first", root: "feature", limit: 10 },
          { name: "second", root: "feature", limit: 20 }
        ]
      }
    }),
    /duplicate topology package budget root/
  );
});
