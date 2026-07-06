export type SteamInspectSticker = {
  slot: number | null;
  sticker_id: number | null;
  wear: number | null;
};

export type SteamInspectKeychain = {
  slot: number | null;
  sticker_id: number | null;
  wear: number | null;
  pattern: number | null;
};

export type SteamInventoryItem = {
  asset_id: string;
  class_id: string;
  instance_id: string;
  app_id: number;
  context_id: number;
  market_hash_name: string;
  icon_url: string | null;
  tradable: boolean;
  marketable: boolean;
  trade_lock_until: string | null;
  name_color: string | null;
  exterior: string | null;
  stattrak: boolean;
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
  stickers: SteamInspectSticker[];
  keychains: SteamInspectKeychain[];
  inspect_metadata_source: string;
  inspect_metadata_error: string | null;
  inspect_decoded_at: string | null;
};

export type ExtensionMessage =
  | { type: 'PAIR'; code: string }
  | { type: 'GET_STATUS' }
  | { type: 'SET_STEAM_SYNC_ENABLED'; enabled: boolean; steamId64?: string | null }
  | { type: 'CHECK_EXTENSION_ME' }
  | { type: 'DETECT_STEAM' }
  | { type: 'SYNC_INVENTORY' }
  | { type: 'SYNC_ALL' }
  | { type: 'GET_SYNC_PROGRESS' }
  | { type: 'GET_BADGES'; assetIds: string[]; steamId64?: string | null }
  | { type: 'SYNC_TRADE_OFFERS' }
  | { type: 'SYNC_MARKET_HISTORY' }
  | { type: 'EXECUTE_PAGE_STEAM' };

export type ExtensionResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };
