import { apiPost, messageFromExtensionApiBody } from '@/lib/api';
import { fetchCs2Inventory } from '@/lib/steam';
import {
  getPairingForSteamId,
  getPairings,
  isSteamSyncEnabledForPairing,
  setLastSyncAt,
  setLastError,
} from '@/lib/storage';
import { detectLoggedInSteamId64 } from '@/lib/steam-detect';
import {
  friendlyInventorySyncError,
  resetInventorySyncProgressIdle,
  setInventorySyncProgress,
  TERMINAL_TTL_MS,
} from '@/lib/sync-progress';

function randomIdem(prefix: string): string {
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${r}`;
}

const IDLE_RESET_MS = TERMINAL_TTL_MS;
let idleResetTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleResetTimer(): void {
  if (idleResetTimer != null) {
    clearTimeout(idleResetTimer);
    idleResetTimer = null;
  }
}

function scheduleIdleReset(delayMs: number): void {
  clearIdleResetTimer();
  idleResetTimer = setTimeout(() => {
    idleResetTimer = null;
    resetInventorySyncProgressIdle();
  }, delayMs);
}

export async function handleSyncInventory(): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  clearIdleResetTimer();
  resetInventorySyncProgressIdle();
  setInventorySyncProgress('checking_steam');

  const finishFail = async (msg: string) => {
    const friendly = friendlyInventorySyncError(msg);
    setInventorySyncProgress('failed', friendly);
    await setLastError(friendly);
    scheduleIdleReset(IDLE_RESET_MS + 800);
    return { ok: false, error: friendly } as const;
  };

  const finishOk = async (data: unknown) => {
    await setLastSyncAt(new Date().toISOString());
    await setLastError('');
    setInventorySyncProgress('completed');
    scheduleIdleReset(IDLE_RESET_MS);
    return { ok: true, data } as const;
  };

  const finishSkipped = () => {
    resetInventorySyncProgressIdle();
    return {
      ok: true,
      data: {
        skipped: true,
        reason: 'steam_sync_disabled',
        message: 'Steam sync is disabled for this paired Steam account.',
      },
    } as const;
  };

  const pairings = await getPairings();
  if (pairings.length === 0) {
    return finishFail('Not paired');
  }

  try {
    let detected: string | null = null;
    try {
      detected = await detectLoggedInSteamId64();
    } catch {
      detected = null;
    }
    const pairing = await getPairingForSteamId(detected);
    if (!pairing) {
      const msg =
        !detected
          ? 'Not logged into Steam in this browser.'
          : 'This Steam account is not paired with SkinAlyze. Pair it in Settings → Integrations.';
      return finishFail(msg);
    }
    if (!isSteamSyncEnabledForPairing(pairing)) {
      return finishSkipped();
    }

    let items;
    try {
      items = await fetchCs2Inventory(pairing.steam_id64);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Inventory fetch failed';
      return finishFail(raw);
    }

    setInventorySyncProgress('uploading_inventory');
    const idem = randomIdem('inv');
    const res = await apiPost('/api/extension/inventory/sync', pairing.token, {
      steam_id64: pairing.steam_id64,
      items,
      idempotency_key: idem,
    });

    if (!res.ok) {
      return finishFail(messageFromExtensionApiBody(res.data, res.status));
    }

    return finishOk(res.data);
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Sync failed';
    return finishFail(raw);
  }
}
