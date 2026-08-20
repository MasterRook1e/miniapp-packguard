# Repository self-audit

MiniApp PackGuard audits its own tracked repository on every push to `main` and every pull request.

The self policy checks:

- total repository and maximum single-file budgets
- independent runtime and test/fixture budgets
- required public package files
- SHA-256 duplicate assets
- case-insensitive and Unicode NFC path collisions
- symlink boundary safety

The workflow writes JSON, Markdown, and SARIF reports to `.packguard-self/`, publishes the Markdown report to the job summary, and retains the report directory as a workflow artifact.

## Why reference extraction is disabled for this one audit

The repository contains test fixtures and source strings that intentionally model missing or unresolved asset references. A whole-repository reference graph would treat those test cases as production defects. The self policy therefore disables reference extraction while focused tests continue to validate both resolved and unresolved-reference behavior.

This is an explicit evidence boundary, not a claim that one self-audit covers every feature.
