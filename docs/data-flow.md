# Data flow (SkinAlyze Sync)

High-level view of where data moves. This matches the implementation in `src/` (see [backend-contract.md](./backend-contract.md) for HTTP details).

```mermaid
flowchart LR
  userBrowser["UserBrowser"]
  steamPages["Steam steamcommunity.com"]
  steamApi["Steam api.steampowered.com"]
  extension["SkinAlyzeSyncExtension"]
  skinApi["SkinAlyze API"]
  skinDb["SkinAlyze storage"]

  userBrowser --> extension
  extension -->|"Inventory JSON session in browser"| steamPages
  extension -->|"Trade APIs token stays in browser"| steamApi
  extension -->|"Bearer token JSON POST"| skinApi
  skinApi --> skinDb
```

## Legend

- **Steam pages**: the extension fetches inventory-related JSON/HTML endpoints using your existing Steam login. Nothing in this repo uploads raw Steam HTML to SkinAlyze.
- **Steam Web API**: optional trade sync uses session-derived tokens **inside the browser** to query Steam’s API hosts.
- **SkinAlyze API**: normalized payloads only, authenticated with the SkinAlyze-issued bearer token after pairing.
