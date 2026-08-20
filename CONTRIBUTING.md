# Contributing

Contributions are welcome when they improve deterministic package auditing without introducing project-specific behavior.

## Development

```bash
npm install --ignore-scripts
npm run verify
```

The project intentionally has no runtime or development dependencies. Tests use the Node.js built-in test runner.

## Pull requests

- keep changes focused
- add tests for behavior changes
- preserve deterministic sorting and stable findings
- document new rule IDs and configuration fields
- do not add private project fixtures, credentials, vendor binaries, or copyrighted application assets
- state whether a change affects CLI output, JSON/SARIF schemas, exit codes, or baseline compatibility

## Compatibility

Node.js 20 and 22 on Linux, Windows, and macOS are the supported CI targets for the initial release.
