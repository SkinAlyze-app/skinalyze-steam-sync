# Production deployment (SkinAlyze app)

Use this checklist on **skinalyze.app** before inviting extension beta testers. The extension zip is built from this repository; database and server config live in the **SkinAlyze web app** deployment.

## Database

Apply the SkinAlyze app migrations for browser extension support (pairing tables, inventory assets, sync events, steam trade history). Confirm these tables exist in production:

- `extension_pairing_tokens`
- `extension_clients`
- `steam_inventory_assets`
- `extension_sync_events`
- `steam_trade_history` (and related)

## Server environment

| Variable | Required | Notes |
|----------|----------|--------|
| `EXTENSION_JWT_SECRET` | **Yes** | Min 32 characters. Generate: `openssl rand -hex 32`. Never commit. |
| `NEXT_PUBLIC_EXTENSION_BETA` | For extension beta UI | Set `true` to show Settings → Browser extension and Steam inventory while open beta is on. |

## Smoke test

1. Log in at https://skinalyze.app
2. **Settings → Integrations** — Browser extension section visible
3. Link Steam → **Generate pairing code**
4. Install from the Chrome Web Store or Firefox Add-ons; for source verification, use a production artifact from [GitHub Releases](https://github.com/SkinAlyze-app/skinalyze-steam-sync/releases)
5. Pair in extension popup → **Manual sync**
6. Confirm synced data in SkinAlyze (Steam inventory / trade views)

## Rollback

- Hide extension UI: unset `NEXT_PUBLIC_EXTENSION_BETA` and redeploy the web app.
- Revoke clients: Settings → Integrations → Browser extension → Revoke.
