/**
 * Inventory / trade-offers sync progress for popup polling.
 * In-memory for live updates; mirrored to chrome.storage.session (fallback: local)
 * so reopening the popup can resume progress after the popup document is destroyed.
 */

export type InventorySyncPhase =
  | 'idle'
  | 'checking_steam'
  | 'opening_steam_tab'
  | 'waiting_for_inventory_page'
  | 'reading_inventory'
  | 'uploading_inventory'
  | 'completed'
  | 'failed';

export type TradeOffersSyncPhase =
  | 'idle'
  | 'checking_steam'
  | 'fetching_offers'
  | 'fetching_history'
  | 'uploading_offers'
  | 'uploading_batch'
  | 'completed'
  | 'failed';

export type MarketHistorySyncPhase =
  | 'idle'
  | 'checking_steam'
  | 'opening_market'
  | 'fetching_history'
  | 'uploading_history'
  | 'uploading_batch'
  | 'completed'
  | 'failed';

export type SyncProgressSlice<T extends string = InventorySyncPhase | TradeOffersSyncPhase | MarketHistorySyncPhase> = {
  phase: T;
  label: string;
  /** 0–100 for progress bar */
  percent: number;
  updatedAt: number;
};

export type SyncProgressState = {
  inventory: SyncProgressSlice<InventorySyncPhase>;
  tradeOffers: SyncProgressSlice<TradeOffersSyncPhase>;
  marketHistory: SyncProgressSlice<MarketHistorySyncPhase>;
};

const STORAGE_KEY = 'skinalyze_sync_progress_snapshot_v1';

/** completed/failed snapshots expire after this so the popup does not show stale banners forever */
const TERMINAL_TTL_MS = 10_000;
/** If SW died mid-sync, do not show "active" forever */
const ACTIVE_STALE_MS = 15 * 60 * 1000;

const state: SyncProgressState = {
  inventory: { phase: 'idle', label: '', percent: 0, updatedAt: 0 },
  tradeOffers: { phase: 'idle', label: '', percent: 0, updatedAt: 0 },
  marketHistory: { phase: 'idle', label: '', percent: 0, updatedAt: 0 },
};

const INV_LABELS: Record<InventorySyncPhase, string> = {
  idle: '',
  checking_steam: 'Checking Steam login…',
  opening_steam_tab: 'Opening CS2 inventory tab…',
  waiting_for_inventory_page: 'Waiting for Steam page…',
  reading_inventory: 'Reading inventory from Steam…',
  uploading_inventory: 'Uploading to SkinAlyze…',
  completed: 'Inventory sync finished.',
  failed: 'Inventory sync failed.',
};

const INV_PCT: Record<InventorySyncPhase, number> = {
  idle: 0,
  checking_steam: 12,
  opening_steam_tab: 28,
  waiting_for_inventory_page: 40,
  reading_inventory: 62,
  uploading_inventory: 88,
  completed: 100,
  failed: 0,
};

const TO_LABELS: Record<TradeOffersSyncPhase, string> = {
  idle: '',
  checking_steam: 'Checking Steam login…',
  fetching_offers: 'Fetching trade offers…',
  fetching_history: 'Fetching trade history…',
  uploading_offers: 'Uploading trade offers…',
  uploading_batch: 'Uploading trade offer batch…',
  completed: 'Trade offers sync finished.',
  failed: 'Trade offers sync failed.',
};

const TO_PCT: Record<TradeOffersSyncPhase, number> = {
  idle: 0,
  checking_steam: 20,
  fetching_offers: 55,
  fetching_history: 55,
  uploading_offers: 90,
  uploading_batch: 90,
  completed: 100,
  failed: 0,
};

const MH_LABELS: Record<MarketHistorySyncPhase, string> = {
  idle: '',
  checking_steam: 'Checking Steam login…',
  opening_market: 'Opening Steam Market…',
  fetching_history: 'Fetching Steam market history…',
  uploading_history: 'Uploading market history…',
  uploading_batch: 'Uploading market history batch…',
  completed: 'Market history sync finished.',
  failed: 'Market history sync failed.',
};

const MH_PCT: Record<MarketHistorySyncPhase, number> = {
  idle: 0,
  checking_steam: 15,
  opening_market: 30,
  fetching_history: 65,
  uploading_history: 90,
  uploading_batch: 90,
  completed: 100,
  failed: 0,
};

