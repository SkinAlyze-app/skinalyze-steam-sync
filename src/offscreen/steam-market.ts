import { fetchSteamMarketHistoryHeadlesslyInDocument } from '@/lib/steam-market-history';
import { browser } from '@/shared/browser-api';

type OffscreenMarketRequest = {
  target?: string;
  type?: string;
  steamId64?: string;
};

browser.runtime.onMessage.addListener((rawMessage: unknown) => {
  const message = rawMessage as OffscreenMarketRequest;
  if (
    message.target !== 'skinalyze-steam-market-offscreen' ||
    message.type !== 'FETCH_STEAM_MARKET_HISTORY_HEADLESS'
  ) {
    return undefined;
  }

  const steamId64 = String(message.steamId64 ?? '').trim();
  if (!/^\d{10,20}$/.test(steamId64)) {
    return Promise.resolve({ ok: false, error: 'Invalid Steam ID for market history.' });
  }

  return fetchSteamMarketHistoryHeadlesslyInDocument(steamId64)
    .then((data) => ({ ok: true, data }))
    .catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'Steam market background read failed.',
    }));
});
