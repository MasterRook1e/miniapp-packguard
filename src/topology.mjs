import fs from "node:fs/promises";
import path from "node:path";
import { assertInside, makeIssue, normalizeRelative, toPosix } from "./util.mjs";

const ROUTE_FILE_EXTENSION = /\.(?:js|json|wxml|wxss|html|css|ts)$/i;

function unsafePath(value) {
  const normalized = toPosix(value);
  return /^[A-Za-z]:/.test(normalized) ||
    normalized.split("/").some((segment) => segment === "..");
}

export function normalizeTopologyRoute(value) {
  if (typeof value !== "string") return null;
  const raw = toPosix(value.trim()).replace(/^\/+/, "");
  if (!raw || raw.includes("\0") || unsafePath(raw)) return null;
  const normalized = normalizeRelative(raw);
  if (!normalized ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      path.posix.isAbsolute(normalized)) {
    return null;
  }
  return normalized.replace(ROUTE_FILE_EXTENSION, "");
}

export function normalizeTopologyRoot(value) {
  if (typeof value !== "string") return null;
  const raw = toPosix(value.trim()).replace(/^\/+|\/+$/g, "");
  if (!raw || raw.includes("\0") || unsafePath(raw)) return null;
  const normalized = normalizeRelative(raw).replace(/\/+$/g, "");
  if (!normalized ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      path.posix.isAbsolute(normalized)) {
    return null;
  }
  return normalized;
}

function measurePackage(name, root, pages, files) {
  return {
    name,
    root,
    pages: [...pages].sort((left, right) => left.localeCompare(right, "en")),
    pageCount: pages.length,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    textBytes: files
      .filter((file) => file.kind === "text")
      .reduce((sum, file) => sum + file.size, 0),
    assetBytes: files
      .filter((file) => file.kind === "asset")
      .reduce((sum, file) => sum + file.size, 0),
    otherBytes: files
      .filter((file) => file.kind === "other")
      .reduce((sum, file) => sum + file.size, 0)
  };
}

function makeBudgetIssue(ruleId, packageInfo, budget) {
  if (!budget || packageInfo.totalBytes <= budget.limit) return null;
  return makeIssue({
    ruleId,
    severity: budget.severity,
    path: packageInfo.root || null,
    message: `${packageInfo.name} is ${packageInfo.totalBytes} bytes; limit is ${budget.limit} bytes.`,
    details: {
      package: packageInfo.name,
      root: packageInfo.root,
      actual: packageInfo.totalBytes,
      limit: budget.limit,
      excess: packageInfo.totalBytes - budget.limit
    }
  });
}

function createEmptyReport(config) {
  return {
    enabled: Boolean(config.topology.enabled),
    manifest: config.topology.manifest,
    mainPackage: null,
    subpackages: [],
    routes: [],
    tabBarRoutes: []
  };
}

function addIssue(issues, config, input) {
  issues.push(makeIssue({ severity: config.topology.severity, ...input }));
}

