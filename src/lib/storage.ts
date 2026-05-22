const KEYS = {
  token: 'skinalyze_token',
  steamExpected: 'skinalyze_steam_id64_expected',
  userHandle: 'skinalyze_user_handle',
  lastSyncAt: 'skinalyze_last_sync_at',
  lastSteamDetected: 'skinalyze_last_steam_detected',
  lastError: 'skinalyze_last_error',
  /** Last successful normalized inventory item count (extension-side guard vs ctx16-only bad syncs). */
  lastInvSyncItemCount: 'skinalyze_last_inventory_sync_item_count',
} as const;

export type AutomationSettings = {
  /** Master switch for periodic + hybrid auto sync */
  autoSyncEnabled: boolean;
  autoSyncInventory: boolean;
  autoSyncOffers: boolean;
  /** Extra sync when a relevant Steam tab finishes loading */
  hybridOnActivePage: boolean;
  periodicIntervalMinutes: number;
  hybridCooldownMs: number;
};

/** Automatic sync policy used by background alarms and Steam page-load triggers. */
export const EFFECTIVE_AUTOMATION_SETTINGS: AutomationSettings = {
  autoSyncEnabled: true,
  autoSyncInventory: true,
  autoSyncOffers: true,
  hybridOnActivePage: true,
  periodicIntervalMinutes: 20,
  hybridCooldownMs: 180_000,
};

export async function getStorage(): Promise<{
  token: string | null;
  steamExpected: string | null;
  userHandle: string | null;
  lastSyncAt: string | null;
  lastSteamDetected: string | null;
  lastError: string | null;
}> {
  const raw = await chrome.storage.local.get(Object.values(KEYS));
  return {
    token: (raw[KEYS.token] as string) ?? null,
    steamExpected: (raw[KEYS.steamExpected] as string) ?? null,
    userHandle: (raw[KEYS.userHandle] as string) ?? null,
    lastSyncAt: (raw[KEYS.lastSyncAt] as string) ?? null,
    lastSteamDetected: (raw[KEYS.lastSteamDetected] as string) ?? null,
    lastError: (raw[KEYS.lastError] as string) ?? null,
  };
}

export async function setPaired(data: {
  token: string;
  steam_id64: string;
  user_handle: string | null;
}): Promise<void> {
  await chrome.storage.local.set({
    [KEYS.token]: data.token,
    [KEYS.steamExpected]: data.steam_id64,
    [KEYS.userHandle]: data.user_handle ?? '',
    [KEYS.lastError]: '',
  });
}

export async function clearPaired(): Promise<void> {
  await chrome.storage.local.remove([
    KEYS.token,
    KEYS.steamExpected,
    KEYS.userHandle,
    KEYS.lastSyncAt,
    KEYS.lastSteamDetected,
    KEYS.lastError,
    KEYS.lastInvSyncItemCount,
  ]);
}

export async function setLastSyncAt(iso: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.lastSyncAt]: iso });
}

export async function setLastSteamDetected(steamId: string | null): Promise<void> {
  await chrome.storage.local.set({ [KEYS.lastSteamDetected]: steamId ?? '' });
}

export async function setLastError(msg: string): Promise<void> {
  await chrome.storage.local.set({ [KEYS.lastError]: msg });
}

export async function getLastInventorySyncItemCount(): Promise<number | null> {
  const raw = await chrome.storage.local.get([KEYS.lastInvSyncItemCount]);
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
  await chrome.storage.local.set({ [KEYS.lastInvSyncItemCount]: n });
}

export async function getAutomationSettings(): Promise<AutomationSettings> {
  return { ...EFFECTIVE_AUTOMATION_SETTINGS };
}
