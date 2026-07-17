# Contributing to SkinAlyze Sync

Thanks for helping improve the SkinAlyze Sync extension.

## Prerequisites

- Node **20.9+** and npm **10+**
- Current Chrome and Firefox **140+** for manual testing

## Setup

```bash
npm ci
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript compile check |
| `npm test` | Node-based unit/smoke tests |
| `npm run build` | Build `dist/chrome/` and `dist/firefox/` (default API origin `http://localhost:3000`) |
| `npm run build:chrome` | Build only the Chrome MV3 service-worker artifact |
| `npm run build:firefox` | Build only the Firefox MV3 background-script artifact |
| `npm run lint:firefox` | Validate `dist/firefox/` with Mozilla `web-ext` |
| `npm run package:release` | Run CI, then create Chrome, Firefox AMO, and reviewer-source ZIPs |
| `npm run ci:prod` | typecheck + test + production build for `https://www.skinalyze.app` |
| `npm run icons` | Regenerate `icons/icon{16,48,128}.png` from `icons/logo.png` (needs `sharp`: `npm install --no-save sharp`) |
| `npm run ci` | typecheck, tests, and local-default build |

On Windows, for a one-off production build you can also set:

```powershell
$env:SKINALYZE_API_ORIGIN="https://www.skinalyze.app"; npm run build
```

## Project layout

- `src/manifest.json` — shared MV3 manifest (API origin and browser-specific fields are added at build time).
- `src/background.ts` — Chrome service worker and Firefox background-script entry.
- `src/content/` — Steam inventory page integration.
- `src/lib/` — Steam fetch, API client, sync handlers.
- `scripts/` — Node test runners (`tsx`).

## Pull requests

- Keep changes focused; avoid unrelated refactors.
- Update **README / PRIVACY / docs** when behavior, permissions, or endpoints change.
- Confirm **no secrets** or personal data in commits.
- If you change `src/manifest.json` **permissions** or **host_permissions**, explain why in the PR description (trust-sensitive).
- Ensure `npm run ci` passes; use `npm run ci:prod` before release-related changes.
- Smoke-test `dist/chrome/` with Chrome Load unpacked and `dist/firefox/` with Firefox **about:debugging → This Firefox → Load Temporary Add-on**.

## Code of conduct

Be respectful in issues and pull requests. Harassment or abuse is not tolerated.
