import { apiPost, messageFromExtensionApiBody } from '@/lib/api';
import { fetchTradeOffersAndHistoryForSync } from '@/lib/steam-trade';
import { getPairingForSteamId, getPairings, setLastError } from '@/lib/storage';
import { detectLoggedInSteamId64 } from '@/lib/steam-detect';
import {
  friendlyTradeOffersSyncError,
  resetTradeOffersSyncProgressIdle,
  setTradeOffersSyncProgress,
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
    resetTradeOffersSyncProgressIdle();
  }, delayMs);
}

/** Keep under typical body limits; server upserts in bulk per chunk */
const UPLOAD_CHUNK = 200;

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

export async function handleSyncTradeOffers(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  clearIdleResetTimer();
  resetTradeOffersSyncProgressIdle();
  setTradeOffersSyncProgress('checking_steam');

  const finishFail = async (msg: string) => {
    const friendly = friendlyTradeOffersSyncError(msg);
    setTradeOffersSyncProgress('failed', friendly);
    await setLastError(friendly);
    scheduleIdleReset(IDLE_RESET_MS + 800);
    return { ok: false, error: friendly } as const;
  };

  const finishOk = async (count: number) => {
    await setLastError('');
    setTradeOffersSyncProgress('completed');
    scheduleIdleReset(IDLE_RESET_MS);
    return { ok: true, count } as const;
  };

  const pairings = await getPairings();
  if (pairings.length === 0) {
    return finishFail('Not paired');
  }

  try {
    const detected = await detectLoggedInSteamId64().catch(() => null);
    const pairing = await getPairingForSteamId(detected);
    if (!pairing) {
      return finishFail(
        detected
          ? 'This Steam account is not paired with SkinAlyze. Pair it in Settings → Integrations.'
          : 'Not logged into Steam in this browser.'
      );
    }

    setTradeOffersSyncProgress('fetching_history');
    let offers;
    let tradeHistory;
    let fetchMeta;
    try {
      const result = await fetchTradeOffersAndHistoryForSync((p) => {
        if (p.phase === 'offers') {
          setTradeOffersSyncProgress(
            'fetching_history',
            `Offers · ${p.data.mode.replace(/_/g, ' ')} · page ${p.data.pageInMode} · ${p.data.offersAccumulated} offers`
          );
        } else {
          setTradeOffersSyncProgress(
            'fetching_history',
            `Trade history · page ${p.page} · ${p.tradesAccumulated} trades`
          );
        }
      });
      offers = result.offers;
      tradeHistory = result.trade_history;
      fetchMeta = result.meta;
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Failed to fetch trade data';
      return finishFail(raw);
    }

    if (offers.length === 0 && tradeHistory.length === 0) {
      return finishOk(0);
    }

    const offerChunks = chunkArray(offers, UPLOAD_CHUNK);
    const historyChunks = chunkArray(tradeHistory, UPLOAD_CHUNK);
    const batchCount = Math.max(offerChunks.length, historyChunks.length);

    const syncRunId = batchCount > 1 ? randomIdem('torun') : null;
    let uploadedTotal = 0;

    for (let i = 0; i < batchCount; i++) {
      const offerSlice = offerChunks[i] ?? [];
      const historySlice = historyChunks[i] ?? [];

      const phase = batchCount > 1 ? 'uploading_batch' : 'uploading_offers';
      const detail =
        batchCount > 1
          ? `Batch ${i + 1} of ${batchCount} (${offerSlice.length} offers, ${historySlice.length} trades)`
          : '';
      setTradeOffersSyncProgress(phase, detail);

      const idem = randomIdem('to');
      const body: Record<string, unknown> = {
        steam_id64: pairing.steam_id64,
        offers: offerSlice,
        trade_history: historySlice,
        idempotency_key: idem,
      };

      if (syncRunId) {
        body.sync_run_id = syncRunId;
        body.chunk_index = i;
        body.chunk_count = batchCount;
      }

      body.client_meta = {
        offers: {
          pages_fetched: fetchMeta.offers.pagesFetched,
          requests_made: fetchMeta.offers.requestsMade,
          completed_naturally: fetchMeta.offers.completedNaturally,
          unique_offer_count: fetchMeta.offers.uniqueOfferCount,
          modes_used: fetchMeta.offers.modesUsed,
        },
        history: {
          pages_fetched: fetchMeta.history.pagesFetched,
          requests_made: fetchMeta.history.requestsMade,
          completed_naturally: fetchMeta.history.completedNaturally,
          trade_count: fetchMeta.history.tradeCount,
        },
        chunk_size: UPLOAD_CHUNK,
      };

      const res = await apiPost('/api/extension/trade-offers/sync', pairing.token, body);

      if (!res.ok) {
        const err = messageFromExtensionApiBody(res.data, res.status);
        const suffix =
          batchCount > 1
            ? ` (failed on batch ${i + 1}/${batchCount}; ${uploadedTotal} rows were saved)`
            : '';
        return finishFail(err + suffix);
      }

      const data = res.data as { count?: number; idempotent?: boolean };
      if (!data.idempotent) {
        uploadedTotal += data.count ?? offerSlice.length + historySlice.length;
      }
    }

    const reported = uploadedTotal || offers.length + tradeHistory.length;
    return finishOk(reported);
  } catch (e) {
    const raw = e instanceof Error ? e.message : 'Trade offer sync failed';
    return finishFail(raw);
  }
}
