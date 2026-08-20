# Changelog

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
