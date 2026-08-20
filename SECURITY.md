# Security Policy

MiniApp PackGuard reads repository files and may run `git` commands in the configured project root. Treat configuration and scanned repositories as code-level inputs.

## Supported versions

Security fixes are applied to the latest minor release until a broader support policy is published.

## Reporting

Do not include private source files, credentials, or proprietary assets in a public issue. Report sensitive vulnerabilities privately through GitHub's security advisory flow when available.

## Security properties

- path resolution is constrained to the project/package boundary
- symlinks are not followed by default
- reports contain metadata and findings, not file contents
- no network requests are made
- no package source is executed
- subprocess use is limited to argument-array `git` invocations without a shell

These properties reduce risk but do not make the tool a sandbox for hostile repositories.
