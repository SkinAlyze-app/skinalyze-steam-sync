# Release process (SkinAlyze Sync)

## Versioning

1. Bump **`src/manifest.json`** `version` (Chrome extension version).
2. Bump **`package.json`** `version` to match (keeps npm metadata aligned).

Use [Semantic Versioning](https://semver.org/) for user-visible extension releases.

## Build a shipping zip (from source)

Prerequisites: Node **20+**, npm **10+**.

```bash
npm ci
npm run typecheck
npm test
SKINALYZE_API_ORIGIN=https://www.skinalyze.app npm run build
```

Or use the production CI script (same checks):

```bash
npm run ci:prod
```

**Important:** `npm run build` and `npm run ci` alone use the default API origin **`http://localhost:3000`** unless you set `SKINALYZE_API_ORIGIN` (or `NEXT_PUBLIC_BASE_URL`) in the environment. Always verify **`dist/manifest.json`** before shipping.

Verify **`dist/manifest.json`**:

- `host_permissions` includes `https://www.skinalyze.app/*` for production releases.
- `https://steamcommunity.com/*` and `https://api.steampowered.com/*` are present.
- `permissions` match what you intend to ship.

Create a zip of **the contents** of `dist/` (Chrome expects `manifest.json` at the root of the unpacked folder / zip root):

```bash
# macOS / Linux
(cd dist && zip -r ../skinalyze-sync-extension.zip .)
```

On Windows, use Explorer to zip the **contents** of `dist`, or PowerShell `Compress-Archive` targeting the files inside `dist`.

## Pre-flight checklist

- [ ] `npm run ci:prod` passes (or equivalent: typecheck, test, production build).
- [ ] No secrets in tracked files (search for `sk_`, `pk_`, private URLs, `.env`).
- [ ] `README.md` and `PRIVACY.md` match current manifest permissions and endpoints.
- [ ] Git tag matches `manifest.json` version (example: `v0.1.0`).
- [ ] GitHub Release notes summarize user-facing changes.
- [ ] Attach **`skinalyze-sync-extension.zip`** to the GitHub Release (required for beta testers; release workflow can attach it on tag push).

## Distribution during beta

- Ship **GitHub Release zips** only (sideload / Load unpacked). See [README.md](../README.md) — Beta testers.
- **Chrome Web Store** is intentionally **deferred** until after sideload beta feedback; do not upload to CWS for v0.1.0 beta.

## Chrome Web Store (later)

When ready post-beta, upload the same zip built from a tagged commit. Store distribution is controlled by Google signing. Users auditing this repo should compare tagged source, CI logs/artifacts, and the store listing version string.