function idleInventorySlice(): SyncProgressSlice<InventorySyncPhase> {
  return { phase: 'idle', label: '', percent: 0, updatedAt: Date.now() };
}

function idleTradeOffersSlice(): SyncProgressSlice<TradeOffersSyncPhase> {
  return { phase: 'idle', label: '', percent: 0, updatedAt: Date.now() };
}

function idleMarketHistorySlice(): SyncProgressSlice<MarketHistorySyncPhase> {
  return { phase: 'idle', label: '', percent: 0, updatedAt: Date.now() };
}

function isTerminalInv(phase: InventorySyncPhase): boolean {
  return phase === 'completed' || phase === 'failed';
}

function isTerminalTo(phase: TradeOffersSyncPhase): boolean {
  return phase === 'completed' || phase === 'failed';
}

function isTerminalMh(phase: MarketHistorySyncPhase): boolean {
  return phase === 'completed' || phase === 'failed';
}

function isActiveInv(phase: InventorySyncPhase): boolean {
  return phase !== 'idle' && !isTerminalInv(phase);
}

function isActiveTo(phase: TradeOffersSyncPhase): boolean {
  return phase !== 'idle' && !isTerminalTo(phase);
}

function isActiveMh(phase: MarketHistorySyncPhase): boolean {
  return phase !== 'idle' && !isTerminalMh(phase);
}

function isStaleInventory(slice: SyncProgressSlice<InventorySyncPhase>): boolean {
  const now = Date.now();
  if (slice.phase === 'idle') return false;
  if (isTerminalInv(slice.phase)) {
    return now - slice.updatedAt > TERMINAL_TTL_MS;
  }
  return now - slice.updatedAt > ACTIVE_STALE_MS;
}

function isStaleTradeOffers(slice: SyncProgressSlice<TradeOffersSyncPhase>): boolean {
  const now = Date.now();
  if (slice.phase === 'idle') return false;
  if (isTerminalTo(slice.phase)) {
    return now - slice.updatedAt > TERMINAL_TTL_MS;
  }
  return now - slice.updatedAt > ACTIVE_STALE_MS;
}

function isStaleMarketHistory(slice: SyncProgressSlice<MarketHistorySyncPhase>): boolean {
  const now = Date.now();
  if (slice.phase === 'idle') return false;
  if (isTerminalMh(slice.phase)) {
    return now - slice.updatedAt > TERMINAL_TTL_MS;
  }
  return now - slice.updatedAt > ACTIVE_STALE_MS;
}

function sanitizeInventorySlice(
  slice: SyncProgressSlice<InventorySyncPhase>
): SyncProgressSlice<InventorySyncPhase> {
  return isStaleInventory(slice) ? idleInventorySlice() : slice;
}

function sanitizeTradeOffersSlice(
  slice: SyncProgressSlice<TradeOffersSyncPhase>
): SyncProgressSlice<TradeOffersSyncPhase> {
  return isStaleTradeOffers(slice) ? idleTradeOffersSlice() : slice;
}

function sanitizeMarketHistorySlice(
  slice: SyncProgressSlice<MarketHistorySyncPhase>
): SyncProgressSlice<MarketHistorySyncPhase> {
  return isStaleMarketHistory(slice) ? idleMarketHistorySlice() : slice;
}

function getStorageArea(): chrome.storage.StorageArea | null {
  if (typeof chrome === 'undefined' || !chrome.storage) return null;
  if (chrome.storage.session) return chrome.storage.session;
  return chrome.storage.local;
}

function persistSnapshot(): void {
  const snapshot: SyncProgressState = {
    inventory: { ...state.inventory },
    tradeOffers: { ...state.tradeOffers },
    marketHistory: { ...state.marketHistory },
  };
  const area = getStorageArea();
  if (!area) return;
  void area.set({ [STORAGE_KEY]: snapshot }).catch(() => {
    /* ignore quota / private mode */
  });
}

/** Clear persisted snapshot when fully idle (optional hygiene). */
async function clearPersistedIfFullyIdle(): Promise<void> {
  if (state.inventory.phase !== 'idle' || state.tradeOffers.phase !== 'idle' || state.marketHistory.phase !== 'idle') return;
  const area = getStorageArea();
  if (!area) return;
  await area.remove(STORAGE_KEY).catch(() => {});
}

export function getSyncProgress(): SyncProgressState {
  return {
    inventory: { ...state.inventory },
    tradeOffers: { ...state.tradeOffers },
    marketHistory: { ...state.marketHistory },
  };
}

