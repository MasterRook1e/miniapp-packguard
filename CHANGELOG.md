# Changelog

## Unreleased

- added optional `app.json`-style package topology analysis
- added main-package, per-subpackage, and named package-root byte budgets
- added route normalization, duplicate-route detection, required page-file checks, and tab-bar validation
- added duplicate and overlapping subpackage-root detection with deterministic file ownership
- added package metrics to JSON, console, and Markdown reports
- exported the topology analyzer and normalization helpers through the public library API
- added focused topology regressions, configuration-boundary tests, demo coverage, and packed-consumer coverage

## 0.1.1

- repaired and hardened the repository's self-audit workflow
- replaced a non-existent CLI flag with the supported deterministic report outputs
- added a schema-valid repository policy with package budgets, required files, collision checks, duplicate detection, and artifact retention
- documented why synthetic reference fixtures are verified by tests rather than the repository-wide reference graph
- removed temporary bootstrap transport data and duplicate issue forms
- retained clean packed-tarball consumer verification on every supported CI platform

## 0.1.0

- initial dependency-free CLI and library API
- Git index and filesystem discovery modes
- size budgets and custom extension/path groups
- static asset reference graph
- SHA-256 duplicate detection
- case and Unicode path collision checks
- baseline growth policies
- console, JSON, Markdown, and SARIF output
- composite GitHub Action and three-platform CI
