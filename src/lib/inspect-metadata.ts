/**
 * Local-first CS2 inspect metadata: resolve Steam inspect templates, decode with @csfloat/cs2-inspect-serializer.
 * No external float APIs; no cookies/tokens.
 */

import { decodeLink, type CEconItemPreviewDataBlock } from '@csfloat/cs2-inspect-serializer';
import type { RawSteamAsset, RawSteamAssetProperty, RawSteamDesc } from '@/lib/steam-tab-fetch';

export type AssetProperty = RawSteamAssetProperty;

export type InspectSticker = {
  slot: number | null;
  sticker_id: number | null;
  wear: number | null;
};

export type InspectKeychain = {
  slot: number | null;
  sticker_id: number | null;
  wear: number | null;
  pattern: number | null;
};

export type InspectMetadataSource = 'inspect_link' | 'asset_properties' | 'none' | 'error';

/** JSON-serializable decoded + display fields for sync payloads. */
export type DecodedInspectMetadata = {
  inspect_link: string | null;
  inspect_payload_hash: string | null;
  steam_item_id: string | null;
  def_index: number | null;
  paint_index: number | null;
  paint_seed: number | null;
  float_value: number | null;
  rarity: number | null;
  quality: number | null;
  origin: number | null;
  inventory: number | null;
  stickers: InspectSticker[];
  keychains: InspectKeychain[];
  inspect_metadata_source: InspectMetadataSource;
  inspect_metadata_error: string | null;
  inspect_decoded_at: string | null;
};

const CACHE_PREFIX = 'inspect_meta_v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5000;

type CacheRow = { v: DecodedInspectMetadata; t: number };

function finiteOrNull(n: unknown): number | null {
  if (typeof n === 'number' && Number.isFinite(n)) return n;
  return null;
}

/** Merge asset + description property rows; later wins on same propertyid (asset preferred if passed second). */
export function extractAssetProperties(
  asset: { asset_properties?: RawSteamAssetProperty[] },
  desc?: { asset_properties?: RawSteamAssetProperty[] }
): RawSteamAssetProperty[] {
  const fromDesc = desc?.asset_properties ?? [];
  const fromAsset = asset.asset_properties ?? [];
  const map = new Map<number, RawSteamAssetProperty>();
  for (const p of fromDesc) {
    if (p.propertyid != null && Number.isFinite(p.propertyid)) map.set(p.propertyid, p);
  }
  for (const p of fromAsset) {
    if (p.propertyid != null && Number.isFinite(p.propertyid)) map.set(p.propertyid, p);
  }
  return [...map.values()];
}

export function resolveInspectLink(
  template: string,
  ctx: {
    ownerSteamId64: string;
    assetId: string;
    contextId: string | number;
    appId: string | number;
    assetProperties: RawSteamAssetProperty[];
  }
): string {
  const prop6 = ctx.assetProperties.find((p) => p.propertyid === 6);
  const token = prop6?.string_value != null ? String(prop6.string_value) : '';
  return template
    .replace(/%owner_steamid%/gi, ctx.ownerSteamId64)
    .replace(/%assetid%/gi, String(ctx.assetId))
    .replace(/%contextid%/gi, String(ctx.contextId))
    .replace(/%appid%/gi, String(ctx.appId))
    .replace(/%propid:6%/gi, token);
}

function extractHexFromInspectLink(link: string): string | null {
  try {
    const decoded = decodeURIComponent(link.trim().replace(/\+/g, ' '));
    const m = decoded.match(/csgo_econ_action_preview\s+([0-9A-F]+)/i);
    return m?.[1] ? m[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

async function sha256HexUtf8(text: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function decodeInspectLinkSafe(
  link: string
): { ok: true; econ: CEconItemPreviewDataBlock } | { ok: false; error: string } {
  try {
    const econ = decodeLink(link);
    return { ok: true, econ };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.slice(0, 200) };
  }
}

function firstActionLink(desc?: RawSteamDesc): string | null {
  if (!desc) return null;
  const pick = (actions: unknown[] | undefined): string | null => {
    if (!Array.isArray(actions) || actions.length === 0) return null;
    const a0 = actions[0];
    if (!a0 || typeof a0 !== 'object') return null;
    const link = (a0 as { link?: string }).link;
    if (typeof link === 'string' && /csgo_econ_action_preview/i.test(link)) return link;
    return null;
  };
  return pick(desc.actions as unknown[] | undefined) ?? pick(desc.market_actions as unknown[] | undefined);
}

function floatFromProps(props: RawSteamAssetProperty[]): number | null {
  const p = props.find((x) => x.propertyid === 2);
  return finiteOrNull(p?.float_value);
}

function seedFromProps(props: RawSteamAssetProperty[]): number | null {
  const p = props.find((x) => x.propertyid === 1);
  const iv = finiteOrNull(p?.int_value);
  if (iv != null) return iv;
  if (p?.string_value != null) {
    const n = Number.parseInt(String(p.string_value), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function mapEconToPartial(econ: CEconItemPreviewDataBlock): Omit<
  DecodedInspectMetadata,
  | 'inspect_link'
  | 'inspect_payload_hash'
  | 'inspect_metadata_source'
  | 'inspect_metadata_error'
  | 'inspect_decoded_at'
> {
  const stickers: InspectSticker[] = (econ.stickers ?? []).map((s) => ({
    slot: s.slot ?? null,
    sticker_id: s.stickerId ?? null,
    wear: finiteOrNull(s.wear),
  }));
  const keychains: InspectKeychain[] = (econ.keychains ?? []).map((k) => ({
    slot: k.slot ?? null,
    sticker_id: k.stickerId ?? null,
    wear: finiteOrNull(k.wear),
    pattern: k.pattern ?? null,
  }));
  let steam_item_id: string | null = null;
  if (econ.itemid !== undefined) {
    try {
      steam_item_id = typeof econ.itemid === 'bigint' ? econ.itemid.toString() : String(econ.itemid);
    } catch {
      steam_item_id = null;
    }
  }
  return {
    steam_item_id,
    def_index: econ.defindex ?? null,
    paint_index: econ.paintindex ?? null,
    paint_seed: econ.paintseed ?? null,
    float_value: finiteOrNull(econ.paintwear as unknown as number),
    rarity: econ.rarity ?? null,
    quality: econ.quality ?? null,
    origin: econ.origin ?? null,
    inventory: econ.inventory ?? null,
    stickers,
    keychains,
  };
}

function emptyMetadata(): DecodedInspectMetadata {
  return {
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
    inspect_metadata_source: 'none',
    inspect_metadata_error: null,
    inspect_decoded_at: null,
  };
}

async function cacheGet(hash: string): Promise<DecodedInspectMetadata | null> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
  const key = `${CACHE_PREFIX}:${hash}`;
  const row = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get([key], (r) => resolve(r as Record<string, unknown>));
  });
  const raw = row[key] as CacheRow | undefined;
  if (!raw || typeof raw.t !== 'number' || !raw.v) return null;
  if (Date.now() - raw.t > CACHE_TTL_MS) {
    chrome.storage.local.remove(key);
    return null;
  }
  return raw.v;
}

async function cacheSet(hash: string, v: DecodedInspectMetadata): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  const key = `${CACHE_PREFIX}:${hash}`;
  const row: CacheRow = { v, t: Date.now() };
  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ [key]: row }, () => resolve());
  });
  await cachePruneIfNeeded();
}

