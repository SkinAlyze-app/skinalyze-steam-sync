/**
 * Best-effort Steam WebAPI trade offers + trade history using session-derived access token (browser only).
 * Paginates GetTradeOffers (cursor) and GetTradeHistory (start_after_tradeid) for historical coverage.
 * When the same `offer_id` is seen from multiple filter modes, `mergeNormalizedOffersPreservingItems`
 * keeps richer per-item description fields (names/icons) if a later page returns identifier-only rows.
 */

import { mergeNormalizedOffersPreservingItems } from '@/lib/trade-offer-steam-merge';
import { enrichSteamAssetMetadata } from '@/lib/inspect-metadata';
import type { RawSteamAsset, RawSteamAssetProperty, RawSteamDesc } from '@/lib/steam-tab-fetch';

type TradeOfferItem = {
  asset_id?: string;
  /** Steam economy icon path (e.g. `-9a81d...`) from GetTradeOffers descriptions */
  icon_url?: string;
  /** Larger icon when `icon_url` is missing (some description rows) */
  icon_url_large?: string;
  market_hash_name?: string;
  /** Display-oriented name from Steam when `market_hash_name` is absent */
  market_name?: string;
  name?: string;
  classid?: string;
  instanceid?: string;
  inspect_link?: string | null;
  inspect_payload_hash?: string | null;
  steam_item_id?: string | null;
  def_index?: number | null;
  paint_index?: number | null;
  paint_seed?: number | null;
  float_value?: number | null;
  rarity?: number | null;
  quality?: number | null;
  origin?: number | null;
  inventory?: number | null;
  stickers?: Array<{ slot: number | null; sticker_id: number | null; wear: number | null }>;
  keychains?: Array<{ slot: number | null; sticker_id: number | null; wear: number | null; pattern: number | null }>;
  inspect_metadata_source?: string;
  inspect_metadata_error?: string | null;
  inspect_decoded_at?: string | null;
};

export type NormalizedOffer = {
  offer_id: string;
  partner_steam_id64: string;
  offer_state: number;
  is_our_offer: boolean;
  message: string | null;
  expiration_time: string | null;
  time_created: string | null;
  time_updated: string | null;
  items_to_give: TradeOfferItem[];
  items_to_receive: TradeOfferItem[];
};

/** One asset line from GetTradeHistory (pre- and post-trade ids). */
export type TradeHistoryAsset = {
  asset_id: string;
  new_asset_id: string;
  app_id?: number;
};

export type NormalizedTradeHistory = {
  trade_id: string;
  partner_steam_id64: string;
  status: number;
  time_init: string | null;
  time_settlement: string | null;
  assets_given: TradeHistoryAsset[];
  assets_received: TradeHistoryAsset[];
};

export type TradeOffersFetchMeta = {
  /** Total HTTP pages pulled across all modes */
  pagesFetched: number;
  /** Total HTTP requests to GetTradeOffers */
  requestsMade: number;
  /** False if any mode hit the max-pages safety cap */
  completedNaturally: boolean;
  uniqueOfferCount: number;
  /** Which filter modes were queried */
  modesUsed: string[];
};

export type TradeHistoryFetchMeta = {
  pagesFetched: number;
  requestsMade: number;
  completedNaturally: boolean;
  tradeCount: number;
};

export type CombinedTradeSyncMeta = {
  offers: TradeOffersFetchMeta;
  history: TradeHistoryFetchMeta;
};

export type TradeOffersFetchProgress = {
  mode: string;
  pageInMode: number;
  offersAccumulated: number;
};

export type TradeSyncFetchProgress =
  | { phase: 'offers'; data: TradeOffersFetchProgress }
  | { phase: 'history'; page: number; tradesAccumulated: number };

