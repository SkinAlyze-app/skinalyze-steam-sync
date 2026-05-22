import { CS2_APP_ID, CS2_CONTEXT_ID } from '@/shared/constants';
import { enrichSteamAssetMetadata } from '@/lib/inspect-metadata';
import { fetchInventoryViaTab, type RawSteamAsset, type RawSteamDesc } from '@/lib/steam-tab-fetch';
import { getLastInventorySyncItemCount, setLastInventorySyncItemCount } from '@/lib/storage';
import type { SteamInventoryItem } from '@/shared/types';

/** Set true only for local debugging; never logs inventory counts in production builds. */
const DEBUG_LOGS = false;

type SteamAsset = RawSteamAsset;
type SteamDesc = RawSteamDesc;

const SKIP_TYPES = new Set(['CSGO_Type_StorageUnit']);
const SKIP_QUALITIES = new Set(['genuine']);
const SKIP_NAMES = new Set(['storage unit']);

function shouldSkipItem(desc: SteamDesc | undefined): boolean {
  if (!desc) return false;
  const name = (desc.market_hash_name || desc.market_name || '').toLowerCase().trim();
  if (SKIP_NAMES.has(name)) return true;
  if (name.startsWith('genuine ')) return true;
  if (!desc.tags) return false;
  for (const t of desc.tags) {
    if (t.category === 'Type' && t.internal_name && SKIP_TYPES.has(t.internal_name)) return true;
    if (t.category === 'Quality' && t.internal_name && SKIP_QUALITIES.has(t.internal_name.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function parseTradeLockUntil(desc: SteamDesc): string | null {
  const owners = desc.owner_descriptions ?? [];
  for (const o of owners) {
    const v = o.value ?? '';
    if (!v) continue;

    const afterTradable = v.split(/Tradable\/Marketable After\s+/i)[1];
    if (afterTradable) {
      const cleaned = afterTradable.replace(/[()]/g, '').trim();
      const d = Date.parse(cleaned);
      if (!Number.isNaN(d)) return new Date(d).toISOString();
    }

    const transferred = v.split(/transferred until\s+/i)[1];
    if (transferred) {
      const cleaned = transferred.replace(/[()]/g, '').trim();
      const d = Date.parse(cleaned);
      if (!Number.isNaN(d)) return new Date(d).toISOString();
    }

    const m = v.match(/(\w+\s+\d{1,2},\s+\d{4})/);
    if (m) {
      const d = Date.parse(m[1]);
      if (!Number.isNaN(d)) return new Date(d).toISOString();
    }

    const iso = v.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    if (iso) {
      const d = Date.parse(iso[0]);
      if (!Number.isNaN(d)) return new Date(d).toISOString();
    }
  }
  return null;
}

function exteriorFromTags(tags: SteamDesc['tags']): string | null {
  if (!tags) return null;
  const ext = tags.find((t) => t.category === 'Exterior');
  return ext?.internal_name?.replace(/^wearcategory_/i, '') ?? null;
}

function isStattrak(tags: SteamDesc['tags']): boolean {
  if (!tags) return false;
  return tags.some((t) => t.internal_name?.toLowerCase().includes('stattrak'));
}

function normalizeOne(
  asset: SteamAsset,
  desc: SteamDesc | undefined,
  meta: Awaited<ReturnType<typeof enrichSteamAssetMetadata>>
): SteamInventoryItem | null {
  const name = desc?.market_hash_name || desc?.market_name;
  if (!name) return null;
  const tradable = desc?.tradable === 1;
  const marketable = desc?.marketable === 1;
  const ctx =
    asset.contextid != null && String(asset.contextid).trim() !== ''
      ? Number.parseInt(String(asset.contextid), 10)
      : CS2_CONTEXT_ID;
  const context_id = Number.isFinite(ctx) ? ctx : CS2_CONTEXT_ID;

  return {
    asset_id: String(asset.assetid),
    class_id: String(asset.classid),
    instance_id: String(asset.instanceid ?? desc?.instanceid ?? '0'),
    app_id: CS2_APP_ID,
    context_id,
    market_hash_name: name,
    icon_url: desc?.icon_url ? `https://community.cloudflare.steamstatic.com/economy/image/${desc.icon_url}` : null,
    tradable,
    marketable,
    trade_lock_until: tradable ? null : parseTradeLockUntil(desc ?? {}),
    name_color: desc?.name_color ? `#${desc.name_color}` : null,
    exterior: exteriorFromTags(desc?.tags),
    stattrak: isStattrak(desc?.tags),
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
  };
}

/** Full CS2 inventory via a steamcommunity.com tab (authenticated cookies). */
export async function fetchCs2Inventory(steamId64: string): Promise<SteamInventoryItem[]> {
  const { assets: rawAssets, descriptions: rawDescs } = await fetchInventoryViaTab(
    steamId64,
    CS2_APP_ID,
    CS2_CONTEXT_ID
  );

  if (DEBUG_LOGS) {
    console.debug('[SkinAlyze] inventory tab fetch', { rawAssets: rawAssets.length, descriptions: rawDescs.length });
  }

  const descMap = new Map<string, SteamDesc>();
  for (const d of rawDescs) {
    descMap.set(`${d.classid}_${d.instanceid ?? '0'}`, d);
  }

  const prevSyncedCount = await getLastInventorySyncItemCount();
  const onlyCtx16 =
    rawAssets.length > 0 &&
    rawAssets.every((a) => {
      const c = a.contextid != null && String(a.contextid).trim() !== '' ? String(a.contextid).trim() : '';
      return c === '16';
    });
  const minExpected =
    prevSyncedCount != null && prevSyncedCount >= 5 ? Math.max(5, Math.floor(prevSyncedCount * 0.25)) : null;
  if (minExpected != null && rawAssets.length < minExpected && onlyCtx16) {
    throw new Error(
      'STEAM_CTX16_ONLY:Steam returned only trade-protected items; inventory not refreshed. Wait a minute and sync again.',
    );
  }

  const out: SteamInventoryItem[] = [];
  let skippedFilter = 0;
  let skippedNoName = 0;

  for (const a of rawAssets) {
    const d = descMap.get(`${a.classid}_${a.instanceid ?? '0'}`);
    if (shouldSkipItem(d)) {
      skippedFilter += 1;
      continue;
    }
    let meta: Awaited<ReturnType<typeof enrichSteamAssetMetadata>>;
    try {
      meta = await enrichSteamAssetMetadata({ ownerSteamId64: steamId64, asset: a, desc: d });
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
    const row = normalizeOne(a, d, meta);
    if (row) out.push(row);
    else skippedNoName += 1;
  }

  if (DEBUG_LOGS) {
    console.debug('[SkinAlyze] inventory normalized', {
      items: out.length,
      skippedFilter,
      skippedNoName,
    });
  }

  await setLastInventorySyncItemCount(out.length);

  return out;
}
