# SkinAlyze Sync

Open-source **Chrome and Firefox Manifest V3** Steam sync component that syncs your **Steam CS2 inventory**, **trade-offer summaries**, and **market-history summaries** with your [SkinAlyze](https://skinalyze.app) account while you are logged into Steam in the same browser.

This repository contains the open-source Steam inventory and trade-sync component of the SkinAlyze browser extension. You can read the code, build this public Steam sync component yourself, and verify its Steam/SkinAlyze network calls. The extension talks to SkinAlyze’s documented `/api/extension/*` HTTP API after you pair it in SkinAlyze **Settings → Integrations → Browser extension**.

Official SkinAlyze browser-extension distributions may include additional proprietary SkinAlyze features, including Instant Sell marketplace quote collection, that are not included in this repository. Builds from this repository reproduce the public Steam sync component, not necessarily every feature in the official browser-store distributions.

Repository: [github.com/SkinAlyze-app/skinalyze-steam-sync](https://github.com/SkinAlyze-app/skinalyze-steam-sync)

Download: [Chrome Web Store](https://chromewebstore.google.com/detail/skinalyze-sync/nmapmijejpgeeoffklgmofohciahcagg) · [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/skinalyze-sync/)

## Why open source

- **Transparency**: audit permissions, network calls, and payloads.
- **Trust**: pairing uses a short code from SkinAlyze; the extension stores a SkinAlyze-issued bearer token locally (see [PRIVACY.md](./PRIVACY.md)).
- **Reproducible public builds**: `npm ci` and `npm run build` produce separate public Steam sync artifacts in `dist/chrome/` and `dist/firefox/`.

Official releases are distributed through the [Chrome Web Store](https://chromewebstore.google.com/detail/skinalyze-sync/nmapmijejpgeeoffklgmofohciahcagg) and [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/skinalyze-sync/). GitHub Releases include auditable browser packages and reviewer source artifacts.

## What it does

- Injects a content script on `https://steamcommunity.com/.../inventory` to show per-item status badges when paired.
- **Pair** with SkinAlyze using a one-time code from SkinAlyze settings.
- **Sync inventory** to SkinAlyze (asset id, class/instance ids, market name, tradability, icon URL, etc.).
- **Sync trade-offer and trade-history summaries** from Steam Web APIs for SkinAlyze reconciliation (see [PRIVACY.md](./PRIVACY.md)).
- **Pause or resume Steam sync** per paired Steam account from the popup.

## Automatic sync (after pairing)

Once paired, sync runs **automatically** — you do not need to open the popup each time.

- **Every 20 minutes** (background): inventory, trade-offer, and market-history summaries sync to SkinAlyze while the extension stays paired and Steam sync is enabled.
- **When you open relevant Steam pages**: after you finish loading your Steam Community **inventory**, **trade offers**, or **market** page, the extension may sync the matching data again (short cooldown between page-triggered runs).
- **Steam sync toggle** in the popup pauses or resumes manual, periodic, and page-triggered Steam sync for the active paired Steam account.
- **Manual sync** in the popup still works while Steam sync is enabled.
- **No surprise Steam tabs**: periodic and page-triggered syncs use authenticated background requests. An explicit manual action may briefly open and automatically close an inactive Steam tab only if Steam rejects the background request.

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
| `storage` | Pairing token, last sync timestamps, and UI state in browser extension-local storage. |
| `alarms` | Background sync about every **20 minutes** when paired (inventory, trade-offer, and market-history summaries). |
| `scripting` | Steam reads and coordination from the Chrome service worker or Firefox background script. |
| `tabs` | Manual-only fallback when Steam rejects a background login, inventory, or market-history request; the temporary inactive tab is automatically closed. |
| `offscreen` (Chrome only) | Parse Steam market-history HTML in a hidden extension document without opening a browser tab. Firefox performs the same parsing in its DOM-capable background document. |

**Host permissions**

- `https://steamcommunity.com/*` — Steam inventory pages and logged-in Steam fetches.
- `https://api.steampowered.com/*` — Steam Web API for trade offers/history.
- Your SkinAlyze API origin (build-time, production: `https://www.skinalyze.app`) - `/api/extension/*` calls.

## Build from source

Requirements: **Node 20.9+**, **npm 10+**.

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

Build commands:

- `npm run build` — both browsers.
- `npm run build:chrome` — `dist/chrome/` only.
- `npm run build:firefox` — `dist/firefox/` only.
- `npm run lint:firefox` — validate the Firefox artifact with Mozilla `web-ext`.
- `npm run package:release` — production builds plus Chrome, Firefox AMO, and reviewer-source ZIPs.

Load unpacked in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this repo’s **`dist/chrome/`** folder

Load temporarily in Firefox 140+:

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on**.
3. Choose **`dist/firefox/manifest.json`**.

Scripts: `npm run typecheck`, `npm test`, `npm run build`, `npm run lint:firefox`, `npm run ci`, `npm run ci:prod`. Regenerate icons: `npm run icons` (requires `sharp` once: `npm install --no-save sharp`).

## Store installation

1. On [skinalyze.app](https://skinalyze.app), open **Settings → Integrations → Browser extension** (when extension beta is enabled on the server).
2. Link Steam and **Generate pairing code**.
3. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/skinalyze-sync/nmapmijejpgeeoffklgmofohciahcagg) or [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/skinalyze-sync/).
4. Enter the pairing code in the extension popup; use **Manual sync** while logged into Steam in the same browser.

Firefox support is desktop-only and requires Firefox 140 or newer. Firefox private browsing and Firefox for Android are not supported.

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
