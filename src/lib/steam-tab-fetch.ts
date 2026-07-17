/**
 * Read Steam CS2 inventory in the page MAIN world.
 * Primary: authenticated JSON `GET /inventory/{steamid}/{app}/{ctx}` with pagination (full ctx 2 + ctx 16).
 * Fallback: legacy `g_ActiveInventory` / `UserYou.getInventory` (incomplete for large trade-protected buckets).
 */

import { withTimeout } from '@/lib/promise-timeout';
import { setInventorySyncProgress, type InventorySyncPhase } from '@/lib/sync-progress';
import { browser } from '@/shared/browser-api';

const LOAD_TIMEOUT_MS = 15000;
const INVENTORY_READ_TIMEOUT_MS = 120000;
const INVENTORY_READY_MS = 12000;
const INVENTORY_POLL_MS = 150;
const POST_LOAD_DELAY_MS = 2000;
/** Wait for Steam to populate m_rgAssets after LoadCompleteInventory (async hydration). */
const ASSETS_HYDRATE_MS = 15000;
const ASSETS_HYDRATE_POLL_MS = 200;

/** Steam economy asset property row (inspect token, float fallback, seed fallback). */
export type RawSteamAssetProperty = {
  propertyid?: number;
  int_value?: number;
  float_value?: number;
  string_value?: string;
};

export type RawSteamAsset = {
  assetid: string;
  classid: string;
  instanceid?: string;
  amount?: string;
  /** Steam inventory context (2 = normal CS2, 16 = trade-protected). From JSON API `contextid`. */
  contextid?: string;
  /** From JSON API or legacy merge; used for %propid:6% and fallbacks. */
  asset_properties?: RawSteamAssetProperty[];
  actions?: unknown[];
  market_actions?: unknown[];
};
export type RawSteamDesc = {
  classid: string;
  instanceid?: string;
  market_hash_name?: string;
  market_name?: string;
  name?: string;
  type?: string;
  icon_url?: string;
  icon_url_large?: string;
  tradable?: number;
  marketable?: number;
  name_color?: string;
  tags?: { category: string; internal_name: string }[];
  owner_descriptions?: { type?: string; value?: string }[];
  descriptions?: unknown[];
  asset_properties?: RawSteamAssetProperty[];
  actions?: unknown[];
  market_actions?: unknown[];
};

type PageInvOk = { ok: true; assets: RawSteamAsset[]; descriptions: RawSteamDesc[] };
type PageInvErr = { ok: false; error: string; assets: []; descriptions: [] };
type PageInvResult = PageInvOk | PageInvErr;
export type FetchInventoryViaTabOptions = {
  trackProgress?: boolean;
};

/**
 * Injected into the tab (MAIN world). Tries paginated JSON /inventory first; falls back to g_ActiveInventory.
 */
