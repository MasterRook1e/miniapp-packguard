# Adoption and dogfooding evidence

This document records only public, verifiable usage and deliberately separates maintainer-owned integrations from independent third-party adoption.

## Current public integrations

| Repository | Integration | Relationship |
|---|---|---|
| `MasterRook1e/miniapp-packguard` | Audits its own tracked repository with `.github/packguard.self.json`, publishes Markdown evidence to the job summary, and retains JSON, Markdown, and SARIF reports as an artifact. | Self-dogfooding |
| `MasterRook1e/miniapp-packguard` | Uses `MasterRook1e/maintainer-contracts` to enforce review evidence for public API, CI, action, and input-boundary changes. | Same maintainer; cross-repository dogfooding |

## Evidence boundary

The repository self-audit verifies package budgets, required public files, duplicate assets, path collisions, and symlink boundaries. Reference extraction is tested separately because the source tree intentionally contains synthetic unresolved-reference fixtures.

## What is not claimed

- no independent third-party user is claimed
- no npm download count is claimed because the package has not been published
- stars, forks, and repository views are not described as product adoption
- private projects are not counted as public usage evidence

## Adding independent evidence

An independent integration should identify a public repository, an exact workflow or configuration path, the version or immutable commit used, and the relationship to the maintainer. Private screenshots and unverifiable usage statements are not accepted.