function parseTokenAndSteamId(html: string): { token: string | null; steamId: string | null } {
  const tokenM = html.match(/data-loyalty_webapi_token\s*=\s*\"([^\"]+)\"/i);
  const steamM = html.match(/g_steamID\s*=\s*['\"]?(\d{10,20})['\"]?/i);
  return {
    token: tokenM?.[1]?.replace?.(/&quot;/g, '') ?? null,
    steamId: steamM?.[1] ?? null,
  };
}

async function loadSteamWebApiSession(): Promise<{ token: string; steamId: string } | null> {
  const home = await fetch('https://steamcommunity.com/my/home/', { credentials: 'include' });
  if (!home.ok) return null;
  const html = await home.text();
  const { token, steamId } = parseTokenAndSteamId(html);
  if (!token || !steamId) return null;
  return { token, steamId };
}

function accountIdToSteamId64(accountId: string): string {
  const n = BigInt(accountId);
  return (n + 76561197960265728n).toString();
}

function mergeOffer(existing: NormalizedOffer, incoming: NormalizedOffer): NormalizedOffer {
  return mergeNormalizedOffersPreservingItems(existing, incoming);
}

/** Match Steam `response.descriptions[]` to trade line items (classid + instanceid + appid). */
function tradeDescriptionLookupKey(appid: unknown, classid: string, instanceid: string): string {
  const a =
    appid !== undefined && appid !== null && String(appid).trim() !== ''
      ? String(appid)
      : '730';
  const i =
    instanceid !== undefined && instanceid !== null && String(instanceid).trim() !== ''
      ? String(instanceid)
      : '0';
  return `${a}:${classid}:${i}`;
}

function buildTradeDescriptionMap(descriptions: unknown): Map<string, Record<string, unknown>> {
  const m = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(descriptions)) return m;
  for (const d of descriptions) {
    if (!d || typeof d !== 'object') continue;
    const x = d as Record<string, unknown>;
    const cid = x.classid != null ? String(x.classid) : '';
    if (!cid) continue;
    const iid =
      x.instanceid != null && String(x.instanceid).trim() !== '' ? String(x.instanceid) : '0';
    m.set(tradeDescriptionLookupKey(x.appid ?? 730, cid, iid), x);
  }
  return m;
}

function mergeDescMaps(
  target: Map<string, Record<string, unknown>>,
  source: Map<string, Record<string, unknown>>
): void {
  for (const [k, v] of source) {
    target.set(k, v);
  }
}

function tradeDescToRawDesc(desc: Record<string, unknown>): RawSteamDesc | undefined {
  const classid = desc.classid != null ? String(desc.classid) : '';
  if (!classid) return undefined;
  const instanceid =
    desc.instanceid != null && String(desc.instanceid).trim() !== '' ? String(desc.instanceid) : '0';

  let asset_properties: RawSteamAssetProperty[] | undefined;
  const apRaw = desc.asset_properties;
  if (Array.isArray(apRaw)) {
    const mapped = apRaw
      .map((p) => {
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
        const row: RawSteamAssetProperty = { propertyid };
        if (typeof o.int_value === 'number' && Number.isFinite(o.int_value)) row.int_value = o.int_value;
        if (typeof o.float_value === 'number' && Number.isFinite(o.float_value)) row.float_value = o.float_value;
        if (o.string_value != null) row.string_value = String(o.string_value);
        return row;
      })
      .filter(Boolean) as RawSteamAssetProperty[];
    if (mapped.length) asset_properties = mapped;
  }

  const tags = Array.isArray(desc.tags)
    ? (desc.tags as { category: string; internal_name: string }[])
    : undefined;
  const owner_descriptions = Array.isArray(desc.owner_descriptions)
    ? (desc.owner_descriptions as { type?: string; value?: string }[])
    : undefined;

  return {
    classid,
    instanceid,
    name: typeof desc.name === 'string' ? desc.name : undefined,
    type: typeof desc.type === 'string' ? desc.type : undefined,
    market_hash_name: typeof desc.market_hash_name === 'string' ? desc.market_hash_name : undefined,
    market_name: typeof desc.market_name === 'string' ? desc.market_name : undefined,
    icon_url: typeof desc.icon_url === 'string' ? desc.icon_url : undefined,
    icon_url_large: typeof desc.icon_url_large === 'string' ? desc.icon_url_large : undefined,
    tradable: typeof desc.tradable === 'number' ? desc.tradable : undefined,
    marketable: typeof desc.marketable === 'number' ? desc.marketable : undefined,
    name_color: typeof desc.name_color === 'string' ? desc.name_color : undefined,
    tags,
    owner_descriptions,
    actions: Array.isArray(desc.actions) ? (desc.actions as unknown[]) : undefined,
    market_actions: Array.isArray(desc.market_actions) ? (desc.market_actions as unknown[]) : undefined,
    asset_properties,
  };
}

async function mapOffer(
  o: Record<string, unknown>,
  isOurOffer: boolean,
  descMap: Map<string, Record<string, unknown>>,
  mySteamId64: string
): Promise<NormalizedOffer | null> {
  const offerId = o.tradeofferid != null ? String(o.tradeofferid) : '';
  const accOther = o.accountid_other != null ? String(o.accountid_other) : '';
  const state = typeof o.trade_offer_state === 'number' ? o.trade_offer_state : Number(o.trade_offer_state);
  if (!offerId || !accOther || !Number.isFinite(state)) return null;
  // GetTradeOffers always returns a 32-bit account id for `accountid_other` (not SteamID64).
  const partner = accountIdToSteamId64(accOther.trim());

  const ownerForSide = (side: 'give' | 'receive'): string =>
    isOurOffer ? (side === 'give' ? mySteamId64 : partner) : side === 'give' ? partner : mySteamId64;

  const toItems = async (items: unknown, side: 'give' | 'receive'): Promise<TradeOfferItem[]> => {
    if (!Array.isArray(items)) return [];
    const ownerSteamId64 = ownerForSide(side);
    const out: TradeOfferItem[] = [];

    for (const it of items) {
      const x = it as Record<string, unknown>;
      const classid = x.classid != null ? String(x.classid) : '';
      const instanceid =
        x.instanceid != null && String(x.instanceid).trim() !== '' ? String(x.instanceid) : '0';
      const appid = x.appid ?? 730;
      let desc: Record<string, unknown> | undefined;
      if (classid) {
        desc = descMap.get(tradeDescriptionLookupKey(appid, classid, instanceid));
        if (!desc) {
          desc = descMap.get(tradeDescriptionLookupKey(730, classid, instanceid));
        }
      }

      let market_hash_name: string | undefined;
      let market_name: string | undefined;
      let name: string | undefined;
      let icon_url: string | undefined;
      let icon_url_large: string | undefined;
      if (desc) {
        if (typeof desc.market_hash_name === 'string' && desc.market_hash_name.trim()) {
          market_hash_name = desc.market_hash_name.trim();
        }
        if (typeof desc.market_name === 'string' && desc.market_name.trim()) {
          market_name = desc.market_name.trim();
        }
        if (typeof desc.name === 'string' && desc.name.trim()) {
          name = desc.name.trim();
        }
        if (typeof desc.icon_url === 'string' && desc.icon_url.trim()) {
          icon_url = desc.icon_url.trim();
        }
        if (typeof desc.icon_url_large === 'string' && desc.icon_url_large.trim()) {
          icon_url_large = desc.icon_url_large.trim();
        }
      }

      const rawDesc = desc ? tradeDescToRawDesc(desc) : undefined;
      const asset: RawSteamAsset = {
        assetid: x.assetid != null ? String(x.assetid) : '',
        classid,
        instanceid,
        contextid: x.contextid != null ? String(x.contextid) : '2',
      };

      let meta: Awaited<ReturnType<typeof enrichSteamAssetMetadata>>;
      try {
        meta = await enrichSteamAssetMetadata({ ownerSteamId64, asset, desc: rawDesc });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        meta = {
          inspect_link: null,
          inspect_payload_hash: null,
          steam_item_id: null,
          def_index: null,
          paint_index: null,
          paint_seed: null,
          float_value: null,
          rarity: null,
          quality: null,
          origin: null,
          inventory: null,
          stickers: [],
          keychains: [],
          inspect_metadata_source: 'error',
          inspect_metadata_error: msg.slice(0, 200),
          inspect_decoded_at: null,
        };
      }

      out.push({
        asset_id: x.assetid != null ? String(x.assetid) : undefined,
        classid: classid || undefined,
        instanceid: instanceid !== '0' ? instanceid : undefined,
        market_hash_name,
        market_name,
        name,
        icon_url,
        icon_url_large,
        inspect_link: meta.inspect_link,
        inspect_payload_hash: meta.inspect_payload_hash,
        steam_item_id: meta.steam_item_id,
        def_index: meta.def_index,
        paint_index: meta.paint_index,
        paint_seed: meta.paint_seed,
        float_value: meta.float_value,
        rarity: meta.rarity,
        quality: meta.quality,
        origin: meta.origin,
        inventory: meta.inventory,
        stickers: meta.stickers,
        keychains: meta.keychains,
        inspect_metadata_source: meta.inspect_metadata_source,
        inspect_metadata_error: meta.inspect_metadata_error,
        inspect_decoded_at: meta.inspect_decoded_at,
      });
    }
    return out;
  };

  return {
    offer_id: offerId,
    partner_steam_id64: partner,
    offer_state: state,
    is_our_offer: isOurOffer,
    message: typeof o.message === 'string' ? o.message : null,
    expiration_time: typeof o.expiration_time === 'number' ? new Date(o.expiration_time * 1000).toISOString() : null,
    time_created: typeof o.time_created === 'number' ? new Date(o.time_created * 1000).toISOString() : null,
    time_updated: typeof o.time_update === 'number' ? new Date(o.time_update * 1000).toISOString() : null,
    items_to_give: await toItems(o.items_to_give, 'give'),
    items_to_receive: await toItems(o.items_to_receive, 'receive'),
  };
}

function normalizeCursor(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

type SteamGetTradeOffersResponse = {
  response?: {
    trade_offers_sent?: Record<string, unknown>[];
    trade_offers_received?: Record<string, unknown>[];
    descriptions?: unknown[];
    next_cursor?: unknown;
  };
};

async function fetchOneTradeOffersPage(
  token: string,
  opts: {
    active_only: boolean;
    historical_only: boolean;
    time_historical_cutoff_sec: number;
    cursor: number;
  }
): Promise<SteamGetTradeOffersResponse['response'] | null> {
  const params = new URLSearchParams({
    access_token: token,
    get_sent_offers: 'true',
    get_received_offers: 'true',
    get_descriptions: 'true',
    language: 'english',
    active_only: opts.active_only ? 'true' : 'false',
    historical_only: opts.historical_only ? 'true' : 'false',
    time_historical_cutoff: String(opts.time_historical_cutoff_sec),
    server_time: String(Math.floor(Date.now() / 1000)),
    cursor: String(opts.cursor),
  });

  const url = `https://api.steampowered.com/IEconService/GetTradeOffers/v1/?${params.toString()}`;
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) return null;
  const j = (await res.json()) as SteamGetTradeOffersResponse;
  return j.response ?? null;
}

/**
 * Pull one logical mode (active/historical flags) with full cursor pagination.
 * Collects raw offer rows + merged descriptions for the mode only; callers merge
 * descriptions across modes then run `mapOffer` with the global map.
 */
async function fetchOffersForModeCollect(
  token: string,
  label: string,
  activeOnly: boolean,
  historicalOnly: boolean,
  timeHistoricalCutoffSec: number,
  maxPages: number,
  onProgress?: (p: TradeOffersFetchProgress) => void
): Promise<{
  modeDesc: Map<string, Record<string, unknown>>;
  sent: Map<string, Record<string, unknown>>;
  received: Map<string, Record<string, unknown>>;
  pages: number;
  requests: number;
  capped: boolean;
}> {
  const modeDesc = new Map<string, Record<string, unknown>>();
  const sent = new Map<string, Record<string, unknown>>();
  const received = new Map<string, Record<string, unknown>>();
  let cursor = 0;
  let pages = 0;
  let requests = 0;
  let capped = false;

  for (;;) {
    if (pages >= maxPages) {
      capped = true;
      break;
    }

    const resp = await fetchOneTradeOffersPage(token, {
      active_only: activeOnly,
      historical_only: historicalOnly,
      time_historical_cutoff_sec: timeHistoricalCutoffSec,
      cursor,
    });
    requests++;
    pages++;

    if (!resp) break;

    mergeDescMaps(modeDesc, buildTradeDescriptionMap(resp.descriptions));

    for (const o of resp.trade_offers_sent ?? []) {
      const rec = o as Record<string, unknown>;
      const oid = rec.tradeofferid != null ? String(rec.tradeofferid) : '';
      if (oid) sent.set(oid, rec);
    }
    for (const o of resp.trade_offers_received ?? []) {
      const rec = o as Record<string, unknown>;
      const oid = rec.tradeofferid != null ? String(rec.tradeofferid) : '';
      if (oid) received.set(oid, rec);
    }

    onProgress?.({
      mode: label,
      pageInMode: pages,
      offersAccumulated: new Set([...sent.keys(), ...received.keys()]).size,
    });

    const next = normalizeCursor(resp.next_cursor);
    if (next === 0) break;
    cursor = next;
  }

  return { modeDesc, sent, received, pages, requests, capped };
}

const MAX_PAGES_PER_MODE = 150;
const MAX_HISTORY_PAGES = 200;
const MAX_TRADES_PER_HISTORY_PAGE = 500;

type TradeHistoryCursor = {
  tradeId: string;
  timeInit: string;
};

function mapHistoryAssets(arr: unknown): TradeHistoryAsset[] {
  if (arr == null) return [];
  const rawList = Array.isArray(arr)
    ? arr
    : typeof arr === 'object'
      ? Object.values(arr as Record<string, unknown>)
      : [];
  const out: TradeHistoryAsset[] = [];
  for (const it of rawList) {
    const x = it as Record<string, unknown>;
    const aid = x.assetid != null ? String(x.assetid) : x.asset_id != null ? String(x.asset_id) : '';
    const nid =
      x.new_assetid != null ? String(x.new_assetid) : x.new_asset_id != null ? String(x.new_asset_id) : '';
    if (!aid && !nid) continue;
    const appRaw = x.appid;
    const app_id =
      typeof appRaw === 'number'
        ? appRaw
        : appRaw != null
          ? Number(appRaw)
          : undefined;
    out.push({
      asset_id: aid,
      new_asset_id: nid,
      app_id: Number.isFinite(app_id) ? app_id : undefined,
    });
  }
  return out;
}

function mapTradeHistoryRow(t: Record<string, unknown>): NormalizedTradeHistory | null {
  const tradeId = t.tradeid != null ? String(t.tradeid) : '';
  const otherRaw = t.steamid_other != null ? String(t.steamid_other) : '';
  const status = typeof t.status === 'number' ? t.status : Number(t.status);
  if (!tradeId || !otherRaw || !Number.isFinite(status)) return null;

  const otherTrim = otherRaw.trim();
  const isSteamId64 = /^7656119\d{10}$/.test(otherTrim);
  const partner = isSteamId64 ? otherTrim : accountIdToSteamId64(otherTrim);

  const ti = t.time_init;
  const ts = t.time_settlement;
  const timeInit =
    typeof ti === 'number' && Number.isFinite(ti) ? new Date(ti * 1000).toISOString() : null;
  let timeSettlement: string | null = null;
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    timeSettlement = new Date(ts * 1000).toISOString();
  } else if (ts != null && String(ts).trim() !== '') {
    const n = Number(ts);
    if (Number.isFinite(n)) timeSettlement = new Date(n * 1000).toISOString();
  }

  return {
    trade_id: tradeId,
    partner_steam_id64: partner,
    status,
    time_init: timeInit,
    time_settlement: timeSettlement,
    assets_given: mapHistoryAssets(t.assets_given),
    assets_received: mapHistoryAssets(t.assets_received),
  };
}

function readTradeHistoryCursor(t: Record<string, unknown>): TradeHistoryCursor | null {
  const tradeId = t.tradeid != null ? String(t.tradeid).trim() : '';
  if (!tradeId) return null;

  const rawTime = t.time_init;
  const parsedTime =
    typeof rawTime === 'number' && Number.isFinite(rawTime)
      ? Math.trunc(rawTime)
      : rawTime != null && String(rawTime).trim() !== ''
        ? Math.trunc(Number(rawTime))
        : NaN;

  return {
    tradeId,
    timeInit: Number.isFinite(parsedTime) ? String(parsedTime) : '',
  };
}

type SteamGetTradeHistoryResponse = {
  response?: {
    trades?: Record<string, unknown>[];
    more?: boolean;
  };
};

export async function fetchTradeHistoryWithToken(
  token: string,
  onProgress?: (p: { page: number; tradesAccumulated: number }) => void
): Promise<{ trades: NormalizedTradeHistory[]; meta: TradeHistoryFetchMeta }> {
  const byId = new Map<string, NormalizedTradeHistory>();
  const pageSignatures = new Set<string>();
  let pages = 0;
  let requests = 0;
  let completedNaturally = true;
  let cursor: TradeHistoryCursor | null = null;

  for (;;) {
    if (pages >= MAX_HISTORY_PAGES) {
      completedNaturally = false;
      break;
    }

    const params = new URLSearchParams({
      access_token: token,
      max_trades: String(MAX_TRADES_PER_HISTORY_PAGE),
      // `true` so trades include `assets_given` / `assets_received` with `new_assetid` (required for inventory↔history linking).
      get_descriptions: 'true',
      language: 'english',
    });
    if (cursor?.tradeId) params.set('start_after_tradeid', cursor.tradeId);
    if (cursor?.timeInit) params.set('start_after_time', cursor.timeInit);

    const url = `https://api.steampowered.com/IEconService/GetTradeHistory/v1/?${params.toString()}`;
    const res = await fetch(url, { credentials: 'omit' });
    requests++;
    pages++;

    if (!res.ok) {
      completedNaturally = false;
      break;
    }

    const j = (await res.json()) as SteamGetTradeHistoryResponse;
    const resp = j.response;
    const batch = resp?.trades ?? [];
    if (batch.length === 0) {
      if (Boolean(resp?.more)) completedNaturally = false;
      break;
    }

    let nextCursor: TradeHistoryCursor | null = null;
    let newRows = 0;
    const pageTradeIds: string[] = [];
    for (const raw of batch) {
      const rec = raw as Record<string, unknown>;
      const cursorCandidate = readTradeHistoryCursor(rec);
      if (cursorCandidate) {
        pageTradeIds.push(cursorCandidate.tradeId);
        nextCursor = cursorCandidate;
      }

      const row = mapTradeHistoryRow(rec);
      if (row) {
        if (!byId.has(row.trade_id)) newRows++;
        byId.set(row.trade_id, row);
      }
    }

    onProgress?.({ page: pages, tradesAccumulated: byId.size });

    const more = Boolean(resp?.more);
    if (!more) break;

    const pageSignature = pageTradeIds.join('|');
    const repeatedPage = pageSignature !== '' && pageSignatures.has(pageSignature);
    if (pageSignature) pageSignatures.add(pageSignature);

    const cursorStalled =
      cursor != null &&
      nextCursor != null &&
      cursor.tradeId === nextCursor.tradeId &&
      (!nextCursor.timeInit || cursor.timeInit === nextCursor.timeInit);

    // Steam can repeat the same page while still claiming `more`; stop before that becomes a 429 loop.
    if (!nextCursor || newRows === 0 || repeatedPage || cursorStalled) {
      completedNaturally = false;
      break;
    }

    cursor = nextCursor;
  }

  const trades = Array.from(byId.values());
  return {
    trades,
    meta: {
      pagesFetched: pages,
      requestsMade: requests,
      completedNaturally,
      tradeCount: trades.length,
    },
  };
}

const emptyOffersMeta: TradeOffersFetchMeta = {
  pagesFetched: 0,
  requestsMade: 0,
  completedNaturally: true,
  uniqueOfferCount: 0,
  modesUsed: [],
};

const emptyHistoryMeta: TradeHistoryFetchMeta = {
  pagesFetched: 0,
  requestsMade: 0,
  completedNaturally: true,
  tradeCount: 0,
};

async function fetchTradeOffersWithToken(
  token: string,
  mySteamId64: string,
  onProgress?: (p: TradeOffersFetchProgress) => void
): Promise<{ offers: NormalizedOffer[]; meta: TradeOffersFetchMeta }> {
  const futureCutoff = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

  const modes: Array<{
    label: string;
    activeOnly: boolean;
    historicalOnly: boolean;
    timeCutoff: number;
  }> = [
    { label: 'all_inactive_and_active', activeOnly: false, historicalOnly: false, timeCutoff: 0 },
    { label: 'historical_only', activeOnly: false, historicalOnly: true, timeCutoff: 0 },
    { label: 'active_with_cutoff', activeOnly: true, historicalOnly: false, timeCutoff: futureCutoff },
  ];

  const globalDesc = new Map<string, Record<string, unknown>>();
  const allSent = new Map<string, Record<string, unknown>>();
  const allReceived = new Map<string, Record<string, unknown>>();
  let totalPages = 0;
  let totalRequests = 0;
  let anyCapped = false;
  const modesUsed: string[] = [];

  for (const m of modes) {
    modesUsed.push(m.label);
    const { modeDesc, sent, received, pages, requests, capped } = await fetchOffersForModeCollect(
      token,
      m.label,
      m.activeOnly,
      m.historicalOnly,
      m.timeCutoff,
      MAX_PAGES_PER_MODE,
      onProgress
    );
    totalPages += pages;
    totalRequests += requests;
    if (capped) anyCapped = true;

    mergeDescMaps(globalDesc, modeDesc);
    for (const [id, o] of sent) {
      allSent.set(id, o);
    }
    for (const [id, o] of received) {
      allReceived.set(id, o);
    }
  }

  const merged = new Map<string, NormalizedOffer>();
  for (const [id, o] of allSent) {
    const n = await mapOffer(o, true, globalDesc, mySteamId64);
    if (!n) continue;
    const prev = merged.get(id);
    merged.set(id, prev ? mergeOffer(prev, n) : n);
  }
  for (const [id, o] of allReceived) {
    const n = await mapOffer(o, false, globalDesc, mySteamId64);
    if (!n) continue;
    const prev = merged.get(id);
    merged.set(id, prev ? mergeOffer(prev, n) : n);
  }

  const offers = Array.from(merged.values());
  return {
    offers,
    meta: {
      pagesFetched: totalPages,
      requestsMade: totalRequests,
      completedNaturally: !anyCapped,
      uniqueOfferCount: offers.length,
      modesUsed,
    },
  };
}

/**
 * Single home-page token load, then offers + trade history for extension sync.
 */
export async function fetchTradeOffersAndHistoryForSync(
  onProgress?: (p: TradeSyncFetchProgress) => void
): Promise<{
  offers: NormalizedOffer[];
  trade_history: NormalizedTradeHistory[];
  meta: CombinedTradeSyncMeta;
}> {
  const session = await loadSteamWebApiSession();
  if (!session) {
    return {
      offers: [],
      trade_history: [],
      meta: { offers: emptyOffersMeta, history: emptyHistoryMeta },
    };
  }

  const offersResult = await fetchTradeOffersWithToken(session.token, session.steamId, (data) =>
    onProgress?.({ phase: 'offers', data })
  );

  const historyResult = await fetchTradeHistoryWithToken(session.token, ({ page, tradesAccumulated }) =>
    onProgress?.({ phase: 'history', page, tradesAccumulated })
  );

  return {
    offers: offersResult.offers,
    trade_history: historyResult.trades,
    meta: { offers: offersResult.meta, history: historyResult.meta },
  };
}

/**
 * Fetches trade offers with cursor pagination across multiple Steam filter modes, merged and deduped by offer_id.
 */
export async function fetchTradeOffersViaWebApi(
  onProgress?: (p: TradeOffersFetchProgress) => void
): Promise<{ offers: NormalizedOffer[]; meta: TradeOffersFetchMeta }> {
  const session = await loadSteamWebApiSession();
  if (!session) {
    return { offers: [], meta: emptyOffersMeta };
  }
  return fetchTradeOffersWithToken(session.token, session.steamId, onProgress);
}
