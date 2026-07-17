# Roadmap

## Browser support

Version 0.2.x supports current Chrome and Firefox desktop 140+ from one source tree. Firefox for Android, Firefox ESR 128, and Safari are not currently supported.

## Public repository scope

Third-party marketplace page helpers and Instant Sell marketplace quote collection are **not** part of this public Steam sync repository.

Official SkinAlyze browser-extension distributions may include additional proprietary SkinAlyze features outside this repository. Public builds from this repository should stay limited to Steam sync permissions and behavior.

Public builds intentionally keep the same narrow Steam and SkinAlyze host permissions in both browsers; no broad host permissions are planned.

## Future Steam sync work

- Continue improving Steam rate-limit recovery and user-facing retry guidance.
- Expand reproducible release verification for the public Steam sync builds.
- Keep backend-contract and privacy documentation aligned with payload changes.
