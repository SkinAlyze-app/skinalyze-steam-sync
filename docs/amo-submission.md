# Firefox Add-ons submission

## Listing identity

- Name: **SkinAlyze Sync**
- Add-on ID: `skinalyze-sync@skinalyze.app`
- Public slug: `skinalyze-sync`
- Minimum Firefox: desktop `140.0`
- AMO platform: Firefox desktop only; do not enable Android distribution
- Homepage: `https://www.skinalyze.app/extension`
- Support/source: `https://github.com/SkinAlyze-app/skinalyze-steam-sync`
- Privacy policy: the hosted copy of `PRIVACY.md`

Suggested summary: **Sync Steam CS2 inventory, trades, and market history with SkinAlyze.**

## Data disclosure

The manifest declares these required types:

- Authentication information
- Personally identifying information
- Website content
- Financial and payment information

Technical and interaction information is optional. When declined, the extension omits `extension_version` from pairing; functional inventory, trade, and market-history payloads are unchanged. Private browsing is disabled.

Use `PRIVACY.md` and `docs/backend-contract.md` as the source of truth when completing AMO privacy questions.

## Reviewer package and instructions

Upload `skinalyze-sync-firefox-amo-v<version>.zip` as the add-on package and `skinalyze-sync-source-v<version>.zip` as source.

Build instructions for reviewers:

```bash
npm ci
SKINALYZE_API_ORIGIN=https://www.skinalyze.app npm run build:firefox
```

The reproducible output is `dist/firefox/`. Webpack minifies the JavaScript; no remote code is downloaded or executed.

Reviewer notes should explain:

1. Pairing requires a SkinAlyze account and a six-character code from Settings → Integrations.
2. Provide a temporary reviewer account and linked test Steam account privately through the AMO reviewer-notes field; never commit credentials.
3. Core verification: pair, run Manual sync while logged into Steam, open a Steam inventory page to see badges, and inspect sync status in the popup.
4. The extension never uploads Steam cookies, passwords, Steam Guard codes, raw HTML, screenshots, or Steam session/API tokens.
5. This repository contains only the public Steam sync component; proprietary SkinAlyze marketplace features are outside the submitted source and artifact.

## Local Firefox smoke test

1. Run `npm run build:firefox`.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select `dist/firefox/manifest.json`.
4. Verify install consent, popup pairing, manual sync, badges, pause/resume, and restart/background-alarm behavior.

`web-ext lint` may report an Android minimum-version notice because Firefox desktop 140 introduced the data-consent key before Firefox Android 142. Android is intentionally unsupported, no `gecko_android` target is declared, and the AMO listing must remain desktop-only.
