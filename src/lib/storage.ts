import { browser } from '@/shared/browser-api';

const KEYS = {
  token: 'skinalyze_token',
  steamExpected: 'skinalyze_steam_id64_expected',
  userHandle: 'skinalyze_user_handle',
  lastSyncAt: 'skinalyze_last_sync_at',
  lastSteamDetected: 'skinalyze_last_steam_detected',
  lastError: 'skinalyze_last_error',
  pairings: 'skinalyze_pairings_v2',
  activeSteamId64: 'skinalyze_active_steam_id64',
  /** Last successful normalized inventory item count (extension-side guard vs ctx16-only bad syncs). */
  lastInvSyncItemCount: 'skinalyze_last_inventory_sync_item_count',
} as const;

export type AutomationSettings = {
  /** Master switch for periodic + hybrid auto sync */
  autoSyncEnabled: boolean;
  autoSyncInventory: boolean;
  autoSyncOffers: boolean;
  autoSyncMarketHistory: boolean;
  /** Extra sync when a relevant Steam tab finishes loading */
  hybridOnActivePage: boolean;
  periodicIntervalMinutes: number;
  hybridCooldownMs: number;
};

export type PairedAccount = {
  token: string;
  steam_id64: string;
  steam_account_id?: string | null;
  user_handle?: string | null;
  client_id?: string | null;
  last_sync_at?: string | null;
  last_error?: string | null;
  steam_sync_enabled: boolean;
};

/** Automatic sync policy used by background alarms and Steam page-load triggers. */
export const EFFECTIVE_AUTOMATION_SETTINGS: AutomationSettings = {
  autoSyncEnabled: true,
  autoSyncInventory: true,
  autoSyncOffers: true,
  autoSyncMarketHistory: true,
  hybridOnActivePage: true,
  periodicIntervalMinutes: 20,
  hybridCooldownMs: 180_000,
};

function normalizePairing(raw: unknown): PairedAccount | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const token = typeof obj.token === 'string' ? obj.token : '';
  const steamId = typeof obj.steam_id64 === 'string' ? obj.steam_id64 : '';
  if (!token || !steamId) return null;
  return {
    token,
    steam_id64: steamId,
    steam_account_id: typeof obj.steam_account_id === 'string' ? obj.steam_account_id : null,
    user_handle: typeof obj.user_handle === 'string' ? obj.user_handle : null,
    client_id: typeof obj.client_id === 'string' ? obj.client_id : null,
    last_sync_at: typeof obj.last_sync_at === 'string' ? obj.last_sync_at : null,
    last_error: typeof obj.last_error === 'string' ? obj.last_error : null,
    steam_sync_enabled: typeof obj.steam_sync_enabled === 'boolean' ? obj.steam_sync_enabled : true,
  };
}

async function writeLegacyActive(pairing: PairedAccount | null): Promise<void> {
  if (!pairing) {
    await browser.storage.local.set({
      [KEYS.token]: '',
      [KEYS.steamExpected]: '',
      [KEYS.userHandle]: '',
    });
    return;
  }
  await browser.storage.local.set({
    [KEYS.token]: pairing.token,
    [KEYS.steamExpected]: pairing.steam_id64,
    [KEYS.userHandle]: pairing.user_handle ?? '',
  });
}

export async function getPairings(): Promise<PairedAccount[]> {
  const raw = await browser.storage.local.get([
    KEYS.pairings,
    KEYS.token,
    KEYS.steamExpected,
    KEYS.userHandle,
    KEYS.lastSyncAt,
    KEYS.lastError,
  ]);

  const rawPairings = raw[KEYS.pairings] as unknown;
  const pairings = Array.isArray(rawPairings)
    ? rawPairings.map(normalizePairing).filter((p: PairedAccount | null): p is PairedAccount => p !== null)
    : [];

  const legacyTokenRaw = raw[KEYS.token];
  const legacySteamRaw = raw[KEYS.steamExpected];
  const legacyToken = typeof legacyTokenRaw === 'string' ? legacyTokenRaw : '';
  const legacySteam = typeof legacySteamRaw === 'string' ? legacySteamRaw : '';
  if (legacyToken && legacySteam && !pairings.some((p: PairedAccount) => p.steam_id64 === legacySteam)) {
    pairings.push({
      token: legacyToken,
      steam_id64: legacySteam,
      user_handle: typeof raw[KEYS.userHandle] === 'string' ? raw[KEYS.userHandle] as string : null,
      last_sync_at: typeof raw[KEYS.lastSyncAt] === 'string' ? raw[KEYS.lastSyncAt] as string : null,
      last_error: typeof raw[KEYS.lastError] === 'string' ? raw[KEYS.lastError] as string : null,
      steam_sync_enabled: true,
    });
    await browser.storage.local.set({ [KEYS.pairings]: pairings });
  }

  return pairings;
}

export async function getActivePairing(): Promise<PairedAccount | null> {
  const [pairings, raw] = await Promise.all([
    getPairings(),
    browser.storage.local.get([KEYS.activeSteamId64, KEYS.steamExpected]),
  ]);
  const active =
    (typeof raw[KEYS.activeSteamId64] === 'string' && raw[KEYS.activeSteamId64]) ||
    (typeof raw[KEYS.steamExpected] === 'string' && raw[KEYS.steamExpected]) ||
    '';
  return pairings.find((p) => p.steam_id64 === active) ?? pairings[0] ?? null;
}

