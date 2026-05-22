import { apiPost, messageFromExtensionApiBody } from '@/lib/api';
import { fetchCs2Inventory } from '@/lib/steam';
import { getStorage, setLastSyncAt, setLastError } from '@/lib/storage';
import { detectLoggedInSteamId64 } from '@/lib/steam-detect';
import {
  friendlyInventorySyncError,
  resetInventorySyncProgressIdle,
  setInventorySyncProgress,
} from '@/lib/sync-progress';

function randomIdem(prefix: string): string {
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${r}`;
}

const IDLE_RESET_MS = 1400;

export async function handleSyncInventory(): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  resetInventorySyncProgressIdle();

  const s = await getStorage();
  if (!s.token || !s.steamExpected) {
    return { ok: false, error: 'Not paired' };
  }

  const finishFail = async (msg: string) => {
    const friendly = friendlyInventorySyncError(msg);
    setInventorySyncProgress('failed', friendly);
    await setLastError(friendly);
    setTimeout(() => resetInventorySyncProgressIdle(), IDLE_RESET_MS + 800);
    return { ok: false, error: friendly } as const;
  };

  const finishOk = async (data: unknown) => {
    await setLastSyncAt(new Date().toISOString());
    await setLastError('');
    setInventorySyncProgress('completed');
    setTimeout(() => resetInventorySyncProgressIdle(), IDLE_RESET_MS);
    return { ok: true, data } as const;
  };

  try {
    setInventorySyncProgress('checking_steam');
    let detected: string | null = null;
    try {
      detected = await detectLoggedInSteamId64();
    } catch {
      detected = null;
    }
    if (detected !== s.steamExpected) {
      const msg =
        !detected
          ? 'Not logged into Steam in this browser.'
          : 'Wrong Steam account logged in. Log in as your linked account.';
      return finishFail(msg);
    }

    let items;
    try {
      items = await fetchCs2Inventory(s.steamExpected);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Inventory fetch failed';
      return finishFail(raw);
    }

    setInventorySyncProgress('uploading_inventory');
    const idem = randomIdem('inv');
    const res = await apiPost('/api/extension/inventory/sync', s.token, {
      steam_id64: s.steamExpected,
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
