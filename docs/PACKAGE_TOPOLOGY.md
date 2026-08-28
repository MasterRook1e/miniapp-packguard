# Package topology audit

MiniApp PackGuard can validate an `app.json`-style package graph without invoking a
vendor compiler. The audit is deterministic, read-only, and optional.

## Enable it

```json
{
  "version": 1,
  "root": "miniprogram",
  "topology": {
    "enabled": true,
    "manifest": "app.json",
    "requiredPageExtensions": [".wxml"],
    "mainPackageBytes": { "limit": 2097152, "severity": "error" },
    "subpackageBytes": { "limit": 2097152, "severity": "error" },
    "packageBudgets": [
      {
        "name": "archive-package",
        "root": "packages/archive",
        "limit": 1048576,
        "severity": "warning"
      }
    ]
  }
}
```

The byte limits above are examples of repository policy. They are not presented as current
official limits for any vendor or deployment target.

## Manifest support

The analyzer reads:

- `pages`
- `subPackages`
- `subpackages`
- `tabBar.list[].pagePath`

Routes may include a common page-file extension; PackGuard normalizes it away before
comparison. Absolute paths, drive-letter paths, NUL bytes, and parent-directory traversal
are rejected.

## Structural checks

The topology audit reports:

- missing or invalid manifest JSON
- invalid `pages`, subpackage, or tab-bar shapes
- invalid or duplicate routes
- duplicate subpackage roots
- overlapping subpackage roots
- declared pages missing required files
- tab-bar routes that are not declared pages
- named budgets that reference undeclared package roots

Nested subpackage roots are rejected because they make file ownership and byte attribution
ambiguous. A file belongs to a subpackage when its path is under that declared root;
remaining selected files belong to the main package.

## Required page files

`requiredPageExtensions` defines the static files that must exist for every declared route.
For example:

```json
{
  "requiredPageExtensions": [".wxml", ".wxss"]
}
```

An empty array validates declarations and package ownership without imposing a page-file
convention. PackGuard does not assume that every framework requires JavaScript beside a
page template.

## Budgets

Three layers are available:

1. `mainPackageBytes` applies to the main package.
2. `subpackageBytes` applies independently to every declared subpackage.
3. `packageBudgets` applies a named override to one exact root. Use an empty root for the
   main package.

Package metrics include total, text, asset, and other bytes plus route and file counts.
They are included in JSON output and rendered as a package table in Markdown reports.

## Determinism and boundaries

The analyzer uses the already selected PackGuard inventory, so include/exclude policy and
Git-versus-filesystem mode remain authoritative. Package roots, pages, findings, and report
rows are sorted. The manifest path and configured package roots must remain inside the
configured package root.

## Non-goals

The topology audit does not:

- compile templates or styles
- execute application code
- resolve framework plugins
- emulate a device or runtime
- prove that a platform will accept the package
- infer lazy-loading or runtime reachability

It verifies static declarations, file ownership, required page files, and repository-defined
budgets before a vendor build step runs.
