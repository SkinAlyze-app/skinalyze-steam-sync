# SkinAlyze extension API (HTTP contract)

This document lists every SkinAlyze HTTP endpoint used by **SkinAlyze Sync** in this repository, how they are authenticated, and what classes of data are transmitted.

Base URL: whatever you pass as `SKINALYZE_API_ORIGIN` at **build time** (see [README.md](../README.md)). Production is typically `https://www.skinalyze.app`. Paths below are relative to that origin.

Authentication: after pairing, requests send `Authorization: Bearer <token>` except pairing confirm, which is unauthenticated aside from the one-time code.

---

## `POST /api/extension/pair/confirm`

**When:** User submits a pairing code in the extension popup.

**Auth:** None (public endpoint gated by short-lived code).

**Request JSON:**

| Field | Type | Notes |
| --- | --- | --- |
| `code` | string | Normalized uppercase alphanumeric pairing code from SkinAlyze. |
| `extension_version` | string | From the browser manifest. Omitted by Firefox when optional technical-data consent is not granted. |

**Response JSON (success):**

| Field | Type | Notes |
| --- | --- | --- |
| `token` | string | Bearer token stored locally; used for all later `/api/extension/*` calls. |
| `steam_id64` | string | Steam account this pairing is bound to. |
| `user_handle` | string or null | Optional display handle from SkinAlyze. |

**Response JSON (failure):** may include `error` string; HTTP non-2xx.

**Data sensitivity:** pairing code is short-lived; token is a secret once issued.

---

## `GET /api/extension/me`

**When:** Popup checks connectivity to SkinAlyze after pairing.

**Auth:** `Authorization: Bearer <token>`.

**Response:** HTTP 200 with JSON body interpreted as success (`me_ok` is derived from `res.ok` in code). Used as a lightweight health check.

---

## `POST /api/extension/inventory/sync`

**When:** Manual or automatic inventory sync.

**Auth:** Bearer token.

**Request JSON (representative keys):**

| Field | Type | Notes |
| --- | --- | --- |
| `steam_id64` | string | Expected Steam ID from pairing. |
| `items` | array | Normalized inventory rows built in-extension (no raw HTML, no Steam WebAPI session token). |
| `idempotency_key` | string | Client-generated idempotency key per sync run. |

**Response:** Parsed by callers for success/failure messages; typically includes counts or confirmation.

---

## `POST /api/extension/inventory/status`

**When:** Content script on Steam inventory requests badge statuses for visible asset IDs.

**Auth:** Bearer token.

**Request JSON:**

| Field | Type | Notes |
| --- | --- | --- |
| `asset_ids` | string[] | Steam asset ids visible on the page. |

**Response JSON:**

| Field | Type | Notes |
| --- | --- | --- |
| `statuses` | record | Map of asset id → status string for badge rendering. |

---

## `POST /api/extension/trade-offers/sync`

**When:** User runs trade offer / trade history sync from the extension.

**Auth:** Bearer token.

**Request JSON (top-level keys; offers/history are arrays of normalized rows):**

| Field | Type | Notes |
| --- | --- | --- |
| `steam_id64` | string | Linked Steam account. |
| `offers` | array | Chunk of normalized trade offers from Steam APIs. |
| `trade_history` | array | Chunk of normalized trade history rows. |
| `idempotency_key` | string | Per-request idempotency key. |
| `sync_run_id` | string | Present when upload is split across multiple chunks. |
| `chunk_index` | number | Zero-based chunk index. |
| `chunk_count` | number | Total chunks for this run. |
| `client_meta` | object | Pagination and fetch metadata (page counts, modes used, etc.). |

**Response:** JSON with `count` and optional `idempotent` flag (see `sync_trade_offers.ts`).

**Data sensitivity:** contains trade graph summaries as returned by Steam’s APIs, not your Steam password or cookies.

---

## Backend implementation note

The SkinAlyze server must implement these routes, validate bearer tokens, and persist data according to product rules. Database schema for SkinAlyze’s deployment is maintained in the main SkinAlyze application repository (for this monorepo: `supabase/migrations/20260402140000_browser_extension.sql`). It is **not** embedded in the extension package.
