# Contributing to SkinAlyze Sync

Thanks for helping improve the SkinAlyze Sync extension.

## Prerequisites

- Node **20+** and npm **10+**
- Chrome (Chromium) for manual testing

## Setup

```bash
npm ci
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript compile check |
| `npm test` | Node-based unit/smoke tests |
| `npm run build` | Webpack build to `dist/` (default API origin `http://localhost:3000`) |
| `npm run ci:prod` | typecheck + test + production build for `https://skinalyze.app` |
| `npm run icons` | Regenerate `icons/icon{16,48,128}.png` from `icons/icon.svg` (needs `sharp`: `npm install --no-save sharp`) |
| `npm run ci` | typecheck, tests, and local-default build |

On Windows, for a one-off production build you can also set:

```powershell
$env:SKINALYZE_API_ORIGIN="https://skinalyze.app"; npm run build
```

## Project layout

- `src/manifest.json` — MV3 manifest (API origin placeholder replaced at build time).
- `src/background.ts` — service worker entry.
- `src/content/` — Steam inventory page integration.
- `src/lib/` — Steam fetch, API client, sync handlers.
- `scripts/` — Node test runners (`tsx`).

## Pull requests

- Keep changes focused; avoid unrelated refactors.
- Update **README / PRIVACY / docs** when behavior, permissions, or endpoints change.
- Confirm **no secrets** or personal data in commits.
- If you change `src/manifest.json` **permissions** or **host_permissions**, explain why in the PR description (trust-sensitive).
- Ensure `npm run ci` passes; use `npm run ci:prod` before release-related changes.

## Code of conduct

Be respectful in issues and pull requests. Harassment or abuse is not tolerated.