async function loadPersistedSnapshot(): Promise<SyncProgressState | null> {
  const area = getStorageArea();
  if (!area) return null;
  try {
    const raw = await area.get(STORAGE_KEY);
    const data = raw[STORAGE_KEY] as SyncProgressState | undefined;
    if (!data?.inventory || !data?.tradeOffers) return null;
    if (!data.marketHistory) data.marketHistory = idleMarketHistorySlice();
    return data;
  } catch {
    return null;
  }
}

/**
 * Merge in-memory progress (authoritative while the service worker is alive) with
 * persisted snapshot (survives popup close; helps after SW restart until stale).
 */
export async function getHydratedSyncProgress(): Promise<SyncProgressState> {
  const mem = getSyncProgress();
  const disk = await loadPersistedSnapshot();
  if (!disk) return mem;

  const invDisk = sanitizeInventorySlice(disk.inventory);
  const toDisk = sanitizeTradeOffersSlice(disk.tradeOffers);
  const mhDisk = sanitizeMarketHistorySlice(disk.marketHistory);

  const mergeInv = (): SyncProgressSlice<InventorySyncPhase> => {
    if (mem.inventory.phase !== 'idle') return mem.inventory;
    if (invDisk.phase !== 'idle') return invDisk;
    return mem.inventory;
  };

  const mergeTo = (): SyncProgressSlice<TradeOffersSyncPhase> => {
    if (mem.tradeOffers.phase !== 'idle') return mem.tradeOffers;
    if (toDisk.phase !== 'idle') return toDisk;
    return mem.tradeOffers;
  };

  const mergeMh = (): SyncProgressSlice<MarketHistorySyncPhase> => {
    if (mem.marketHistory.phase !== 'idle') return mem.marketHistory;
    if (mhDisk.phase !== 'idle') return mhDisk;
    return mem.marketHistory;
  };

  return {
    inventory: mergeInv(),
    tradeOffers: mergeTo(),
    marketHistory: mergeMh(),
  };
}

export function setInventorySyncProgress(phase: InventorySyncPhase, detail?: string): void {
  const label = detail?.trim()
    ? `${INV_LABELS[phase]} ${detail}`.trim()
    : INV_LABELS[phase];
  state.inventory = {
    phase,
    label: label || INV_LABELS[phase],
    percent: INV_PCT[phase],
    updatedAt: Date.now(),
  };
  persistSnapshot();
}

export function setTradeOffersSyncProgress(phase: TradeOffersSyncPhase, detail?: string): void {
  const label = detail?.trim()
    ? `${TO_LABELS[phase]} ${detail}`.trim()
    : TO_LABELS[phase];
  state.tradeOffers = {
    phase,
    label: label || TO_LABELS[phase],
    percent: TO_PCT[phase],
    updatedAt: Date.now(),
  };
  persistSnapshot();
}

export function setMarketHistorySyncProgress(phase: MarketHistorySyncPhase, detail?: string): void {
  const label = detail?.trim()
    ? `${MH_LABELS[phase]} ${detail}`.trim()
    : MH_LABELS[phase];
  state.marketHistory = {
    phase,
    label: label || MH_LABELS[phase],
    percent: MH_PCT[phase],
    updatedAt: Date.now(),
  };
  persistSnapshot();
}

export function resetInventorySyncProgressIdle(): void {
  state.inventory = idleInventorySlice();
  persistSnapshot();
  void clearPersistedIfFullyIdle();
}

export function resetTradeOffersSyncProgressIdle(): void {
  state.tradeOffers = idleTradeOffersSlice();
  persistSnapshot();
  void clearPersistedIfFullyIdle();
}

export function resetMarketHistorySyncProgressIdle(): void {
  state.marketHistory = idleMarketHistorySlice();
  persistSnapshot();
  void clearPersistedIfFullyIdle();
}

/** True if this slice should show the progress row / block actions (running or terminal grace). */
export function isProgressSliceVisibleInv(slice: SyncProgressSlice<InventorySyncPhase>): boolean {
  if (slice.phase === 'idle') return false;
  if (isStaleInventory(slice)) return false;
  return true;
}

export function isProgressSliceVisibleTo(slice: SyncProgressSlice<TradeOffersSyncPhase>): boolean {
  if (slice.phase === 'idle') return false;
  if (isStaleTradeOffers(slice)) return false;
  return true;
}