async function readInventoryFromPageMain(
  expectedSteamId64: string,
  appId: number,
  contextId: number
): Promise<PageInvResult> {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const INVENTORY_JSON_REQUEST_TIMEOUT_MS = 20000;
  /** CS2 trade-protected bucket (reference: CSGO Trader inventory.js context 16). */
  const TRADE_PROTECTED_CTX = 16;

  const plainTag = (t: unknown): { category: string; internal_name: string } | null => {
    if (!t || typeof t !== 'object') return null;
    const x = t as { category?: string; internal_name?: string };
    if (x.category == null || x.internal_name == null) return null;
    return { category: String(x.category), internal_name: String(x.internal_name) };
  };

  const plainOwner = (o: unknown): { type?: string; value?: string } | null => {
    if (!o || typeof o !== 'object') return null;
    const x = o as { type?: string; value?: string };
    return { type: x.type != null ? String(x.type) : undefined, value: x.value != null ? String(x.value) : undefined };
  };

  const plainAssetProp = (p: unknown): RawSteamAssetProperty | null => {
    if (!p || typeof p !== 'object') return null;
    const o = p as Record<string, unknown>;
    const pid = o.propertyid;
    const propertyid =
      typeof pid === 'number' && Number.isFinite(pid)
        ? pid
        : typeof pid === 'string' && pid.trim() !== ''
          ? Number.parseInt(pid, 10)
          : undefined;
    if (propertyid == null || !Number.isFinite(propertyid)) return null;
    const out: RawSteamAssetProperty = { propertyid };
    if (typeof o.int_value === 'number' && Number.isFinite(o.int_value)) out.int_value = o.int_value;
    if (typeof o.float_value === 'number' && Number.isFinite(o.float_value)) out.float_value = o.float_value;
    if (o.string_value != null) out.string_value = String(o.string_value);
    return out;
  };

  const descFromObj = (d: unknown): RawSteamDesc | null => {
    if (!d || typeof d !== 'object') return null;
    const x = d as Record<string, unknown>;
    const classid = x.classid != null ? String(x.classid) : '';
    if (!classid) return null;
    const instanceid = x.instanceid != null ? String(x.instanceid) : '0';
    const tagsRaw = Array.isArray(x.tags) ? x.tags.map(plainTag).filter(Boolean) as RawSteamDesc['tags'] : undefined;
    const ownersRaw = Array.isArray(x.owner_descriptions)
      ? x.owner_descriptions.map(plainOwner).filter(Boolean) as RawSteamDesc['owner_descriptions']
      : undefined;
    const apRaw = x.asset_properties;
    let asset_properties: RawSteamAssetProperty[] | undefined;
    if (Array.isArray(apRaw)) {
      asset_properties = apRaw.map(plainAssetProp).filter(Boolean) as RawSteamAssetProperty[];
      if (asset_properties.length === 0) asset_properties = undefined;
    }
    const actions = Array.isArray(x.actions) ? x.actions : undefined;
    const market_actions = Array.isArray(x.market_actions) ? x.market_actions : undefined;
    const descriptionsNested = Array.isArray(x.descriptions) ? x.descriptions : undefined;
    return {
      classid,
      instanceid,
      name: x.name != null ? String(x.name) : undefined,
      type: x.type != null ? String(x.type) : undefined,
      market_hash_name: x.market_hash_name != null ? String(x.market_hash_name) : undefined,
      market_name: x.market_name != null ? String(x.market_name) : undefined,
      icon_url: x.icon_url != null ? String(x.icon_url) : undefined,
      icon_url_large: x.icon_url_large != null ? String(x.icon_url_large) : undefined,
      tradable:
        x.tradable === true || x.tradable === 1 || x.tradable === '1'
          ? 1
          : x.tradable === false || x.tradable === 0 || x.tradable === '0'
            ? 0
            : typeof x.tradable === 'number'
              ? x.tradable
              : undefined,
      marketable:
        x.marketable === true || x.marketable === 1 || x.marketable === '1'
          ? 1
          : x.marketable === false || x.marketable === 0 || x.marketable === '0'
            ? 0
            : typeof x.marketable === 'number'
              ? x.marketable
              : undefined,
      name_color: x.name_color != null ? String(x.name_color) : undefined,
      tags: tagsRaw,
      owner_descriptions: ownersRaw,
      descriptions: descriptionsNested,
      asset_properties,
      actions,
      market_actions,
    };
  };

  /** Parse body.asset_properties into a map assetid -> property rows (tolerant shapes). */
  function buildAssetPropertiesById(body: Record<string, unknown>): Map<string, RawSteamAssetProperty[]> {
    const byId = new Map<string, RawSteamAssetProperty[]>();
    const raw = body.asset_properties;
    if (raw == null) return byId;

    const pushProps = (assetId: string, arr: unknown[]) => {
      const props = arr.map(plainAssetProp).filter(Boolean) as RawSteamAssetProperty[];
      if (props.length === 0) return;
      const cur = byId.get(assetId);
      if (cur) byId.set(assetId, [...cur, ...props]);
      else byId.set(assetId, props);
    };

    if (Array.isArray(raw)) {
      for (const w of raw) {
        if (!w || typeof w !== 'object') continue;
        const o = w as Record<string, unknown>;
        const aid =
          o.assetid != null
            ? String(o.assetid)
            : o.asset_id != null
              ? String(o.asset_id)
              : o.assetId != null
                ? String(o.assetId)
                : '';
        const inner = o.properties ?? o.asset_properties ?? o.rgAssetProperties;
        if (aid && Array.isArray(inner)) pushProps(aid, inner);
      }
    } else if (typeof raw === 'object') {
      for (const k of Object.keys(raw as object)) {
        const v = (raw as Record<string, unknown>)[k];
        if (Array.isArray(v)) {
          const first = v[0];
          if (first && typeof first === 'object' && 'propertyid' in (first as object)) {
            pushProps(k, v);
          } else {
            for (const inner of v) {
              if (!inner || typeof inner !== 'object') continue;
              const o = inner as Record<string, unknown>;
              const aid =
                o.assetid != null
                  ? String(o.assetid)
                  : o.asset_id != null
                    ? String(o.asset_id)
                    : '';
              const props = o.properties ?? o.asset_properties;
              if (aid && Array.isArray(props)) pushProps(aid, props);
            }
          }
        }
      }
    }
    return byId;
  }

  function isLikelyOwnInventory(): boolean {
    const mine = expectedSteamId64.trim();
    const path = window.location.pathname || '';
    if (path.includes('/my/')) return true;
    const pm = path.match(/\/profiles\/(\d{10,20})\//);
    if (pm?.[1]) return pm[1] === mine;
    return false;
  }

  async function fetchContextFully(
    steamId: string,
    aid: number,
    ctx: number
  ): Promise<{ assets: RawSteamAsset[]; descriptions: RawSteamDesc[] }> {
    const pageSize = 5000;
    const maxPages = 30;
    let lastAssetId: string | null = null;
    const assets: RawSteamAsset[] = [];
    const descByKey = new Map<string, RawSteamDesc>();
    const isProtected = ctx === TRADE_PROTECTED_CTX;
    /** Backoff between retries when Steam returns empty body / success:0 / 429 / 5xx */
    const SOFT_FAIL_BACKOFF_MS = [800, 2000, 4500];

    /**
     * Fetch one inventory JSON page with retries. Returns parsed body, or null to stop early
     * (trade-protected only). Primary (ctx 2) never returns null on success — caller throws if exhausted.
     */
    async function fetchPageJsonWithRetries(pageUrl: string): Promise<Record<string, unknown> | null> {
      async function fetchPageWithTimeout(): Promise<{ res: Response; body: Record<string, unknown> | null }> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), INVENTORY_JSON_REQUEST_TIMEOUT_MS);
        try {
          const res = await fetch(pageUrl, { credentials: 'include', signal: controller.signal });
          if (!res.ok || res.status === 403 || res.status === 429 || res.status >= 500) {
            return { res, body: null };
          }
          const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
          return { res, body };
        } catch (e) {
          if (controller.signal.aborted) {
            throw new Error(`Inventory fetch ctx${ctx} timed out.`);
          }
          throw e;
        } finally {
          clearTimeout(timer);
        }
      }

      for (let attempt = 0; attempt <= SOFT_FAIL_BACKOFF_MS.length; attempt++) {
        let pageResult: { res: Response; body: Record<string, unknown> | null };
        try {
          pageResult = await fetchPageWithTimeout();
        } catch (e) {
          if (attempt < SOFT_FAIL_BACKOFF_MS.length) {
            await sleep(SOFT_FAIL_BACKOFF_MS[attempt]);
            continue;
          }
          if (isProtected) return null;
          throw new Error(
            e instanceof Error && e.message
              ? e.message
              : 'Steam inventory request timed out. Wait a minute and try again.',
          );
        }

        const { res, body } = pageResult;
        if (res.status === 403 && isProtected) {
          return null;
        }
        if (res.status === 429 || res.status >= 500) {
          if (!isProtected) {
            if (attempt < SOFT_FAIL_BACKOFF_MS.length) {
              await sleep(SOFT_FAIL_BACKOFF_MS[attempt]);
              continue;
            }
            throw new Error(
              'STEAM_RATE_LIMIT:Steam rate-limited the inventory request. Wait a minute and try again.',
            );
          }
          if (attempt < SOFT_FAIL_BACKOFF_MS.length) {
            await sleep(SOFT_FAIL_BACKOFF_MS[attempt]);
            continue;
          }
          return null;
        }
        if (!res.ok) {
          throw new Error(`Inventory fetch ctx${ctx} HTTP ${res.status}`);
        }
        const ok = body != null && (body.success === 1 || body.success === true);
        if (ok && body) return body;
        if (isProtected) {
          return null;
        }
        if (attempt < SOFT_FAIL_BACKOFF_MS.length) {
          await sleep(SOFT_FAIL_BACKOFF_MS[attempt]);
          continue;
        }
        return null;
      }
      return null;
    }

    for (let page = 0; page < maxPages; page++) {
      // Steam's public /inventory/{id}/{app}/{ctx}/ endpoint only accepts `l` and `count` (max ~2000).
      // Extra params (preserve_bbcode, raw_asset_properties, norender, etc.) cause HTTP 400.
      const params = new URLSearchParams({
        l: 'english',
        count: String(Math.min(pageSize, 2000)),
      });
      if (lastAssetId) params.set('start_assetid', lastAssetId);
      const url = `https://steamcommunity.com/inventory/${steamId}/${aid}/${ctx}/?${params}`;
      const body = await fetchPageJsonWithRetries(url);
      if (!body) {
        if (isProtected) {
          return { assets, descriptions: [...descByKey.values()] };
        }
        if (assets.length === 0 && page === 0) {
          throw new Error(
            'STEAM_INVENTORY_CTX2_SOFT_FAIL:Steam did not return your main inventory. Open steamcommunity.com, load your CS2 inventory fully, then sync again.',
          );
        }
        throw new Error(
          'STEAM_INVENTORY_CTX2_INCOMPLETE:Steam inventory pagination was interrupted. Try again in a moment.',
        );
      }
      const apById = buildAssetPropertiesById(body);
      for (const a of (body.assets as unknown[]) ?? []) {
        if (!a || typeof a !== 'object') continue;
        const o = a as Record<string, unknown>;
        const assetid = o.assetid != null ? String(o.assetid) : '';
        if (!assetid) continue;
        const classid = o.classid != null ? String(o.classid) : '';
        const instanceid = o.instanceid != null ? String(o.instanceid) : '0';
        const ctxNum = o.contextid != null ? String(o.contextid) : String(ctx);
        const amount = o.amount != null ? String(o.amount) : undefined;
        let asset_properties: RawSteamAssetProperty[] | undefined;
        if (Array.isArray(o.asset_properties)) {
          const mapped = (o.asset_properties as unknown[]).map(plainAssetProp).filter(Boolean) as RawSteamAssetProperty[];
          if (mapped.length) asset_properties = mapped;
        }
        if (!asset_properties?.length) {
          const fromMap = apById.get(assetid);
          if (fromMap?.length) asset_properties = fromMap;
        }
        const actions = Array.isArray(o.actions) ? (o.actions as unknown[]) : undefined;
        const market_actions = Array.isArray(o.market_actions) ? (o.market_actions as unknown[]) : undefined;
        assets.push({
          assetid,
          classid,
          instanceid,
          amount,
          contextid: ctxNum,
          asset_properties,
          actions,
          market_actions,
        });
      }
      for (const d of (body.descriptions as unknown[]) ?? []) {
        const pd = descFromObj(d);
        if (pd) {
          const k = `${pd.classid}_${pd.instanceid ?? '0'}`;
          if (!descByKey.has(k)) descByKey.set(k, pd);
        }
      }
      const more = body.more_items === 1 || body.more_items === true;
      const lastRaw = body.last_assetid;
      const last = lastRaw != null ? String(lastRaw) : '';
      if (!more || !last) break;
      lastAssetId = last;
    }
    return { assets, descriptions: [...descByKey.values()] };
  }

  try {
    const steamId = expectedSteamId64.trim();
    if (/^\d{10,20}$/.test(steamId)) {
      const mergedByAsset = new Map<string, RawSteamAsset>();
      const descMap = new Map<string, RawSteamDesc>();

      try {
        const primary = await fetchContextFully(steamId, appId, contextId);
        for (const a of primary.assets) mergedByAsset.set(a.assetid, a);
        for (const d of primary.descriptions) {
          descMap.set(`${d.classid}_${d.instanceid ?? '0'}`, d);
        }
      } catch {
        /* ctx 2 failed; try ctx 16 then legacy */
      }

      if (isLikelyOwnInventory()) {
        try {
          const prot = await fetchContextFully(steamId, appId, TRADE_PROTECTED_CTX);
          for (const a of prot.assets) mergedByAsset.set(a.assetid, a);
          for (const d of prot.descriptions) {
            descMap.set(`${d.classid}_${d.instanceid ?? '0'}`, d);
          }
        } catch {
          /* ctx 16 failed; fall through */
        }
      }

      const mergedAssets = [...mergedByAsset.values()];
      if (mergedAssets.length > 0) {
        return { ok: true, assets: mergedAssets, descriptions: [...descMap.values()] };
      }
    }
  } catch {
    /* fall through to legacy */
  }

  const w = window as unknown as {
    g_ActiveInventory?: {
      m_appid?: number | string;
      m_contextid?: number | string;
      m_rgAssets?: Record<string, unknown>;
      m_rgDescriptions?: Record<string, unknown>;
      /** Legacy: per-asset economy properties (inspect token, float fallback). */
      m_rgAssetProperties?: Record<string, unknown>;
      LoadCompleteInventory?: () => { done?: (cb: () => void) => unknown; fail?: (cb: (e: unknown) => void) => unknown };
    };
  };

  const deadline = Date.now() + INVENTORY_READY_MS;
  let inv = w.g_ActiveInventory;
  while (!inv && Date.now() < deadline) {
    await sleep(INVENTORY_POLL_MS);
    inv = w.g_ActiveInventory;
  }

  if (!inv) {
    return {
      ok: false,
      error: 'Steam inventory page not ready (g_ActiveInventory missing). Open your CS2 inventory and try again.',
      assets: [],
      descriptions: [],
    };
  }

  const appDeadline = Date.now() + 8000;
  while (Date.now() < appDeadline) {
    inv = w.g_ActiveInventory;
    if (!inv) break;
    const activeApp = Number(inv.m_appid);
    if (activeApp === appId) break;
    await sleep(200);
  }

  inv = w.g_ActiveInventory;
  if (!inv) {
    return { ok: false, error: 'g_ActiveInventory disappeared during load.', assets: [], descriptions: [] };
  }
  const finalApp = Number(inv.m_appid);
  if (finalApp !== appId) {
    return {
      ok: false,
      error: `Wrong game selected (app ${finalApp}, need ${appId} / CS2). Open Counter-Strike 2 inventory and try again.`,
      assets: [],
      descriptions: [],
    };
  }

  const hadLoadComplete = typeof inv.LoadCompleteInventory === 'function';

  if (typeof inv.LoadCompleteInventory === 'function') {
    try {
      const d = inv.LoadCompleteInventory();
      if (d && typeof (d as Promise<void>).then === 'function' && typeof (d as { done?: unknown }).done !== 'function') {
        await (d as Promise<void>);
      } else {
        await new Promise<void>((resolve, reject) => {
          const def = d as { done?: (cb: () => void) => unknown; fail?: (cb: (e: unknown) => void) => unknown };
          if (def && typeof def.done === 'function') {
            if (typeof def.fail === 'function') {
              def.fail((e: unknown) => reject(new Error(String(e))));
            }
            def.done(() => resolve());
          } else {
            resolve();
          }
        });
      }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'LoadCompleteInventory failed',
        assets: [],
        descriptions: [],
      };
    }
  }

  inv = w.g_ActiveInventory;
  if (!inv) {
    return { ok: false, error: 'g_ActiveInventory missing after load.', assets: [], descriptions: [] };
  }

  const hydrateDeadline = Date.now() + ASSETS_HYDRATE_MS;
  let rg: Record<string, unknown> | undefined;
  while (Date.now() < hydrateDeadline) {
    inv = w.g_ActiveInventory;
    if (!inv) break;
    const maybe = inv.m_rgAssets;
    if (maybe && typeof maybe === 'object' && Object.keys(maybe).length > 0) {
      rg = maybe as Record<string, unknown>;
      break;
    }
    await sleep(ASSETS_HYDRATE_POLL_MS);
  }

  inv = w.g_ActiveInventory;
  if (!inv) {
    return { ok: false, error: 'g_ActiveInventory missing after hydration wait.', assets: [], descriptions: [] };
  }

  function mergeDescMaps(
    ...parts: Array<Record<string, unknown> | undefined | null>
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const p of parts) {
      if (p && typeof p === 'object') Object.assign(out, p);
    }
    return out;
  }

  function mergeCollectedUnique(a: unknown[], b: unknown[]): unknown[] {
    const m = new Map<string, unknown>();
    for (const x of [...a, ...b]) {
      if (x && typeof x === 'object' && (x as { assetid?: unknown }).assetid != null) {
        m.set(String((x as { assetid: unknown }).assetid), x);
      }
    }
    return [...m.values()];
  }

  function collectAssetsFromRg(rgMap: Record<string, unknown>, aid: number, ctxId: number): unknown[] {
    const appKey = String(aid);
    const ctxKey = String(ctxId);
    const out: unknown[] = [];
    const pushAsset = (val: unknown) => {
      if (val && typeof val === 'object' && (val as { assetid?: unknown }).assetid != null) out.push(val);
    };

    const appBucket = rgMap[aid] ?? rgMap[appKey];
    if (appBucket && typeof appBucket === 'object' && !('assetid' in (appBucket as object))) {
      const ctxBucket =
        (appBucket as Record<string, unknown>)[ctxId] ?? (appBucket as Record<string, unknown>)[ctxKey];
      if (ctxBucket && typeof ctxBucket === 'object') {
        for (const k of Object.keys(ctxBucket as Record<string, unknown>)) {
          pushAsset((ctxBucket as Record<string, unknown>)[k]);
        }
      }
    }

    const composite = `${aid}_${ctxId}`;
    const byComposite = rgMap[composite];
    if (out.length === 0 && byComposite && typeof byComposite === 'object') {
      for (const k of Object.keys(byComposite as Record<string, unknown>)) {
        pushAsset((byComposite as Record<string, unknown>)[k]);
      }
    }

    if (out.length === 0) {
      for (const k of Object.keys(rgMap)) {
        const v = rgMap[k];
        if (!v || typeof v !== 'object') continue;
        const o = v as { appid?: unknown; contextid?: unknown; assetid?: unknown };
        if (o.assetid != null && String(o.appid) === appKey && String(o.contextid) === ctxKey) {
          out.push(v);
        }
      }
    }

    if (out.length === 0) {
      for (const k of Object.keys(rgMap)) {
        pushAsset(rgMap[k]);
      }
    }

    return out;
  }

  function filterForApp(items: unknown[], aid: number): unknown[] {
    const key = String(aid);
    return items.filter((x) => {
      if (!x || typeof x !== 'object') return false;
      const ap = (x as { appid?: unknown }).appid;
      return ap == null || String(ap) === key;
    });
  }

  function tryUserYouInventory(
    aid: number,
    ctxId: number
  ): { m_rgAssets?: Record<string, unknown>; m_rgDescriptions?: Record<string, unknown> } | null {
    const uw = (window as unknown as {
      UserYou?: {
        getInventory?: (a: number, b: number) => unknown;
        GetInventory?: (a: number, b: number) => unknown;
      };
    }).UserYou;
    const fn =
      uw && typeof uw.getInventory === 'function'
        ? uw.getInventory
        : uw && typeof uw.GetInventory === 'function'
          ? uw.GetInventory
          : null;
    if (!fn || !uw) return null;
    try {
      const res = fn.call(uw, aid, ctxId) as
        | { m_rgAssets?: Record<string, unknown>; m_rgDescriptions?: Record<string, unknown> }
        | null
        | undefined;
      if (!res || typeof res !== 'object') return null;
      return res;
    } catch {
      return null;
    }
  }

  const legacyDiag: string[] = [];
  const gaiAssetKeys =
    inv.m_rgAssets && typeof inv.m_rgAssets === 'object' ? Object.keys(inv.m_rgAssets as object).length : 0;
  const gaiDescKeys =
    inv.m_rgDescriptions && typeof inv.m_rgDescriptions === 'object'
      ? Object.keys(inv.m_rgDescriptions as object).length
      : 0;
  legacyDiag.push(`g_ActiveInventory assets=${gaiAssetKeys} desc=${gaiDescKeys} ctx=${Number(inv.m_contextid)}`);

  let collected: unknown[] = [];
  let mergedDesc: Record<string, unknown> = mergeDescMaps(
    inv.m_rgDescriptions as Record<string, unknown> | undefined
  );

  if (rg && typeof rg === 'object') {
    collected = collectAssetsFromRg(rg as Record<string, unknown>, appId, contextId);
  }

  const probeUserYou = (ctxProbe: number) => {
    const u = tryUserYouInventory(appId, ctxProbe);
    const uRg = u?.m_rgAssets;
    const n = uRg && typeof uRg === 'object' ? Object.keys(uRg).length : 0;
    legacyDiag.push(`UserYou ctx${ctxProbe}=${n}`);
    if (n > 0 && uRg) {
      const extra = filterForApp(collectAssetsFromRg(uRg as Record<string, unknown>, appId, ctxProbe), appId);
      collected = mergeCollectedUnique(collected, extra);
      mergedDesc = mergeDescMaps(mergedDesc, u?.m_rgDescriptions as Record<string, unknown> | undefined);
    }
  };

  // Always probe BOTH primary ctx (2) and trade-protected (16) on own inventory so we don't
  // silently drop tradable items just because UserYou.getInventory(730, 16) returned a non-empty bucket first.
  probeUserYou(contextId);
  if (isLikelyOwnInventory()) {
    probeUserYou(TRADE_PROTECTED_CTX);
  }

  const assets: RawSteamAsset[] = [];
  const descriptions: RawSteamDesc[] = [];
  const descKeys = new Set<string>();

  const rgDescMap = mergedDesc;

  const invForProps = w.g_ActiveInventory;
  const rgPropsMap =
    invForProps?.m_rgAssetProperties && typeof invForProps.m_rgAssetProperties === 'object'
      ? (invForProps.m_rgAssetProperties as Record<string, unknown>)
      : null;

  const legacyProps = (val: unknown): RawSteamAssetProperty[] | undefined => {
    if (!Array.isArray(val)) return undefined;
    const mapped = val.map(plainAssetProp).filter(Boolean) as RawSteamAssetProperty[];
    return mapped.length ? mapped : undefined;
  };

  for (const raw of collected) {
    const a = raw as Record<string, unknown>;
    const assetid = String(a.assetid);
    const classid = String(a.classid);
    const instanceid = a.instanceid != null ? String(a.instanceid) : '0';
    const amount = a.amount != null ? String(a.amount) : undefined;
    const ctxFromRow = a.contextid != null ? String(a.contextid) : String(contextId);
    let apFromRow = legacyProps(a.asset_properties);
    if (!apFromRow?.length && rgPropsMap) apFromRow = legacyProps(rgPropsMap[assetid]);
    assets.push({
      assetid,
      classid,
      instanceid,
      amount,
      contextid: ctxFromRow,
      asset_properties: apFromRow,
      actions: Array.isArray(a.actions) ? (a.actions as unknown[]) : undefined,
      market_actions: Array.isArray(a.market_actions) ? (a.market_actions as unknown[]) : undefined,
    });

    let descSrc: unknown = a.description ?? a.descriptions;
    if (!descSrc && rgDescMap && typeof rgDescMap === 'object') {
      const k1 = `${classid}_${instanceid}`;
      const k2 = `${classid}_0`;
      descSrc = (rgDescMap as Record<string, unknown>)[k1] ?? (rgDescMap as Record<string, unknown>)[k2];
    }
    let pd = descFromObj(descSrc);
    if (pd && !pd.asset_properties?.length && rgPropsMap) {
      const lp = legacyProps(rgPropsMap[assetid]);
      if (lp) pd = { ...pd, asset_properties: lp };
    }
    if (pd) {
      const k = `${pd.classid}_${pd.instanceid ?? '0'}`;
      if (!descKeys.has(k)) {
        descKeys.add(k);
        descriptions.push(pd);
      }
    }
  }

  if (assets.length === 0) {
    const keys = rg && typeof rg === 'object' ? Object.keys(rg as object) : [];
    const sample = keys.slice(0, 3).join(',') || '—';
    const descKeyCount =
      mergedDesc && typeof mergedDesc === 'object' ? Object.keys(mergedDesc).length : 0;
    const app = Number(inv.m_appid);
    const ctx = Number(inv.m_contextid);
    return {
      ok: false,
      error: `No CS2 items parsed. Collected raw=${collected.length}; m_rgAssets sample keys: ${keys.length} (${sample}); merged descriptions=${descKeyCount}; ${legacyDiag.join('; ')}; app ${app} ctx ${ctx}; LoadCompleteInventory: ${hadLoadComplete ? 'yes' : 'no'}; own_inventory: ${isLikelyOwnInventory() ? 'yes' : 'no'}`,
      assets: [],
      descriptions: [],
    };
  }

  return { ok: true, assets, descriptions };
}


