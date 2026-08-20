# Threat model

## Assets

- integrity of package-budget results;
- confidentiality of repository contents and CI credentials;
- reliable SARIF and baseline artifacts;
- containment of filesystem access to the configured audit root.

## Untrusted input

File names, text files, binary assets, symlinks, configuration supplied by a pull-request branch, and baseline reports can all be attacker-controlled.

## Defenses

- inspected application files are never imported or executed;
- symlinks are resolved and external targets are reported without being read;
- excluded directories are pruned before traversal;
- baseline and configuration data are parsed as JSON;
- duplicate detection uses SHA-256 and never treats a size match as proof;
- findings use structured objects before rendering, limiting format-specific ambiguity;
- the runtime has no third-party dependencies.

## Maintainer guidance

Load budget policy and trusted baselines from the base branch when enforcing checks on untrusted pull requests. Grant workflows only `contents: read` unless SARIF upload is enabled, in which case add `security-events: write` to that job.

## Non-goals

PackGuard is not an antivirus product, JavaScript sandbox, license scanner, or semantic bundler. Dynamic asset paths may require explicit allow-listing or a future framework-specific extractor.
