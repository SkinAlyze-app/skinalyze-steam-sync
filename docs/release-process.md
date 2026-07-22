# Release process (SkinAlyze Sync)

## Versioning

Keep `src/manifest.json` and `package.json` on the same Semantic Version. Release tags use `v<version>`.

## Production build and packages

Requirements: Node 20.9+, npm 10+.

```bash
npm ci
npm run package:release
```

`package:release` always builds against `https://www.skinalyze.app`, runs typecheck, unit tests, both browser builds, manifest assertions, and Firefox lint, then creates:

- `artifacts/skinalyze-sync-chrome-v<version>.zip`
- `artifacts/skinalyze-sync-firefox-amo-v<version>.zip`
- `artifacts/skinalyze-sync-source-v<version>.zip`

Verify both manifests before publishing:

- Chrome uses only `background.service_worker` and includes the `offscreen` permission for hidden market-history parsing.
- Firefox uses only `background.scripts`, omits the Chrome-only `offscreen` permission, uses Gecko ID `skinalyze-sync@skinalyze.app`, requires Firefox `140.0`, and includes the documented data-collection declarations.
- Both include only the expected SkinAlyze API origin, Steam Community, and Steam Web API host permissions.
- No manifest contains `__API_ORIGIN__`, a localhost production origin, `<all_urls>`, or marketplace hosts.

## Distribution boundary

These packages reproduce only the public Steam sync component. Official browser-store builds may contain additional proprietary SkinAlyze features. Release notes must say which artifact is the public component and must not claim byte-for-byte parity with a store build that contains proprietary code.

## Store distribution

### Chrome

Upload the Chrome ZIP through the Chrome Web Store developer dashboard. The ZIP has `manifest.json` at its root.

### Firefox Add-ons (manual)

Upload the Firefox AMO ZIP as a listed extension through the AMO Developer Hub. Upload the source ZIP when AMO requests human-readable source for the minified Webpack output. Follow [amo-submission.md](./amo-submission.md) for identity, privacy declarations, reviewer notes, and smoke tests.

AMO performs signing and automatic updates. Do not present the unsigned AMO ZIP as an installable Firefox package.

## Pre-flight checklist

- [ ] `npm run ci:prod` passes, including both builds and `web-ext lint`.
- [ ] `npm run package:release` creates all three versioned artifacts.
- [ ] Chrome and Firefox manual smoke tests pass for pairing, sync, badges, pause/resume, and background alarms.
- [ ] `README.md`, `PRIVACY.md`, and store privacy disclosures match the manifest and payload behavior.
- [ ] No Instant Sell, quote-adapter, marketplace-session, remote-job, or broad-host-permission implementation is present.
- [ ] No `.env`, credentials, cookies, captured responses, or personal data appear in source or artifacts.
- [ ] Git tag, package version, both manifests, release notes, and intended store versions match.
- [ ] GitHub Release contains all artifacts and labels the Firefox ZIP as an AMO upload package.
- [ ] After AMO approval, confirm `https://addons.mozilla.org/firefox/addon/skinalyze-sync/`.