function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error('Steam tab load timed out. Open steamcommunity.com in a tab and try again.')));
    }, timeoutMs);

    function onRemoved(removedTabId: number) {
      if (removedTabId !== tabId) return;
      finish(() =>
        reject(new Error('Steam tab was closed before it finished loading. Reopen Steam and try again.'))
      );
    }

    function onUpdated(id: number, info: { status?: string }, tab: { url?: string }) {
      if (id !== tabId || info.status !== 'complete') return;
      if (tab.url && tab.url.includes('steamcommunity.com')) {
        finish(() => resolve());
      }
    }

    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
    void browser.tabs.get(tabId)
      .then((tab) => {
        if (tab.status === 'complete' && tab.url?.includes('steamcommunity.com')) {
          finish(() => resolve());
        }
      })
      .catch(() => finish(() =>
        reject(new Error('Steam tab was closed before it finished loading. Reopen Steam and try again.'))
      ));
  });
}

function inventoryUrlForProfile(steamId64: string, appId: number, contextId: number): string {
  return `https://steamcommunity.com/profiles/${steamId64}/inventory/#${appId}_${contextId}`;
}

/** Always open a new steamcommunity tab (inactive) so the page loads fresh; caller must close when done. */
async function openFreshSteamCommunityTab(url: string): Promise<number> {
  const tab = await browser.tabs.create({ url, active: false });
  if (tab.id == null) throw new Error('Could not open a Steam tab');
  await waitForTabComplete(tab.id, LOAD_TIMEOUT_MS);
  await new Promise((r) => setTimeout(r, POST_LOAD_DELAY_MS));
  return tab.id;
}

