import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  HEADLESS_STEAM_ACCESS,
  automaticSteamRetryMessage,
} from '../src/lib/steam-access';
import {
  detectLoggedInSteamId64,
  parseLoggedInSteamId64FromHtml,
} from '../src/lib/steam-detect';
import { fetchInventoryViaTab } from '../src/lib/steam-tab-fetch';
import { parseSteamMarketPageBootstrap } from '../src/lib/steam-market-history';

const STEAM_ID = '76561198000000001';

export async function runHeadlessSteamTests(): Promise<void> {
  assert.equal(
    parseLoggedInSteamId64FromHtml(`<script>var g_steamID = "${STEAM_ID}";</script>`),
    STEAM_ID
  );
  assert.deepEqual(
    parseSteamMarketPageBootstrap(`
      <script>
        var g_steamID = "${STEAM_ID}";
        var g_sessionID = "session-token";
        var g_rgWalletInfo = {"wallet_currency":3,"wallet_balance":"1234","wallet_delayed_balance":"50"};
      </script>
    `),
    {
      steamId64: STEAM_ID,
      sessionId: 'session-token',
      walletInfo: { wallet_currency: 3, wallet_balance: '1234', wallet_delayed_balance: '50' },
    }
  );
  assert.match(automaticSteamRetryMessage('Steam returned HTTP 429.'), /No tab was opened/);

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(
      `<html><script>var g_steamID = "${STEAM_ID}";</script></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
    assert.equal(await detectLoggedInSteamId64(HEADLESS_STEAM_ACCESS), STEAM_ID);

    const requestedUrls: string[] = [];
    globalThis.fetch = async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      const contextId = /\/730\/16\//.test(url) ? '16' : '2';
      return new Response(JSON.stringify({
        success: 1,
        more_items: false,
        assets: contextId === '2'
          ? [{ assetid: 'asset-1', classid: 'class-1', instanceid: '0', contextid: contextId }]
          : [],
        descriptions: contextId === '2'
          ? [{ classid: 'class-1', instanceid: '0', market_hash_name: 'Test Item' }]
          : [],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const inventory = await fetchInventoryViaTab(STEAM_ID, 730, 2, {
      accessPolicy: HEADLESS_STEAM_ACCESS,
      trackProgress: false,
    });
    assert.equal(inventory.assets.length, 1);
    assert(requestedUrls.some((url) => /\/730\/2\//.test(url)), 'headless inventory requests context 2');
    assert(requestedUrls.some((url) => /\/730\/16\//.test(url)), 'headless inventory requests context 16');
  } finally {
    globalThis.fetch = originalFetch;
  }

  const backgroundSource = readFileSync('src/background.ts', 'utf8');
  const inventorySource = readFileSync('src/lib/steam-tab-fetch.ts', 'utf8');
  const marketSource = readFileSync('src/lib/steam-market-history.ts', 'utf8');
  const inventoryHandlerSource = readFileSync('src/lib/bridge/handlers/sync_inventory.ts', 'utf8');
  const tradeHandlerSource = readFileSync('src/lib/bridge/handlers/sync_trade_offers.ts', 'utf8');
  const marketHandlerSource = readFileSync('src/lib/bridge/handlers/sync_market_history.ts', 'utf8');

  assert(backgroundSource.includes('handleSyncInventory(HEADLESS_STEAM_ACCESS)'));
  assert(backgroundSource.includes('handleSyncTradeOffers(HEADLESS_STEAM_ACCESS)'));
  assert(backgroundSource.includes('handleSyncMarketHistory(HEADLESS_STEAM_ACCESS)'));
  assert(backgroundSource.includes('handleSyncAll(MANUAL_STEAM_ACCESS)'));
  assert(backgroundSource.includes('handleDetectSteam(MANUAL_STEAM_ACCESS)'));
  assert(backgroundSource.includes('handleSyncInventory(MANUAL_STEAM_ACCESS)'));
  assert(backgroundSource.includes('handleSyncTradeOffers(MANUAL_STEAM_ACCESS)'));
  assert(backgroundSource.includes('handleSyncMarketHistory(MANUAL_STEAM_ACCESS)'));
  assert(
    inventorySource.indexOf('if (!allowsSteamTabFallback(accessPolicy))') <
      inventorySource.indexOf("reportProgress('opening_steam_tab')"),
    'inventory tab creation remains behind the manual-only policy gate'
  );
  assert(
    marketSource.indexOf('if (!allowsSteamTabFallback(accessPolicy))') <
      marketSource.indexOf('const tabId = await openFreshSteamMarketTab()'),
    'market tab creation remains behind the manual-only policy gate'
  );
  assert.equal((inventorySource.match(/browser\.tabs\.create/g) ?? []).length, 1);
  assert.equal((marketSource.match(/browser\.tabs\.create/g) ?? []).length, 1);
  assert(/finally\s*\{\s*await closeTabSafe\(tabId\);/.test(inventorySource));
  assert(/finally\s*\{\s*await closeTabSafe\(tabId\);/.test(marketSource));
  assert(inventoryHandlerSource.includes('inventorySyncFlight.run'));
  assert(tradeHandlerSource.includes('tradeOffersSyncFlight.run'));
  assert(marketHandlerSource.includes('marketHistorySyncFlight.run'));
}
