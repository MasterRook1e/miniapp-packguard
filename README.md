# MiniApp PackGuard

[![CI](https://github.com/MasterRook1e/miniapp-packguard/actions/workflows/ci.yml/badge.svg)](https://github.com/MasterRook1e/miniapp-packguard/actions/workflows/ci.yml)
[![Action smoke test](https://github.com/MasterRook1e/miniapp-packguard/actions/workflows/example.yml/badge.svg)](https://github.com/MasterRook1e/miniapp-packguard/actions/workflows/example.yml)
[![Self audit](https://github.com/MasterRook1e/miniapp-packguard/actions/workflows/self-audit.yml/badge.svg)](https://github.com/MasterRook1e/miniapp-packguard/actions/workflows/self-audit.yml)
[![Maintainer contracts](https://github.com/MasterRook1e/miniapp-packguard/actions/workflows/maintainer-contracts.yml/badge.svg)](https://github.com/MasterRook1e/miniapp-packguard/actions/workflows/maintainer-contracts.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A dependency-free Node.js CLI and GitHub Action for auditing mini-app packages before they become slow, oversized, fragile, or difficult to review.

It is designed for WeChat Mini Programs and similar directory-based mini-app bundles, but it does not depend on a proprietary compiler or one vendor's project format.

## What it checks

- total, text, asset, per-file, and custom-group byte budgets
- exact duplicate content using SHA-256
- assets that are not referenced by scanned source, template, style, or JSON files
- asset-like references that cannot be resolved
- case-insensitive path collisions
- Unicode NFC path collisions
- required package files
- growth against a committed baseline
- changed-file marking relative to a Git ref
- symlink boundary safety

Reports are deterministic and can be written as console text, JSON, Markdown, or SARIF 2.1.0.

## Why another package auditor?

Mini-app performance problems often come from several small repository hygiene failures rather than one large bug: duplicate images, forgotten assets, case-only filenames, a single unexpectedly large script, or gradual package growth that nobody notices in review.

PackGuard treats those as policy, not as an occasional manual cleanup task.

## Quick start

```bash
npm install --save-dev miniapp-packguard
npx miniapp-packguard init
npx miniapp-packguard audit
```

The generated configuration contains conservative example budgets. Replace them with limits that match your platform, release process, and package topology instead of assuming they are official vendor limits.

## Example configuration

```json
{
  "$schema": "./node_modules/miniapp-packguard/schemas/config.schema.json",
  "version": 1,
  "root": "miniprogram",
  "mode": "git",
  "budgets": {
    "totalBytes": { "limit": 2097152, "severity": "error" },
    "assetBytes": { "limit": 786432, "severity": "warning" },
    "maxFileBytes": { "limit": 262144, "severity": "warning" },
    "groups": [
      { "name": "scripts", "extensions": [".js", ".ts"], "limit": 786432, "severity": "error" }
    ]
  },
  "baseline": {
    "path": ".packguard-baseline.json",
    "maxTotalGrowthBytes": 131072,
    "maxTotalGrowthPercent": 10,
    "severity": "error"
  },
  "failLevel": "error"
}
```

## Baselines

Create or refresh a baseline after an intentional package review:

```bash
npx miniapp-packguard audit --write-baseline .packguard-baseline.json
```

Future audits compare total growth and optional per-file growth against that baseline. The baseline contains paths and byte counts, not source contents.

## Reports

```bash
npx miniapp-packguard audit --report-dir .packguard-reports
```

This writes:

- `report.json`
- `report.md`
- `report.sarif`

The SARIF report can be uploaded to GitHub Code Scanning.

## GitHub Action

```yaml
steps:
  - uses: actions/checkout@v4
  - uses: MasterRook1e/miniapp-packguard@v0
    with:
      root: miniprogram
      config: miniapp-packguard.config.json
      report-dir: .packguard-reports
  - if: always()
    uses: github/codeql-action/upload-sarif@v3
    with:
      sarif_file: .packguard-reports/report.sarif
```

The `v0` ref is the moving compatible major-version branch. Security-sensitive consumers may instead pin an immutable commit SHA.

## Git-tracked versus filesystem mode

`git` mode audits only tracked files, which matches what a pull request or release would actually ship. `fs` mode recursively scans the directory and is useful before a repository exists or for generated staging directories.

PackGuard never follows symlinks by default. When explicitly enabled, symlink targets must remain inside the configured package root.

## Library API

```js
import { auditProject, loadConfig } from "miniapp-packguard";

const loaded = await loadConfig({ projectRoot: process.cwd() });
const report = await auditProject(loaded);
console.log(report.summary);
```

## Exit codes

- `0`: passed at the configured failure level
- `1`: policy findings failed the audit
- `2`: configuration or runtime failure

## Release assurance

The repository tests both the source checkout and the exact npm tarball shape. `npm run verify` validates syntax and formatting, executes the unit suite and demo, checks the package manifest, packs an allowlisted tarball, installs it into a temporary clean consumer, runs the installed CLI, verifies its report, and imports the installed library API.

The same verification runs on Node.js 20 and 22 across Linux, Windows, and macOS. A checked-out composite-action smoke test, repository self-audit, and CodeQL analysis run independently. See [docs/RELEASE_ASSURANCE.md](docs/RELEASE_ASSURANCE.md) and [docs/SELF_AUDIT.md](docs/SELF_AUDIT.md) for the evidence boundaries.

## Design boundaries

PackGuard does not compile vendor templates, emulate devices, infer runtime reachability, or claim that a referenced asset is legally distributable. It audits repository/package structure and deterministic static evidence.

## Status

`0.1.1` repairs and hardens public self-auditing while retaining the zero-dependency CLI, JSON Schema, SARIF, composite GitHub Action, packed-tarball consumer validation, path-aware maintainer policy, and three-platform CI matrix. It has not yet been published to npm, and no third-party adoption or download count is claimed.

## License

MIT.