async function closeTabSafe(tabId: number): Promise<void> {
  try {
    await browser.tabs.remove(tabId);
  } catch {
    // already closed or invalid
  }
}

export async function fetchInventoryViaTab(
  steamId64: string,
  appId: number,
  contextId: number,
  options: FetchInventoryViaTabOptions = {}
): Promise<{ assets: RawSteamAsset[]; descriptions: RawSteamDesc[] }> {
  const reportProgress = (phase: InventorySyncPhase) => {
    if (options.trackProgress !== false) setInventorySyncProgress(phase);
  };
  const targetUrl = inventoryUrlForProfile(steamId64, appId, contextId);
  reportProgress('opening_steam_tab');
  const tabId = await openFreshSteamCommunityTab(targetUrl);
  try {
    reportProgress('waiting_for_inventory_page');
    await new Promise((r) => setTimeout(r, 50));
    reportProgress('reading_inventory');

    let results;
    try {
      results = await withTimeout(
        browser.scripting.executeScript({
          target: { tabId },
          world: 'MAIN',
          func: readInventoryFromPageMain,
          args: [steamId64, appId, contextId],
        }),
        INVENTORY_READ_TIMEOUT_MS,
        'Steam inventory read timed out. Open steamcommunity.com, load your Counter-Strike inventory, then sync again.'
      );
    } catch (e) {
      const browserError = e instanceof Error ? e.message : String(e);
      if (/No tab|invalid tab|cannot access|closed|receiving end|message port/i.test(browserError)) {
        throw new Error(
          'Steam inventory tab was closed during sync. Reopen your CS2 inventory tab and try again.'
        );
      }
      throw new Error(browserError || 'Could not read Steam inventory from the tab.');
    }

    const result = results[0]?.result as PageInvResult | undefined;
    if (!result || !result.ok) {
      throw new Error((result as PageInvErr)?.error || 'Steam inventory read failed in tab');
    }
    return { assets: result.assets, descriptions: result.descriptions };
  } finally {
    await closeTabSafe(tabId);
  }
}

