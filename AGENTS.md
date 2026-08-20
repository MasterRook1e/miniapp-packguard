# Agent Instructions

Read `README.md`, `docs/ARCHITECTURE.md`, and `CONTRIBUTING.md` before changing code.

Hard boundaries:

- keep runtime dependencies at zero unless a public design discussion proves necessity
- do not execute scanned mini-app source
- preserve deterministic ordering and stable rule IDs
- keep Git subprocess calls shell-free
- add tests for new config fields and rule behavior
- never add private project names, data, screenshots, credentials, or assets

Run `npm run verify` before proposing a merge.