async function cachePruneIfNeeded(): Promise<void> {
  const all = await new Promise<Record<string, unknown>>((resolve) => {
    chrome.storage.local.get(null, (r) => resolve(r as Record<string, unknown>));
  });
  const keys = Object.keys(all).filter((k) => k.startsWith(`${CACHE_PREFIX}:`));
  if (keys.length <= CACHE_MAX_ENTRIES) return;
  const scored = keys
    .map((k) => {
      const e = all[k] as CacheRow | undefined;
      return { k, t: e?.t ?? 0 };
    })
    .sort((a, b) => a.t - b.t);
  const remove = scored.slice(0, Math.max(0, scored.length - CACHE_MAX_ENTRIES)).map((x) => x.k);
  if (remove.length) await new Promise<void>((resolve) => chrome.storage.local.remove(remove, () => resolve()));
}

export async function enrichSteamAssetMetadata(args: {
  ownerSteamId64: string;
  asset: RawSteamAsset;
  desc?: RawSteamDesc;
}): Promise<DecodedInspectMetadata> {
  const { ownerSteamId64, asset, desc } = args;
  const props = extractAssetProperties(asset, desc);
  const template = firstActionLink(desc);
  const contextId =
    asset.contextid != null && String(asset.contextid).trim() !== '' ? asset.contextid : '2';
  const appId = 730;

  let resolvedLink: string | null = null;
  if (template) {
    resolvedLink = resolveInspectLink(template, {
      ownerSteamId64: ownerSteamId64.trim(),
      assetId: asset.assetid,
      contextId,
      appId,
      assetProperties: props,
    });
  }

  const hex = resolvedLink ? extractHexFromInspectLink(resolvedLink) : null;
  const inspect_payload_hash = hex ? await sha256HexUtf8(hex) : null;

  if (inspect_payload_hash) {
    const cached = await cacheGet(inspect_payload_hash);
    if (cached) {
      return {
        ...cached,
        inspect_link: resolvedLink,
        inspect_payload_hash,
      };
    }
  }

  const base = emptyMetadata();
  base.inspect_link = resolvedLink;
  base.inspect_payload_hash = inspect_payload_hash;

  const fallbackFloat = floatFromProps(props);
  const fallbackSeed = seedFromProps(props);

  if (resolvedLink && hex) {
    const dec = decodeInspectLinkSafe(resolvedLink);
    if (dec.ok) {
      const partial = mapEconToPartial(dec.econ);
      const merged: DecodedInspectMetadata = {
        ...base,
        ...partial,
        paint_seed: partial.paint_seed ?? fallbackSeed,
        float_value: partial.float_value ?? fallbackFloat,
        inspect_metadata_source: 'inspect_link',
        inspect_metadata_error: null,
        inspect_decoded_at: new Date().toISOString(),
      };
      if (inspect_payload_hash) await cacheSet(inspect_payload_hash, merged);
      return merged;
    }
    const err = dec.error;
    const mergedErr: DecodedInspectMetadata = {
      ...base,
      float_value: fallbackFloat,
      paint_seed: fallbackSeed,
      inspect_metadata_source: 'error',
      inspect_metadata_error: err,
      inspect_decoded_at: null,
    };
    return mergedErr;
  }

  if (fallbackFloat != null || fallbackSeed != null) {
    return {
      ...base,
      float_value: fallbackFloat,
      paint_seed: fallbackSeed,
      inspect_metadata_source: 'asset_properties',
      inspect_metadata_error: null,
      inspect_decoded_at: null,
    };
  }

  return {
    ...base,
    inspect_metadata_source: 'none',
    inspect_metadata_error: null,
    inspect_decoded_at: null,
  };
}