export function isProgressSliceVisibleMh(slice: SyncProgressSlice<MarketHistorySyncPhase>): boolean {
  if (slice.phase === 'idle') return false;
  if (isStaleMarketHistory(slice)) return false;
  return true;
}

/** True while sync is actively running (not terminal completion banner). */
export function isProgressSliceActiveInv(slice: SyncProgressSlice<InventorySyncPhase>): boolean {
  return isProgressSliceVisibleInv(slice) && isActiveInv(slice.phase);
}

export function isProgressSliceActiveTo(slice: SyncProgressSlice<TradeOffersSyncPhase>): boolean {
  return isProgressSliceVisibleTo(slice) && isActiveTo(slice.phase);
}

export function isProgressSliceActiveMh(slice: SyncProgressSlice<MarketHistorySyncPhase>): boolean {
  return isProgressSliceVisibleMh(slice) && isActiveMh(slice.phase);
}

/** Map raw errors to short user-facing inventory messages */
export function friendlyInventorySyncError(raw: string | null | undefined): string {
  if (raw == null || (typeof raw !== 'string' && typeof raw !== 'number')) {
    return 'Something went wrong. Try again.';
  }
  const s = String(raw).trim();
  if (!s || s === 'undefined') return 'Something went wrong. Try again.';
  if (
    /tab was closed|closed before|No tab with id|Invalid tab|cannot access contents|Could not load tab|Receiving end does not exist|The tab was closed/i.test(
      s
    )
  ) {
    return 'Steam inventory tab was closed or became unavailable. Open your CS2 inventory in a tab (or let the extension open one) and try again.';
  }
  if (/timed out|timeout/i.test(s)) {
    return 'Steam took too long to load. Open steamcommunity.com, load your CS2 inventory, then sync again.';
  }
  if (/Not logged into Steam|Wrong Steam account/i.test(s)) return s;
  if (/^STEAM_RATE_LIMIT:/i.test(s)) {
    return s.replace(/^STEAM_RATE_LIMIT:\s*/i, '').trim() || 'Steam rate-limited the request. Wait a minute and try again.';
  }
  if (/^STEAM_INVENTORY_CTX2_SOFT_FAIL:/i.test(s)) {
    return (
      s.replace(/^STEAM_INVENTORY_CTX2_SOFT_FAIL:\s*/i, '').trim() ||
      'Steam did not return your main inventory. Load your CS2 inventory on steamcommunity.com, then sync again.'
    );
  }
  if (/^STEAM_INVENTORY_CTX2_INCOMPLETE:/i.test(s)) {
    return (
      s.replace(/^STEAM_INVENTORY_CTX2_INCOMPLETE:\s*/i, '').trim() ||
      'Steam inventory load was interrupted. Try again in a moment.'
    );
  }
  if (/^STEAM_CTX16_ONLY:/i.test(s)) {
    return (
      s.replace(/^STEAM_CTX16_ONLY:\s*/i, '').trim() ||
      'Steam returned only trade-protected items. Wait and sync again.'
    );
  }
  if (/HTTP \d{3}/.test(s)) return `SkinAlyze server error (${s}). Try again in a moment.`;
  return s;
}

export function friendlyTradeOffersSyncError(raw: string | null | undefined): string {
  if (raw == null || (typeof raw !== 'string' && typeof raw !== 'number')) {
    return 'Something went wrong. Try again.';
  }
  const s = String(raw).trim();
  if (!s || s === 'undefined') return 'Something went wrong. Try again.';
  if (/HTTP \d{3}/.test(s)) return `SkinAlyze server error (${s}). Try again in a moment.`;
  if (/Not logged|mismatch|Steam account/i.test(s)) return s;
  return s;
}

export function friendlyMarketHistorySyncError(raw: string | null | undefined): string {
  if (raw == null || (typeof raw !== 'string' && typeof raw !== 'number')) {
    return 'Something went wrong. Try again.';
  }
  const s = String(raw).trim();
  if (!s || s === 'undefined') return 'Something went wrong. Try again.';
  if (/HTTP \d{3}/.test(s)) return `SkinAlyze server error (${s}). Try again in a moment.`;
  if (/Not logged|Wrong Steam account|Steam account/i.test(s)) return s;
  if (/market history HTTP 429|rate/i.test(s)) return 'Steam rate-limited market history. Wait a minute and try again.';
  return s;
}
