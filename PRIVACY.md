# SkinAlyze Sync — privacy and data handling

This document describes what the **SkinAlyze Sync** browser extension can access, what stays on your device, what is sent to **Steam**, and what is sent to **SkinAlyze** ([skinalyze.app](https://skinalyze.app) or your self-hosted deployment).

## Data categories

### Local-only (Chrome extension storage)

Stored in `chrome.storage.local` on your machine:

- SkinAlyze **bearer token** after successful pairing (authenticates `/api/extension/*` requests).
- Expected **Steam ID** and optional display handle from SkinAlyze when you pair.
- Per-account Steam sync on/off setting.
- Last sync timestamps, last detected Steam account, last error message, and progress UI snapshots.

You can clear pairing from the extension UI where supported, and you should **revoke** the client from SkinAlyze **Settings → Integrations → Browser extension** to invalidate the server-side token.

### Used locally in the browser (not sent to SkinAlyze)

- Your normal **Steam Community session** when fetching `https://steamcommunity.com/...` with `credentials: 'include'`.
- A **Steam WebAPI access token** parsed from Steam’s own pages (when present) used **only** to call `https://api.steampowered.com/...` for trade-offer and trade-history style sync. This token is **not** included in payloads uploaded to SkinAlyze (see [docs/backend-contract.md](./docs/backend-contract.md)).

### Sent to Steam (Valve)

- HTTPS requests to **steamcommunity.com** for inventory JSON and related pages while you are logged in.
- HTTPS requests to **api.steampowered.com** when you use trade sync features, using Steam’s APIs and session-derived tokens as Steam intends.

### Sent to SkinAlyze (your configured API origin)

All requests use `credentials: 'omit'` and send a **JSON body** or query as documented in [docs/backend-contract.md](./docs/backend-contract.md). Typical categories:

- **Pairing**: one-time **pairing code** from SkinAlyze settings (`POST /api/extension/pair/confirm`).
- **After pairing**: `Authorization: Bearer <token>` on subsequent calls.
- **Inventory sync**: normalized inventory rows (asset id, class/instance ids, market name, tradability, icon URL, optional lock hints, etc.) (`POST /api/extension/inventory/sync`).
- **Inventory status badges** on the Steam inventory page: **asset id list** to resolve link status (`POST /api/extension/inventory/status`).
- **Trade sync**: normalized **offer** and **trade history** summary rows returned from Steam APIs, plus **client-side metadata** about pagination (pages fetched, counts) (`POST /api/extension/trade-offers/sync`). This runs automatically after pairing (see **Automatic sync** below), not only when you press Manual sync in the popup.

### Not sent to SkinAlyze

- Steam **passwords**
- Steam **Steam Guard** codes
- Steam **session cookies** or cookie header values
- Steam **WebAPI tokens** or other session/API details parsed from Steam pages (used **only inside your browser** to call Steam; not intentionally included in SkinAlyze upload payloads)
- Full page **HTML** (except what Steam returns to your browser for normal page loads; the extension does not upload HTML blobs to SkinAlyze)
- **Screenshots**

## Automatic sync

After you pair with SkinAlyze, the extension keeps your account updated **without** requiring you to click sync every time while **Steam sync** is enabled in the popup:

1. **Periodic background sync (about every 20 minutes):** While paired, the extension syncs **inventory** and **trade-offer / trade-history summaries** to SkinAlyze on a fixed interval using Chrome alarms.
2. **Page-triggered sync:** When you finish loading a relevant **Steam Community inventory** or **trade offers** page in the same browser, the extension may run the same sync again after a short cooldown (typically a few minutes) so normal browsing stays up to date.
3. **Manual sync:** The popup **Manual sync** button still runs inventory and trade sync on demand while Steam sync is enabled; automatic behavior continues afterward.
4. **Pause control:** Turning Steam sync off pauses manual, periodic, and page-triggered Steam sync for the active paired Steam account until you turn it back on.

**Purpose:** SkinAlyze features such as inventory review, trade reconciliation, and status badges need current summary data from Steam — not your login secrets.

**Explicitly not uploaded to SkinAlyze:** Steam password, Steam Guard codes, raw cookie jars, full page HTML dumps, screenshots, or Steam WebAPI/session tokens parsed locally for Steam API calls. Those remain on your device or go only to Steam’s servers as part of normal logged-in browsing.

## Control and retention

- **Revoke** the extension installation from SkinAlyze **Settings → Integrations → Browser extension → Revoke** to invalidate the token server-side.
- Inventory and trade snapshots are stored in **your SkinAlyze account** on SkinAlyze servers for the product features (inventory view, trade reconciliation). Exact retention is governed by SkinAlyze product policy and your account settings.

## Threat model (what “open source” proves)

- **Source on GitHub** lets you verify the public Steam sync component’s stated behavior by reading TypeScript, manifest permissions, and test expectations.
- **Chrome Web Store** distributes a built package. Official SkinAlyze distributions may include proprietary SkinAlyze features that are not included in this repository; this repo builds the public Steam sync component.
- **Malicious builds**: only install unpacked builds you built yourself, or releases from maintainers you trust.

## Contact

For security-sensitive reports, see [SECURITY.md](./SECURITY.md).