export async function analyzePackageTopology({ scanRoot, files, config }) {
  const report = createEmptyReport(config);
  const issues = [];
  if (!config.topology.enabled) return { report, issues };

  const manifestPath = path.resolve(scanRoot, config.topology.manifest);
  assertInside(scanRoot, manifestPath, "topology manifest");

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    const missing = error?.code === "ENOENT";
    addIssue(issues, config, {
      ruleId: missing ? "topology-manifest-missing" : "topology-manifest-invalid",
      path: config.topology.manifest,
      message: missing
        ? "Package topology manifest is missing."
        : `Package topology manifest is not valid JSON: ${error.message}`
    });
    return { report, issues };
  }

  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    addIssue(issues, config, {
      ruleId: "topology-manifest-invalid",
      path: config.topology.manifest,
      message: "Package topology manifest must contain a JSON object."
    });
    return { report, issues };
  }

  const fileSet = new Set(files.map((file) => file.relativePath));
  const declarations = [];
  const mainPages = [];
  const packagesByRoot = new Map();

  const declareRoute = (value, packageRoot, packageName, declarationPath) => {
    const page = normalizeTopologyRoute(value);
    if (!page) {
      addIssue(issues, config, {
        ruleId: "topology-route-invalid",
        path: config.topology.manifest,
        message: `Invalid page route at ${declarationPath}.`,
        details: { declaration: declarationPath, value }
      });
      return null;
    }

    const route = packageRoot
      ? normalizeTopologyRoute(`${packageRoot}/${page}`)
      : page;
    if (!route) {
      addIssue(issues, config, {
        ruleId: "topology-route-invalid",
        path: config.topology.manifest,
        message: `Page route escapes its package at ${declarationPath}.`,
        details: { declaration: declarationPath, packageRoot, value }
      });
      return null;
    }

    declarations.push({ route, packageRoot, packageName, declarationPath });
    if (!packageRoot) mainPages.push(route);
    return route;
  };

  if (!Array.isArray(manifest.pages)) {
    addIssue(issues, config, {
      ruleId: "topology-pages-invalid",
      path: config.topology.manifest,
      message: "Manifest pages must be an array."
    });
  } else {
    manifest.pages.forEach((page, index) => {
      declareRoute(page, "", "main", `pages[${index}]`);
    });
  }

  const rawSubpackages = [
    ...(Array.isArray(manifest.subPackages) ? manifest.subPackages : []),
    ...(Array.isArray(manifest.subpackages) ? manifest.subpackages : [])
  ];

  rawSubpackages.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      addIssue(issues, config, {
        ruleId: "topology-subpackage-invalid",
        path: config.topology.manifest,
        message: `Subpackage declaration ${index} must be an object.`
      });
      return;
    }

    const root = normalizeTopologyRoot(entry.root);
    if (!root) {
      addIssue(issues, config, {
        ruleId: "topology-subpackage-root-invalid",
        path: config.topology.manifest,
        message: `Subpackage declaration ${index} has an invalid root.`,
        details: { index, value: entry.root }
      });
      return;
    }

    let definition = packagesByRoot.get(root);
    if (definition) {
      addIssue(issues, config, {
        ruleId: "topology-subpackage-root-duplicate",
        path: root,
        message: `Subpackage root is declared more than once: ${root}.`,
        details: { firstIndex: definition.index, duplicateIndex: index }
      });
    } else {
      definition = {
        index,
        name: entry.name ? String(entry.name) : root,
        root,
        pages: []
      };
      packagesByRoot.set(root, definition);
    }

    if (!Array.isArray(entry.pages)) {
      addIssue(issues, config, {
        ruleId: "topology-subpackage-pages-invalid",
        path: root,
        message: `Subpackage ${root} pages must be an array.`
      });
      return;
    }

    entry.pages.forEach((page, pageIndex) => {
      const route = declareRoute(
        page,
        root,
        definition.name,
        `subpackages[${index}].pages[${pageIndex}]`);
      if (route) definition.pages.push(route);
    });
  });

  const roots = [...packagesByRoot.keys()].sort((left, right) =>
    left.localeCompare(right, "en"));
  for (let first = 0; first < roots.length; first += 1) {
    for (let second = first + 1; second < roots.length; second += 1) {
      if (roots[second].startsWith(`${roots[first]}/`)) {
        addIssue(issues, config, {
          ruleId: "topology-subpackage-root-overlap",
          path: roots[second],
          message: `Subpackage roots overlap: ${roots[first]} and ${roots[second]}.`,
          details: { roots: [roots[first], roots[second]] }
        });
      }
    }
  }

  const declarationsByRoute = new Map();
  for (const declaration of declarations) {
    const group = declarationsByRoute.get(declaration.route) || [];
    group.push(declaration);
    declarationsByRoute.set(declaration.route, group);
  }

  for (const [route, group] of declarationsByRoute) {
    if (group.length > 1) {
      addIssue(issues, config, {
        ruleId: "topology-route-duplicate",
        path: route,
        message: `Page route is declared more than once: ${route}.`,
        details: { declarations: group.map((entry) => entry.declarationPath) }
      });
    }

    for (const extension of config.topology.requiredPageExtensions) {
      const requiredPath = `${route}${extension}`;
      if (!fileSet.has(requiredPath)) {
        addIssue(issues, config, {
          ruleId: "topology-page-file-missing",
          path: requiredPath,
          message: `Declared page route is missing required file ${requiredPath}.`,
          details: { route, extension }
        });
      }
    }
  }

  const routes = [...declarationsByRoute.keys()].sort((left, right) =>
    left.localeCompare(right, "en"));
  const routeSet = new Set(routes);
  const tabBarRoutes = [];
  if (manifest.tabBar?.list !== undefined && !Array.isArray(manifest.tabBar.list)) {
    addIssue(issues, config, {
      ruleId: "topology-tabbar-invalid",
      path: config.topology.manifest,
      message: "tabBar.list must be an array when present."
    });
  } else {
    for (const [index, item] of (manifest.tabBar?.list || []).entries()) {
      const route = normalizeTopologyRoute(item?.pagePath);
      if (!route) {
        addIssue(issues, config, {
          ruleId: "topology-tabbar-route-invalid",
          path: config.topology.manifest,
          message: `tabBar.list[${index}].pagePath is invalid.`
        });
        continue;
      }
      tabBarRoutes.push(route);
      if (!routeSet.has(route)) {
        addIssue(issues, config, {
          ruleId: "topology-tabbar-route-missing",
          path: route,
          message: `Tab-bar route is not declared as a page: ${route}.`
        });
      }
    }
  }

  const rootsBySpecificity = [...roots].sort((left, right) =>
    right.length - left.length || left.localeCompare(right, "en"));
  const filesByRoot = new Map(roots.map((root) => [root, []]));
  const mainFiles = [];
  for (const file of files) {
    const root = rootsBySpecificity.find((candidate) =>
      file.relativePath === candidate ||
      file.relativePath.startsWith(`${candidate}/`));
    if (root) filesByRoot.get(root).push(file);
    else mainFiles.push(file);
  }

  report.mainPackage = measurePackage("main", "", mainPages, mainFiles);
  report.subpackages = roots
    .map((root) => {
      const definition = packagesByRoot.get(root);
      return measurePackage(
        definition.name,
        root,
        definition.pages,
        filesByRoot.get(root));
    });
  report.routes = routes;
  report.tabBarRoutes = [...new Set(tabBarRoutes)].sort((left, right) =>
    left.localeCompare(right, "en"));

  const mainBudgetIssue = makeBudgetIssue(
    "budget-main-package",
    report.mainPackage,
    config.topology.mainPackageBytes);
  if (mainBudgetIssue) issues.push(mainBudgetIssue);

  for (const packageInfo of report.subpackages) {
    const issue = makeBudgetIssue(
      "budget-subpackage",
      packageInfo,
      config.topology.subpackageBytes);
    if (issue) issues.push(issue);
  }

  for (const override of config.topology.packageBudgets) {
    const packageInfo = override.root === ""
      ? report.mainPackage
      : report.subpackages.find((entry) => entry.root === override.root);
    if (!packageInfo) {
      issues.push(makeIssue({
        ruleId: "topology-package-budget-root-missing",
        severity: override.budget.severity,
        path: override.root || config.topology.manifest,
        message: `Package budget references an undeclared root: ${override.root || "main"}.`
      }));
      continue;
    }
    const issue = makeBudgetIssue(
      `budget-package-${override.name}`,
      packageInfo,
      override.budget);
    if (issue) issues.push(issue);
  }

  issues.sort((left, right) =>
    (left.path || "").localeCompare(right.path || "", "en") ||
    left.ruleId.localeCompare(right.ruleId, "en") ||
    left.message.localeCompare(right.message, "en"));
  return { report, issues };
}