export async function getPairingForSteamId(steamId64: string | null | undefined): Promise<PairedAccount | null> {
  if (!steamId64) return null;
  const pairings = await getPairings();
  const match = pairings.find((p) => p.steam_id64 === steamId64) ?? null;
  if (match) {
    await browser.storage.local.set({ [KEYS.activeSteamId64]: match.steam_id64 });
    await writeLegacyActive(match);
  }
  return match;
}

export async function getStorage(): Promise<{
  token: string | null;
  steamExpected: string | null;
  userHandle: string | null;
  lastSyncAt: string | null;
  lastSteamDetected: string | null;
  lastError: string | null;
  pairings: PairedAccount[];
  pairedSteamIds: string[];
  steamSyncEnabled: boolean;
}> {
  const [raw, pairings, active] = await Promise.all([
    browser.storage.local.get([KEYS.lastSteamDetected, KEYS.lastError, KEYS.lastSyncAt]),
    getPairings(),
    getActivePairing(),
  ]);
  return {
    token: active?.token ?? null,
    steamExpected: active?.steam_id64 ?? null,
    userHandle: active?.user_handle ?? null,
    lastSyncAt: active?.last_sync_at ?? ((raw[KEYS.lastSyncAt] as string) || null),
    lastSteamDetected: (raw[KEYS.lastSteamDetected] as string) ?? null,
    lastError: active?.last_error ?? ((raw[KEYS.lastError] as string) || null),
    pairings,
    pairedSteamIds: pairings.map((p) => p.steam_id64),
    steamSyncEnabled: active?.steam_sync_enabled ?? true,
  };
}

export async function setPaired(data: {
  token: string;
  steam_id64: string;
  steam_account_id?: string | null;
  user_handle: string | null;
  client_id?: string | null;
}): Promise<void> {
  const pairings = await getPairings();
  const existing = pairings.find((p) => p.steam_id64 === data.steam_id64) ?? null;
  const next: PairedAccount = {
    token: data.token,
    steam_id64: data.steam_id64,
    steam_account_id: data.steam_account_id ?? null,
    user_handle: data.user_handle ?? null,
    client_id: data.client_id ?? null,
    last_error: null,
    steam_sync_enabled: existing?.steam_sync_enabled ?? true,
  };
  const filtered = pairings.filter((p) => p.steam_id64 !== next.steam_id64);
  const updated = [...filtered, next];
  await browser.storage.local.set({
    [KEYS.pairings]: updated,
    [KEYS.activeSteamId64]: next.steam_id64,
    [KEYS.lastError]: '',
  });
  await writeLegacyActive(next);
}

export async function setSteamSyncEnabled(
  enabled: boolean,
  steamId64?: string | null
): Promise<PairedAccount | null> {
  const pairings = await getPairings();
  const active = await getActivePairing();
  const targetSteamId = steamId64 || active?.steam_id64 || '';
  if (!targetSteamId) return null;

  let updatedPairing: PairedAccount | null = null;
  const updated = pairings.map((p) => {
    if (p.steam_id64 !== targetSteamId) return p;
    updatedPairing = { ...p, steam_sync_enabled: enabled };
    return updatedPairing;
  });

  if (!updatedPairing) return null;

  await browser.storage.local.set({ [KEYS.pairings]: updated });
  if (active?.steam_id64 === targetSteamId) {
    await writeLegacyActive(updatedPairing);
  }
  return updatedPairing;
}

export function isSteamSyncEnabledForPairing(pairing: PairedAccount | null | undefined): boolean {
  return pairing?.steam_sync_enabled !== false;
}

export async function clearPaired(): Promise<void> {
  await browser.storage.local.remove([
    KEYS.token,
    KEYS.steamExpected,
    KEYS.userHandle,
    KEYS.lastSyncAt,
    KEYS.lastSteamDetected,
    KEYS.lastError,
    KEYS.pairings,
    KEYS.activeSteamId64,
    KEYS.lastInvSyncItemCount,
  ]);
}

async function updateActivePairing(patch: Partial<PairedAccount>): Promise<void> {
  const active = await getActivePairing();
  if (!active) return;
  const pairings = await getPairings();
  const updated = pairings.map((p) => (p.steam_id64 === active.steam_id64 ? { ...p, ...patch } : p));
  await browser.storage.local.set({ [KEYS.pairings]: updated });
  await writeLegacyActive({ ...active, ...patch });
}

export async function setLastSyncAt(iso: string): Promise<void> {
  await browser.storage.local.set({ [KEYS.lastSyncAt]: iso });
  await updateActivePairing({ last_sync_at: iso });
}

export async function setLastSteamDetected(steamId: string | null): Promise<void> {
  await browser.storage.local.set({ [KEYS.lastSteamDetected]: steamId ?? '' });
}

export async function setLastError(msg: string): Promise<void> {
  await browser.storage.local.set({ [KEYS.lastError]: msg });
  await updateActivePairing({ last_error: msg });
}

export async function getLastInventorySyncItemCount(): Promise<number | null> {
  const raw = await browser.storage.local.get([KEYS.lastInvSyncItemCount]);
  const v = raw[KEYS.lastInvSyncItemCount];
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

export async function setLastInventorySyncItemCount(count: number): Promise<void> {
  const n = Math.max(0, Math.floor(count));
  await browser.storage.local.set({ [KEYS.lastInvSyncItemCount]: n });
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  return { ...EFFECTIVE_AUTOMATION_SETTINGS };
}
