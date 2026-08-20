# Release assurance

MiniApp PackGuard separates source-tree confidence, installable-package confidence, GitHub Action confidence, and real-world adoption. Passing one layer is not represented as proof of another.

## Automated evidence

### Source checkout

`npm run lint`, the Node.js unit suite, and the deterministic demo smoke test run on Node.js 20 and 22 across Linux, Windows, and macOS.

### Installable npm tarball

`npm run pack:test`:

1. creates the exact tarball with `npm pack --json --ignore-scripts`
2. rejects files outside the public package allowlist
3. requires the CLI, library entry point, schema, action metadata, license, security policy, and README
4. installs the local tarball into a temporary clean consumer with lifecycle scripts and audit calls disabled
5. runs the installed CLI against a synthetic mini-app
6. verifies the generated JSON report
7. imports the installed library API from the consumer
8. removes the tarball and temporary project

This catches missing exports, accidental package contents, platform-specific command behavior, and differences between a repository checkout and the published package shape.

### Composite GitHub Action

The action smoke workflow runs `uses: ./` against `examples/demo`, then verifies that JSON, Markdown, and SARIF reports were written. This validates the checked-out composite action without relying on a pre-existing release ref.

### Static security analysis and review evidence

CodeQL analyzes the JavaScript source. Maintainer Contracts evaluates pull-request descriptions, changed paths, validation evidence, and input-boundary changes with read-only GitHub permissions.

## Release refs

`v0` is a moving compatible major-version branch for GitHub Action consumers. Immutable version tags and GitHub Releases should be created only from a commit whose CI, action smoke test, CodeQL, package consumer, and release checklist all pass.

## Not yet claimed

The repository does not currently claim:

- an npm publication or monthly download count
- independent third-party integration
- a signed or provenance-attested npm release
- an immutable `v0.1.0` Git tag or GitHub Release created by this automation
- vendor certification or official mini-app package limits

These are release/adoption milestones, not properties that can be inferred from source quality alone.

## First public release checklist

- confirm all required checks pass on the exact release commit
- inspect the `npm pack --json` allowlist and record the tarball SHA-256
- configure npm publishing with account protection and trusted provenance where available
- create an immutable version tag and GitHub Release
- move the compatible `v0` ref only after the immutable release is verified
- publish exact install and rollback instructions
- record only verifiable download or integration evidence
