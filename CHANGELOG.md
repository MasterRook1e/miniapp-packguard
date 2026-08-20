# Changelog

## Unreleased

- Added a clean packed-tarball consumer test that validates the npm file allowlist,
  installs the generated package into a temporary project, runs the installed CLI, and
  imports the installed library API on every supported CI platform.

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
