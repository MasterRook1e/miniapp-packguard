# Architecture

MiniApp PackGuard separates discovery, evidence extraction, policy evaluation, and reporting.

```text
Git index or filesystem
        |
        v
 deterministic file inventory
        |
        +--> metrics and custom budget groups
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

## Determinism

File paths, groups, findings, duplicate groups, and reports are sorted. Finding fingerprints are SHA-256 digests over stable rule and location inputs. Timestamps are the only intentionally varying report field.

## Reference graph

The reference scanner recognizes CSS `url(...)`, common markup attributes, quoted paths ending in configured asset extensions, and optional user regexes. It resolves absolute package paths, source-relative paths, and configured aliases. It deliberately does not execute application code.

## Extension points

The initial public API exposes normalized configuration, file discovery, reference analysis, baseline functions, the audit engine, and all reporters. Future extractors can remain pure functions that emit candidate paths without changing the policy layer.
