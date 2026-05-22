/**
 * Pure helpers to merge Steam GetTradeOffers snapshots without losing per-item
 * description fields when deduping by offer_id across modes/pages.
 */

export type TradeOfferSticker = { slot: number | null; sticker_id: number | null; wear: number | null };
export type TradeOfferKeychain = {
  slot: number | null;
  sticker_id: number | null;
  wear: number | null;
  pattern: number | null;
};

export type TradeOfferItemMerge = {
  asset_id?: string;
  icon_url?: string;
  icon_url_large?: string;
  market_hash_name?: string;
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
  stickers?: TradeOfferSticker[];
  keychains?: TradeOfferKeychain[];
  inspect_metadata_source?: string;
  inspect_metadata_error?: string | null;
  inspect_decoded_at?: string | null;
};

export type NormalizedOfferMerge = {
  offer_id: string;
  partner_steam_id64: string;
  offer_state: number;
  is_our_offer: boolean;
  message: string | null;
  expiration_time: string | null;
  time_created: string | null;
  time_updated: string | null;
  items_to_give: TradeOfferItemMerge[];
  items_to_receive: TradeOfferItemMerge[];
};

function trimStr(v?: string): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

function pickFinite(a?: number | null, b?: number | null): number | undefined {
  if (typeof a === 'number' && Number.isFinite(a)) return a;
  if (typeof b === 'number' && Number.isFinite(b)) return b;
  return undefined;
}

function pickNullableStr(a?: string | null, b?: string | null): string | null | undefined {
  if (typeof a === 'string' && a.length > 0) return a;
  if (typeof b === 'string' && b.length > 0) return b;
  if (a === null || b === null) return a ?? b;
  return trimStr(a ?? undefined) ?? trimStr(b ?? undefined);
}

function mergeStickerLists(
  a?: TradeOfferSticker[] | null,
  b?: TradeOfferSticker[] | null
): TradeOfferSticker[] | undefined {
  const la = Array.isArray(a) ? a.length : 0;
  const lb = Array.isArray(b) ? b.length : 0;
  if (la >= lb && la > 0) return a ?? undefined;
  if (lb > 0) return b ?? undefined;
  return undefined;
}

function mergeKeychainLists(
  a?: TradeOfferKeychain[] | null,
  b?: TradeOfferKeychain[] | null
): TradeOfferKeychain[] | undefined {
  const la = Array.isArray(a) ? a.length : 0;
  const lb = Array.isArray(b) ? b.length : 0;
  if (la >= lb && la > 0) return a ?? undefined;
  if (lb > 0) return b ?? undefined;
  return undefined;
}

const SOURCE_RANK: Record<string, number> = {
  none: 0,
  asset_properties: 1,
  error: 2,
  inspect_link: 3,
};

function pickInspectSource(a?: string | null, b?: string | null): string | undefined {
  const sa = typeof a === 'string' ? a : '';
  const sb = typeof b === 'string' ? b : '';
  const ra = SOURCE_RANK[sa] ?? -1;
  const rb = SOURCE_RANK[sb] ?? -1;
  if (rb > ra) return sb || undefined;
  if (ra > rb) return sa || undefined;
  return sa || sb || undefined;
}

/** Merge two line items: keep any non-empty descriptive field from either side. */
export function mergeTradeOfferItemPair(a: TradeOfferItemMerge, b: TradeOfferItemMerge): TradeOfferItemMerge {
  const pick = (x?: string, y?: string) => trimStr(x) ?? trimStr(y);
  return {
    asset_id: pick(a.asset_id, b.asset_id),
    classid: pick(a.classid, b.classid),
    instanceid: pick(a.instanceid, b.instanceid),
    market_hash_name: pick(a.market_hash_name, b.market_hash_name),
    market_name: pick(a.market_name, b.market_name),
    name: pick(a.name, b.name),
    icon_url: pick(a.icon_url, b.icon_url),
    icon_url_large: pick(a.icon_url_large, b.icon_url_large),
    inspect_link: pickNullableStr(a.inspect_link, b.inspect_link) ?? undefined,
    inspect_payload_hash: pickNullableStr(a.inspect_payload_hash, b.inspect_payload_hash) ?? undefined,
    steam_item_id: pickNullableStr(a.steam_item_id, b.steam_item_id) ?? undefined,
    def_index: pickFinite(a.def_index, b.def_index),
    paint_index: pickFinite(a.paint_index, b.paint_index),
    paint_seed: pickFinite(a.paint_seed, b.paint_seed),
    float_value: pickFinite(a.float_value, b.float_value),
    rarity: pickFinite(a.rarity, b.rarity),
    quality: pickFinite(a.quality, b.quality),
    origin: pickFinite(a.origin, b.origin),
    inventory: pickFinite(a.inventory, b.inventory),
    stickers: mergeStickerLists(a.stickers, b.stickers),
    keychains: mergeKeychainLists(a.keychains, b.keychains),
    inspect_metadata_source: pickInspectSource(a.inspect_metadata_source, b.inspect_metadata_source),
    inspect_metadata_error: pickNullableStr(a.inspect_metadata_error, b.inspect_metadata_error) ?? undefined,
    inspect_decoded_at: pickNullableStr(a.inspect_decoded_at, b.inspect_decoded_at) ?? undefined,
  };
}

function offerSortKey(o: NormalizedOfferMerge): number {
  return Date.parse(o.time_updated || o.time_created || '') || 0;
}

/**
 * Zip-merge by index (helps items without asset_id), then fold all rows with the
 * same asset_id so order swaps between API responses still preserve metadata.
 */
export function mergeTradeOfferItemLists(primary: TradeOfferItemMerge[], secondary: TradeOfferItemMerge[]): TradeOfferItemMerge[] {
  const byAsset = new Map<string, TradeOfferItemMerge>();
  for (const it of [...primary, ...secondary]) {
    const id = trimStr(it.asset_id);
    if (!id) continue;
    const cur = byAsset.get(id);
    byAsset.set(id, cur ? mergeTradeOfferItemPair(cur, it) : { ...it });
  }

  const len = Math.max(primary.length, secondary.length);
  const zipped: TradeOfferItemMerge[] = [];
  for (let i = 0; i < len; i++) {
    const p = primary[i];
    const s = secondary[i];
    if (p && s) zipped.push(mergeTradeOfferItemPair(p, s));
    else if (p) zipped.push({ ...p });
    else zipped.push({ ...s! });
  }

  return zipped.map((it) => {
    const id = trimStr(it.asset_id);
    if (!id) return it;
    const g = byAsset.get(id);
    return g ? mergeTradeOfferItemPair(it, g) : it;
  });
}

/**
 * Pick scalar fields from the newer snapshot, but merge item arrays so richer
 * description data from an older page is not discarded.
 */
export function mergeNormalizedOffersPreservingItems(
  existing: NormalizedOfferMerge,
  incoming: NormalizedOfferMerge
): NormalizedOfferMerge {
  const incomingNewer = offerSortKey(incoming) >= offerSortKey(existing);
  const newer = incomingNewer ? incoming : existing;
  const older = incomingNewer ? existing : incoming;

  return {
    ...newer,
    items_to_give: mergeTradeOfferItemLists(newer.items_to_give, older.items_to_give),
    items_to_receive: mergeTradeOfferItemLists(newer.items_to_receive, older.items_to_receive),
  };
}
