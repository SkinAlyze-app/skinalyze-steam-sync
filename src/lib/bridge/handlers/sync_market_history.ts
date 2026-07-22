import { apiPost, messageFromExtensionApiBody } from '@/lib/api';
import { createSingleFlight } from '@/lib/single-flight';
import { fetchSteamMarketHistoryForSync } from '@/lib/steam-market-history';
import { getPairingForSteamId, getPairings, isSteamSyncEnabledForPairing, setLastError } from '@/lib/storage';
import { detectLoggedInSteamId64 } from '@/lib/steam-detect';
import {
  HEADLESS_STEAM_ACCESS,
  automaticSteamRetryMessage,
  type SteamAccessPolicy,
} from '@/lib/steam-access';
import {
  friendlyMarketHistorySyncError,
  resetMarketHistorySyncProgressIdle,
  setMarketHistorySyncProgress,
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
    resetMarketHistorySyncProgressIdle();
  }, delayMs);
}

const UPLOAD_CHUNK = 200;
type MarketHistorySyncResult = { ok: true; count: number } | { ok: false; error: string };
const marketHistorySyncFlight = createSingleFlight<MarketHistorySyncResult>();

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function runSyncMarketHistory(accessPolicy: SteamAccessPolicy): Promise<MarketHistorySyncResult> {
  clearIdleResetTimer();
  resetMarketHistorySyncProgressIdle();
  setMarketHistorySyncProgress('checking_steam');

  const finishFail = async (msg: string) => {
    const base = friendlyMarketHistorySyncError(msg);
    const friendly = accessPolicy === HEADLESS_STEAM_ACCESS ? automaticSteamRetryMessage(base) : base;
    setMarketHistorySyncProgress('failed', friendly);
    await setLastError(friendly);
    scheduleIdleReset(IDLE_RESET_MS + 800);
    return { ok: false, error: friendly } as const;
  };

  const finishOk = async (count: number) => {
    await setLastError('');
    setMarketHistorySyncProgress('completed');
    scheduleIdleReset(IDLE_RESET_MS);
    return { ok: true, count } as const;
  };

  const finishSkipped = () => {
    resetMarketHistorySyncProgressIdle();
    return { ok: true, count: 0 } as const;
  };

  const pairings = await getPairings();
  if (pairings.length === 0) {
    return finishFail('Not paired');
  }

  try {
    const detected = await detectLoggedInSteamId64(accessPolicy).catch(() => null);
    const pairing = await getPairingForSteamId(detected);
    if (!pairing) {
      return finishFail(
        detected
          ? 'This Steam account is not paired with SkinAlyze. Pair it in Settings → Integrations.'
          : 'Not logged into Steam in this browser.'
      );
    }
    if (!isSteamSyncEnabledForPairing(pairing)) {
      return finishSkipped();
    }

    setMarketHistorySyncProgress('fetching_history', 'Reading Steam market history in the background…');
    let fetched;
    try {
      fetched = await fetchSteamMarketHistoryForSync(pairing.steam_id64, {
        accessPolicy,
        onTabFallback: () => {
          setMarketHistorySyncProgress('opening_market', 'Background read unavailable · opening a temporary Steam tab…');
        },
        onProgress: (p) => {
          setMarketHistorySyncProgress('fetching_history', `Pages ${p.page} · ${p.rows} supported rows`);
        },
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to fetch Steam market history';
      console.warn('[SkinAlyze Sync] Steam market history fetch failed', message);
      return finishFail(message);
    }
    console.info('[SkinAlyze Sync] Steam market history fetched', {
      rows: fetched.rows.length,
      pages_fetched: fetched.meta.pages_fetched,
      requests_made: fetched.meta.requests_made,
      completed_naturally: fetched.meta.completed_naturally,
    });

    const rowChunks = chunkArray(fetched.rows, UPLOAD_CHUNK);
    const batchCount = Math.max(1, rowChunks.length);
    const syncRunId = batchCount > 1 ? randomIdem('mhrun') : null;
    let uploadedTotal = 0;

    for (let i = 0; i < batchCount; i++) {
      const rows = rowChunks[i] ?? [];
      const phase = batchCount > 1 ? 'uploading_batch' : 'uploading_history';
      const detail = batchCount > 1 ? `Batch ${i + 1} of ${batchCount} (${rows.length} rows)` : '';
      setMarketHistorySyncProgress(phase, detail);

      const body: Record<string, unknown> = {
        steam_id64: pairing.steam_id64,
        rows,
        wallet: i === 0 ? fetched.wallet : null,
        idempotency_key: randomIdem('mh'),
        client_meta: {
          pages_fetched: fetched.meta.pages_fetched,
          requests_made: fetched.meta.requests_made,
          total_count: fetched.meta.total_count,
          completed_naturally: fetched.meta.completed_naturally,
          count_per_request: fetched.meta.count_per_request,
          chunk_size: UPLOAD_CHUNK,
        },
      };

      if (syncRunId) {
        body.sync_run_id = syncRunId;
        body.chunk_index = i;
        body.chunk_count = batchCount;
      }

      const res = await apiPost('/api/extension/market-history/sync', pairing.token, body);
      if (!res.ok) {
        const err = messageFromExtensionApiBody(res.data, res.status);
        const suffix =
          batchCount > 1
            ? ` (failed on batch ${i + 1}/${batchCount}; ${uploadedTotal} rows were saved)`
            : '';
        return finishFail(err + suffix);
      }

      const data = res.data as { count?: number; idempotent?: boolean };
      if (!data.idempotent) uploadedTotal += data.count ?? rows.length;
    }

    return finishOk(uploadedTotal || fetched.rows.length);
  } catch (e) {
    return finishFail(e instanceof Error ? e.message : 'Steam market history sync failed');
  }
}

export function handleSyncMarketHistory(
  accessPolicy: SteamAccessPolicy = HEADLESS_STEAM_ACCESS
): Promise<MarketHistorySyncResult> {
  return marketHistorySyncFlight.run(() => runSyncMarketHistory(accessPolicy));
}
