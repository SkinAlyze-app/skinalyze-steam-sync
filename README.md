# SkinAlyze Sync

Open-source **Chrome Manifest V3** extension that syncs your **Steam CS2 inventory** and **trade-offer summaries** with your [SkinAlyze](https://skinalyze.app) account while you are logged into Steam in the same browser.

This repository is the **public source** for SkinAlyze Sync. You can read the code, build the extension yourself, and verify what data leaves your machine. The extension talks to SkinAlyze’s documented `/api/extension/*` HTTP API after you pair it in SkinAlyze **Settings → Integrations → Browser extension**.

Repository: [github.com/SkinAlyze-app/skinalyze-steam-sync](https://github.com/SkinAlyze-app/skinalyze-steam-sync)

Download: [SkinAlyze Sync on the Chrome Web Store](https://chromewebstore.google.com/detail/skinalyze-sync/nmapmijejpgeeoffklgmofohciahcagg)

## Why open source

- **Transparency**: audit permissions, network calls, and payloads.
- **Trust**: pairing uses a short code from SkinAlyze; the extension stores a SkinAlyze-issued bearer token locally (see [PRIVACY.md](./PRIVACY.md)).
- **Reproducible builds**: `npm ci` and `npm run build` produce the `dist/` layout documented below.

Chrome Web Store distribution is available from the [SkinAlyze Sync listing](https://chromewebstore.google.com/detail/skinalyze-sync/nmapmijejpgeeoffklgmofohciahcagg). Release zips from [GitHub Releases](https://github.com/SkinAlyze-app/skinalyze-steam-sync/releases) remain available for testers who need sideloaded builds.

## What it does

- Injects a content script on `https://steamcommunity.com/.../inventory` to show per-item status badges when paired.
- **Pair** with SkinAlyze using a one-time code from SkinAlyze settings.
- **Sync inventory** to SkinAlyze (asset id, class/instance ids, market name, tradability, icon URL, etc.).
- **Sync trade-offer and trade-history summaries** from Steam Web APIs for SkinAlyze reconciliation (see [PRIVACY.md](./PRIVACY.md)).

## Automatic sync (after pairing)

Once paired, sync runs **automatically** — you do not need to open the popup each time.

- **Every 20 minutes** (background): inventory and trade-offer summaries sync to SkinAlyze while the extension stays paired.
- **When you open relevant Steam pages**: after you finish loading your Steam Community **inventory** or **trade offers** page, the extension may sync again (short cooldown between page-triggered runs).
- **Manual sync** in the popup still works anytime; automatic sync stays enabled.

**What is synced:** summary and trading data SkinAlyze needs (inventory rows, offer/history summaries, link-status badges on Steam inventory pages).

**What is never sent to SkinAlyze:** your Steam password, Steam Guard codes, raw Steam session cookies, or Steam WebAPI/session tokens parsed from Steam pages — those stay in your browser for local Steam requests only.

## What it does not do

- Does **not** read or send your Steam **password**.
- Does **not** send Steam **session cookies** or raw cookie jars to SkinAlyze.
- Does **not** upload full Steam page HTML or screenshots.
- Does **not** send Steam **WebAPI session tokens** parsed from Steam pages to SkinAlyze (local-only for Steam API calls).

## Permissions (why each exists)

| Permission | Purpose |
| --- | --- |
| `storage` | Pairing token, last sync timestamps, and UI state in `chrome.storage.local`. |
| `alarms` | Background sync about every **20 minutes** when paired (inventory + trade-offer summaries). |
| `scripting` | Steam inventory reads and coordination from the service worker. |
| `tabs` | Open or query Steam Community tabs when needed for inventory/trade data collection. |

**Host permissions**

- `https://steamcommunity.com/*` — Steam inventory pages and logged-in Steam fetches.
- `https://api.steampowered.com/*` — Steam Web API for trade offers/history.
- Your SkinAlyze API origin (build-time, production: `https://www.skinalyze.app`) - `/api/extension/*` calls.

## Build from source

Requirements: **Node 20+**, **npm 10+**.

```bash
npm ci
```

**Production** (skinalyze.app):

```bash
# macOS / Linux
SKINALYZE_API_ORIGIN=https://www.skinalyze.app npm run build

# Windows PowerShell
$env:SKINALYZE_API_ORIGIN="https://www.skinalyze.app"; npm run build
```

Or:

```bash
npm run ci:prod
```

**Local SkinAlyze dev** (default origin `http://localhost:3000` if unset):

```bash
SKINALYZE_API_ORIGIN=http://localhost:3000 npm run build
```

Load unpacked in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this repo’s **`dist/`** folder

Scripts: `npm run typecheck`, `npm test`, `npm run build`, `npm run ci`, `npm run ci:prod`. Regenerate icons: `npm run icons` (requires `sharp` once: `npm install --no-save sharp`).

## Beta testers (Chrome sideload)

1. On [skinalyze.app](https://skinalyze.app), open **Settings → Integrations → Browser extension** (when extension beta is enabled on the server).
2. Link Steam and **Generate pairing code**.
3. Download **`skinalyze-sync-extension.zip`** from the [latest GitHub Release](https://github.com/SkinAlyze-app/skinalyze-steam-sync/releases/latest).
4. Unzip so `manifest.json` is at the top level of the folder.
5. Chrome → `chrome://extensions` → **Developer mode** → **Load unpacked** → select that folder.
6. Enter the pairing code in the extension popup; use **Manual sync** while logged into Steam in the same browser.

**Chrome only** for this beta (Manifest V3).

## Pairing

1. In SkinAlyze, open **Settings → Integrations** and link Steam if needed.
2. Under **Browser extension**, generate a **pairing code**.
3. Open the extension popup, enter the code, and **Pair**.

Revoke anytime from the same Integrations page.

## API contract

See [docs/backend-contract.md](./docs/backend-contract.md) for `/api/extension/*` endpoints, payloads, and auth.

## SkinAlyze backend

The [SkinAlyze](https://skinalyze.app) web app must implement these APIs and issue JWTs for paired clients. Server secrets (for example `EXTENSION_JWT_SECRET`) belong in the **SkinAlyze app** environment, not in this repository. Maintainers: [docs/maintainers/production-deployment.md](./docs/maintainers/production-deployment.md).

## Privacy, security, licenses

- [PRIVACY.md](./PRIVACY.md)
- [SECURITY.md](./SECURITY.md)
- [NOTICE.md](./NOTICE.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [ROADMAP.md](./ROADMAP.md)
- [docs/release-process.md](./docs/release-process.md)

## License

MIT — see [LICENSE](./LICENSE).
