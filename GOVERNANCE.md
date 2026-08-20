# Governance

MiniApp PackGuard is currently maintained by `@MasterRook1e` under a lightweight maintainer model.

## Decisions

Small fixes are accepted through reviewed pull requests. Changes to report schemas, CLI flags, security boundaries, or failure semantics require an issue describing compatibility impact before implementation. Backward-incompatible behavior is reserved for major releases.

## Triage

New issues are classified as bug, enhancement, documentation, security, or support. Reproducible correctness and security defects take priority over new features. Requests tied to one private product are redirected toward a generic extension point.

## Releases

A release requires a clean cross-platform CI matrix, passing package smoke test, updated changelog, reviewed public-boundary scan, and a versioned tag. Published measurements must identify the fixture, platform, and command used.

## Maintainer succession

Consistent contributors may receive triage or review responsibility after demonstrating sound technical judgment and respect for the project's framework-neutral boundary.
