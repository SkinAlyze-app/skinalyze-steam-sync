import { handlePair } from '@/lib/bridge/handlers/pair';
import { handleCheckExtensionMe } from '@/lib/bridge/handlers/check_extension_me';
import { handleGetStatus } from '@/lib/bridge/handlers/get_status';
import { handleDetectSteam } from '@/lib/bridge/handlers/detect_steam';
import { handleSyncInventory } from '@/lib/bridge/handlers/sync_inventory';
import { handleGetBadges } from '@/lib/bridge/handlers/get_badge_data';
import { handleSyncTradeOffers } from '@/lib/bridge/handlers/sync_trade_offers';
import { handleSyncMarketHistory } from '@/lib/bridge/handlers/sync_market_history';
import { handleSyncAll, type SyncAllResult } from '@/lib/bridge/handlers/sync_all';
import { applyPeriodicSyncAlarm, registerPeriodicSync, onAlarm } from '@/lib/alarms';
import { getAutomationSettings, getStorage } from '@/lib/storage';
import { getHydratedSyncProgress } from '@/lib/sync-progress';
import { createSingleFlight } from '@/lib/single-flight';
import type { ExtensionMessage, ExtensionResponse } from '@/shared/types';

let lastHybridInv = 0;
let lastHybridOffers = 0;
let lastHybridMarketHistory = 0;
const detectSteamFlight = createSingleFlight<Awaited<ReturnType<typeof handleDetectSteam>>>();
const syncAllFlight = createSingleFlight<SyncAllResult>();

async function dispatch(msg: ExtensionMessage): Promise<ExtensionResponse> {
  try {
    switch (msg.type) {
      case 'PAIR': {
        const r = await handlePair(msg.code);
        if (r.ok) await applyPeriodicSyncAlarm();
        return r.ok ? { ok: true, data: r } : { ok: false, error: r.error };
      }
      case 'GET_STATUS': {
        const data = await handleGetStatus();
        return { ok: true, data };
      }
      case 'CHECK_EXTENSION_ME': {
        const r = await handleCheckExtensionMe();
        if ('error' in r) return { ok: false, error: r.error };
        return { ok: true, data: r };
      }
      case 'DETECT_STEAM': {
        const data = await detectSteamFlight.run(handleDetectSteam);
        return { ok: true, data };
      }
      case 'SYNC_ALL': {
        const run = syncAllFlight.start(handleSyncAll);
        void run.promise.catch(() => undefined);
        return { ok: true, data: { started: run.started, already_running: !run.started } };
      }
      case 'SYNC_INVENTORY': {
        const r = await handleSyncInventory();
        return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
      }
      case 'GET_SYNC_PROGRESS': {
        const data = await getHydratedSyncProgress();
        return { ok: true, data };
      }
      case 'GET_BADGES': {
        const r = await handleGetBadges(msg.assetIds, msg.steamId64);
        if ('error' in r) return { ok: false, error: r.error };
        return { ok: true, data: r };
      }
      case 'SYNC_TRADE_OFFERS': {
        const r = await handleSyncTradeOffers();
        return r.ok ? { ok: true, data: r } : { ok: false, error: r.error };
      }
      case 'SYNC_MARKET_HISTORY': {
        const r = await handleSyncMarketHistory();
        return r.ok ? { ok: true, data: r } : { ok: false, error: r.error };
      }
      default:
        return { ok: false, error: 'Unknown message' };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error' };
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'EXECUTE_PAGE_STEAM') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: 'No tab' });
      return false;
    }
    void chrome.scripting
      .executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const w = window as unknown as { g_steamID?: string };
          return w.g_steamID ?? '';
        },
      })
      .then((inj) => {
        const steam = String(inj[0]?.result ?? '');
        sendResponse({ ok: true, steam });
      })
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  }

  void dispatch(message).then(sendResponse);
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  registerPeriodicSync();
});

registerPeriodicSync();

chrome.runtime.onStartup.addListener(() => {
  void applyPeriodicSyncAlarm();
});

onAlarm(async () => {
  const st = await getStorage();
  if (st.pairings.length === 0) return;
  const s = await getAutomationSettings();
  if (!s.autoSyncEnabled) return;
  if (s.autoSyncInventory) await handleSyncInventory();
  if (s.autoSyncOffers) await handleSyncTradeOffers();
  if (s.autoSyncMarketHistory) await handleSyncMarketHistory();
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status !== 'complete') return;
  const url = tab.url ?? '';
  if (!url.includes('steamcommunity.com')) return;

  void (async () => {
    const auto = await getAutomationSettings();
    if (!auto.autoSyncEnabled || !auto.hybridOnActivePage) return;
    const st = await getStorage();
    if (st.pairings.length === 0) return;

    const now = Date.now();
    const invPath = /steamcommunity\.com\/(id|profiles)\/[^/]+\/inventory/i.test(url);
    const offersPath = /steamcommunity\.com\/(id|profiles)\/[^/]+\/tradeoffers/i.test(url);
    const marketPath = /steamcommunity\.com\/market\/?(\?|#|$)/i.test(url);

    if (auto.autoSyncInventory && invPath) {
      if (now - lastHybridInv < auto.hybridCooldownMs) return;
      lastHybridInv = now;
      await handleSyncInventory();
    }
    if (auto.autoSyncOffers && offersPath) {
      if (now - lastHybridOffers < auto.hybridCooldownMs) return;
      lastHybridOffers = now;
      await handleSyncTradeOffers();
    }
    if (auto.autoSyncMarketHistory && marketPath) {
      if (now - lastHybridMarketHistory < auto.hybridCooldownMs) return;
      lastHybridMarketHistory = now;
      await handleSyncMarketHistory();
    }
  })();
});
