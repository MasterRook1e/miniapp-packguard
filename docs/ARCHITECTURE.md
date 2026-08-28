# Architecture

MiniApp PackGuard separates discovery, evidence extraction, policy evaluation, and reporting.

```text
Git index or filesystem
        |
        v
 deterministic file inventory
        |
        +--> metrics and custom budget groups
        +--> package topology and per-package budgets
        +--> SHA-256 duplicate groups
        +--> path collision analysis
        +--> static asset-reference graph
        +--> baseline comparison
        |
        v
 normalized findings
        |
        +--> console
        +--> JSON
        +--> Markdown
        +--> SARIF
```

## Trust boundary

The project root is the outer trust boundary and the configured package root is the scanning boundary. Absolute path resolution is validated before reading. Symlinks are skipped unless explicitly enabled, and enabled symlinks must resolve inside the package root.

The optional topology manifest and every configured package-budget root must also remain inside the package root. Route declarations are normalized as POSIX-style relative paths and parent traversal is rejected before file matching.

## Determinism

File paths, package roots, routes, groups, findings, duplicate groups, and reports are sorted. Finding fingerprints are SHA-256 digests over stable rule and location inputs. Timestamps are the only intentionally varying report field.

## Package topology

The topology analyzer parses an `app.json`-style manifest without running project code. It maps selected files to the main package or one declared subpackage, validates page and tab-bar declarations, checks required page files, and applies main, per-subpackage, and named-root budgets.

Overlapping roots are rejected because they make byte ownership ambiguous. The resulting package graph is report evidence; it does not emulate a platform compiler. See [Package topology audit](PACKAGE_TOPOLOGY.md).

## Reference graph

The reference scanner recognizes CSS `url(...)`, common markup attributes, quoted paths ending in configured asset extensions, and optional user regexes. It resolves absolute package paths, source-relative paths, and configured aliases. It deliberately does not execute application code.

## Extension points

The public API exposes normalized configuration, file discovery, topology analysis, reference analysis, baseline functions, the audit engine, and all reporters. New extractors should consume the deterministic inventory and emit normalized evidence without weakening the package-root boundary.