/** Read g_steamID from the page MAIN world (Steam sets this global when logged in). */
function readGSteamIdMain(): string {
  const w = window as unknown as { g_steamID?: string };
  return String(w.g_steamID ?? '').trim();
}

/** Fallback: fetch /my/home/ in tab context with cookies. */
async function fetchSteamIdFromHomeHtml(): Promise<string | null> {
  const res = await fetch('https://steamcommunity.com/my/home/', {
    credentials: 'include',
    redirect: 'follow',
  });
  if (!res.ok) return null;
  const html = await res.text();
  const m =
    html.match(/g_steamID\s*=\s*['"]?(\d{10,20})['"]?/i) ||
    html.match(/data-miniprofile\s*=\s*['"]?(\d{10,20})['"]?/i);
  return m?.[1] ?? null;
}

/**
 * Detect logged-in Steam ID64 using a steamcommunity.com tab (cookies available to fetches).
 */
export async function detectLoggedInSteamId64ViaTab(): Promise<string | null> {
  const homeUrl = 'https://steamcommunity.com/my/home/';
  const tabId = await openFreshSteamCommunityTab(homeUrl);
  try {
    const main = await browser.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: readGSteamIdMain,
    });
    let id = String(main[0]?.result ?? '').trim();
    if (id.length >= 10) return id;

    const iso = await browser.scripting.executeScript({
      target: { tabId },
      func: fetchSteamIdFromHomeHtml,
    });
    const fromHtml = iso[0]?.result as string | null | undefined;
    id = String(fromHtml ?? '').trim();
    return id.length >= 10 ? id : null;
  } finally {
    await closeTabSafe(tabId);
  }
}
