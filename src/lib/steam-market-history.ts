import {
  STEAM_ECURRENCY_TO_ISO,
  type SteamCurrencyCode,
  type ParsedSteamMoney,
} from '@/lib/steam-market-history-parser';

const LOAD_TIMEOUT_MS = 15000;
const POST_LOAD_DELAY_MS = 1200;
const MARKET_HISTORY_COUNT = 50;
const MARKET_HISTORY_MAX_PAGES = 20;

export type SteamMarketHistoryRowForSync = {
  event_key: string;
  row_id: string | null;
  side: 'BUY' | 'SELL';
  app_id: number;
  context_id: string | null;
  asset_id: string | null;
  class_id: string | null;
  instance_id: string | null;
  unowned_id: string | null;
  unowned_context_id: string | null;
  market_hash_name: string;
  item_name: string | null;
  game_name: string | null;
  icon_url: string | null;
  listed_at: string | null;
  acted_at: string | null;
  listed_on_raw: string | null;
  acted_on_raw: string | null;
  display_price: string | null;
  steam_currency_id: number | null;
  currency: SteamCurrencyCode | null;
  price_minor: number | null;
  price_numeric: number;
  raw: Record<string, unknown>;
};

export type SteamMarketWalletForSync = {
  available: number | null;
  pending: number | null;
  steam_currency_id: number | null;
  currency: SteamCurrencyCode | null;
  raw_available: string | null;
  raw_pending: string | null;
};

export type SteamMarketHistoryFetchResult = {
  rows: SteamMarketHistoryRowForSync[];
  wallet: SteamMarketWalletForSync | null;
  meta: {
    pages_fetched: number;
    requests_made: number;
    total_count: number | null;
    completed_naturally: boolean;
    count_per_request: number;
  };
};

type PageMarketHistoryResult =
  | { ok: true; data: SteamMarketHistoryFetchResult }
  | { ok: false; error: string };

function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error('Steam market page load timed out. Open steamcommunity.com and try again.')));
    }, timeoutMs);

    function onRemoved(removedTabId: number) {
      if (removedTabId !== tabId) return;
      finish(() => reject(new Error('Steam market tab was closed before it finished loading.')));
    }

    function onUpdated(id: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) {
      if (id !== tabId || info.status !== 'complete') return;
      if (tab.url && tab.url.includes('steamcommunity.com')) finish(() => resolve());
    }

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
    void chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        finish(() => reject(new Error('Steam market tab was closed before it finished loading.')));
        return;
      }
      if (tab.status === 'complete' && tab.url?.includes('steamcommunity.com')) {
        finish(() => resolve());
      }
    });
  });
}

async function openFreshSteamMarketTab(): Promise<number> {
  const tab = await chrome.tabs.create({ url: 'https://steamcommunity.com/market/', active: false });
  if (tab.id == null) throw new Error('Could not open a Steam market tab');
  await waitForTabComplete(tab.id, LOAD_TIMEOUT_MS);
  await new Promise((r) => setTimeout(r, POST_LOAD_DELAY_MS));
  return tab.id;
}

async function closeTabSafe(tabId: number): Promise<void> {
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    /* already closed */
  }
}

async function readMarketHistoryFromPageMain(
  expectedSteamId64: string,
  maxPages: number,
  count: number,
  currencyMap: Record<string, SteamCurrencyCode>
): Promise<PageMarketHistoryResult> {
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const text = (el: Element | null | undefined): string | null => {
    const s = el?.textContent?.replace(/\u00a0/g, ' ').trim() ?? '';
    return s || null;
  };
  const steamCurrencyCodeFromId = (value: unknown): SteamCurrencyCode | null => {
    const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(n)) return null;
    return currencyMap[String(Math.floor(n))] ?? null;
  };
  const parseMoney = (displayPrice: string | null | undefined): ParsedSteamMoney | null => {
    const raw = String(displayPrice ?? '').replace(/\u00a0/g, ' ').trim();
    if (!raw) return null;
    let numeric = raw.replace(/[^\d,.\-]/g, '');
    if (!numeric || numeric === '-' || numeric === ',' || numeric === '.') return null;
    const negative = numeric.includes('-');
    numeric = numeric.replace(/-/g, '');
    const lastComma = numeric.lastIndexOf(',');
    const lastDot = numeric.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : lastDot >= 0 ? '.' : '';
    if (decimalSep) {
      const otherSep = decimalSep === ',' ? '.' : ',';
      const parts = numeric.split(decimalSep);
      const after = parts[parts.length - 1] ?? '';
      if (after.length === 2) {
        numeric = `${parts.slice(0, -1).join('').replaceAll(otherSep, '')}.${after}`;
      } else {
        numeric = numeric.replace(/[,.]/g, '');
      }
    }
    const major = Number.parseFloat(numeric);
    if (!Number.isFinite(major)) return null;
    const signed = negative ? -major : major;
    return { price_numeric: Math.round(signed * 100) / 100, price_minor: Math.round(signed * 100) };
  };
  const monthMap: Record<string, number> = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
    jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
    oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };
  const parseMarketDate = (raw: string | null): string | null => {
    if (!raw) return null;
    const clean = raw.replace(/\u00a0/g, ' ').trim();
    if (!clean) return null;
    const explicit = new Date(clean);
    if (Number.isFinite(explicit.getTime()) && /\d{4}/.test(clean)) return explicit.toISOString();
    const m =
      clean.match(/(\d{1,2})\s+([A-Za-z]{3,9})(?:[\s,]+(\d{4}))?/i) ||
      clean.match(/([A-Za-z]{3,9})\s+(\d{1,2})(?:[\s,]+(\d{4}))?/i);
    if (!m) return null;
    const day = Number.parseInt(/^\d/.test(m[1] ?? '') ? String(m[1]) : String(m[2]), 10);
    const monthKey = (/^\d/.test(m[1] ?? '') ? String(m[2]) : String(m[1])).toLowerCase();
    const month = monthMap[monthKey];
    if (!Number.isFinite(day) || month == null) return null;
    const now = new Date();
    let year = Number.parseInt(String(m[3] ?? ''), 10);
    if (!Number.isFinite(year)) year = now.getUTCFullYear();
    let candidate = new Date(Date.UTC(year, month, day, 12, 0, 0));
    if (!m[3] && candidate.getTime() - now.getTime() > 2 * 24 * 60 * 60 * 1000) {
      candidate = new Date(Date.UTC(year - 1, month, day, 12, 0, 0));
    }
    return candidate.toISOString();
  };
  const supportsItem = (appid: number, name: string): boolean =>
    appid === 730 || (appid === 440 && name.trim() === 'Mann Co. Supply Crate Key');
  const eventKey = (parts: {
    rowId?: string | null;
    side: string;
    appId: number;
    assetId?: string | null;
    marketHashName: string;
    actedOnRaw?: string | null;
    displayPrice?: string | null;
    index?: number;
  }): string => {
    if (parts.rowId?.trim()) return `steam_market:${parts.rowId.trim()}`;
    const raw = [
      parts.side,
      parts.appId,
      parts.assetId ?? '',
      parts.marketHashName,
      parts.actedOnRaw ?? '',
      parts.displayPrice ?? '',
      parts.index ?? 0,
    ].join('|');
    return `steam_market:${encodeURIComponent(raw).replace(/%/g, '').slice(0, 180)}`;
  };
  const findHoverAsset = (
    hovers: unknown,
    rowId: string
  ): { appId: number; contextId: string; assetId: string } | null => {
    const src = typeof hovers === 'string' ? hovers : Array.isArray(hovers) ? hovers.join('\n') : '';
    if (!src || !rowId) return null;
    const escaped = rowId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
      `CreateItemHoverFromContainer\\(\\s*g_rgAssets\\s*,\\s*['"][^'"]*${escaped}[^'"]*['"]\\s*,\\s*(\\d+)\\s*,\\s*['"]?([^'",\\s)]+)['"]?\\s*,\\s*['"]?([^'",\\s)]+)['"]?`,
      'i'
    );
    const m = src.match(re);
    if (!m) return null;
    return { appId: Number(m[1]), contextId: String(m[2]), assetId: String(m[3]) };
  };
  const assetLookup = (
    assets: unknown,
    appId: number | null,
    contextId: string | null,
    assetId: string | null,
    fallbackName: string | null
  ): Record<string, unknown> | null => {
    if (!assets || typeof assets !== 'object') return null;
    if (appId != null && contextId && assetId) {
      const byApp = (assets as Record<string, unknown>)[String(appId)];
      const byCtx = byApp && typeof byApp === 'object' ? (byApp as Record<string, unknown>)[String(contextId)] : null;
      const found = byCtx && typeof byCtx === 'object' ? (byCtx as Record<string, unknown>)[String(assetId)] : null;
      if (found && typeof found === 'object') return found as Record<string, unknown>;
    }
    if (fallbackName) {
      for (const app of Object.values(assets as Record<string, unknown>)) {
        if (!app || typeof app !== 'object') continue;
        for (const ctx of Object.values(app as Record<string, unknown>)) {
          if (!ctx || typeof ctx !== 'object') continue;
          for (const candidate of Object.values(ctx as Record<string, unknown>)) {
            if (!candidate || typeof candidate !== 'object') continue;
            const c = candidate as Record<string, unknown>;
            const name = String(c.market_hash_name ?? c.market_name ?? c.name ?? '').trim();
            if (name === fallbackName) return c;
          }
        }
      }
    }
    return null;
  };
  const parseRows = (
    resultsHtml: string,
    hovers: unknown,
    assets: unknown,
    walletCurrencyId: number | null,
    walletCurrency: SteamCurrencyCode | null
  ): SteamMarketHistoryRowForSync[] => {
    if (!resultsHtml) return [];
    const doc = new DOMParser().parseFromString(resultsHtml, 'text/html');
    const nodes = Array.from(doc.querySelectorAll('.market_listing_row, .market_recent_listing_row'));
    const out: SteamMarketHistoryRowForSync[] = [];
    nodes.forEach((node, index) => {
      const sign = text(node.querySelector('.market_listing_gainorloss')) ?? '';
      const side = sign.includes('+') ? 'BUY' : sign.includes('-') ? 'SELL' : null;
      if (!side) return;
      const rowId = (node.getAttribute('id') ?? '').trim() || null;
      const itemName = text(node.querySelector('.market_listing_item_name'));
      const gameName = text(node.querySelector('.market_listing_game_name'));
      const priceText = text(node.querySelector('.market_listing_price'));
      const dates = Array.from(node.querySelectorAll('.market_listing_listed_date'));
      const actedOnRaw = text(dates[0]);
      const listedOnRaw = text(dates[1]);
      const hover = rowId ? findHoverAsset(hovers, rowId) : null;
      const asset = assetLookup(assets, hover?.appId ?? null, hover?.contextId ?? null, hover?.assetId ?? null, itemName);
      const appId = Number(asset?.appid ?? hover?.appId ?? 0);
      const contextId = String(asset?.contextid ?? hover?.contextId ?? '') || null;
      const assetId = String(asset?.assetid ?? hover?.assetId ?? '') || null;
      const marketHashName = String(asset?.market_hash_name ?? asset?.market_name ?? itemName ?? '').trim();
      if (!Number.isFinite(appId) || !marketHashName || !supportsItem(appId, marketHashName)) return;
      const money = parseMoney(priceText);
      if (!money) return;
      out.push({
        event_key: eventKey({
          rowId,
          side,
          appId,
          assetId,
          marketHashName,
          actedOnRaw,
          displayPrice: priceText,
          index,
        }),
        row_id: rowId,
        side,
        app_id: appId,
        context_id: contextId,
        asset_id: assetId,
        class_id: asset?.classid != null ? String(asset.classid) : null,
        instance_id: asset?.instanceid != null ? String(asset.instanceid) : null,
        unowned_id: asset?.unowned_id != null ? String(asset.unowned_id) : null,
        unowned_context_id: asset?.unowned_contextid != null ? String(asset.unowned_contextid) : null,
        market_hash_name: marketHashName,
        item_name: itemName,
        game_name: gameName,
        icon_url: asset?.icon_url != null ? String(asset.icon_url) : null,
        listed_at: parseMarketDate(listedOnRaw),
        acted_at: parseMarketDate(actedOnRaw),
        listed_on_raw: listedOnRaw,
        acted_on_raw: actedOnRaw,
        display_price: priceText,
        steam_currency_id: walletCurrencyId,
        currency: walletCurrency,
        price_minor: money.price_minor,
        price_numeric: money.price_numeric,
        raw: {
          row_id: rowId,
          asset_key: appId && contextId && assetId ? `${appId}:${contextId}:${assetId}` : null,
          wallet_currency_id: walletCurrencyId,
          wallet_currency: walletCurrency,
        },
      });
    });
    return out;
  };
  const parsePendingFromPage = (): string | null => {
    const candidates = Array.from(
      document.querySelectorAll('[id*="pending"], [class*="pending"], [id*="delayed"], [class*="delayed"]')
    );
    for (const candidate of candidates) {
      const v = text(candidate);
      if (v && /\d/.test(v) && /pending|delayed|hold/i.test(v)) return v;
    }
    return null;
  };

  try {
    const w = window as unknown as {
      g_steamID?: string;
      g_sessionID?: string;
      g_rgWalletInfo?: Record<string, unknown>;
    };
    const actualSteamId = String(w.g_steamID ?? '').trim();
    if (!actualSteamId) return { ok: false, error: 'Not logged into Steam in this browser.' };
    if (expectedSteamId64 && actualSteamId !== expectedSteamId64) {
      return { ok: false, error: `Wrong Steam account (browser: ${actualSteamId}).` };
    }

    const walletInfo = w.g_rgWalletInfo ?? {};
    const walletCurrencyIdRaw = Number(walletInfo.wallet_currency);
    const walletCurrencyId = Number.isFinite(walletCurrencyIdRaw) ? Math.floor(walletCurrencyIdRaw) : null;
    const walletCurrency = steamCurrencyCodeFromId(walletCurrencyId);
    const rawAvailable = text(document.querySelector('#header_wallet_balance'));
    const walletBalanceRaw = Number(walletInfo.wallet_balance);
    const available =
      Number.isFinite(walletBalanceRaw) && walletBalanceRaw >= 0
        ? Math.round(walletBalanceRaw) / 100
        : parseMoney(rawAvailable)?.price_numeric ?? null;
    const rawPending = parsePendingFromPage();
    const delayedRaw = Number(walletInfo.wallet_delayed_balance);
    const pending =
      Number.isFinite(delayedRaw) && delayedRaw >= 0
        ? Math.round(delayedRaw) / 100
        : parseMoney(rawPending)?.price_numeric ?? 0;

    const sessionId = String(w.g_sessionID ?? '').trim();
    const rowsByKey = new Map<string, SteamMarketHistoryRowForSync>();
    let requestsMade = 0;
    let pagesFetched = 0;
    let totalCount: number | null = null;
    let completedNaturally = false;

    for (let page = 0; page < maxPages; page++) {
      const start = page * count;
      const url = `https://steamcommunity.com/market/myhistory/?start=${start}&count=${count}`;
      const init: RequestInit = sessionId
        ? {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: `sessionid=${encodeURIComponent(sessionId)}`,
          }
        : { method: 'GET', credentials: 'include' };
      const res = await fetch(url, init);
      requestsMade += 1;
      if (!res.ok) return { ok: false, error: `Steam market history HTTP ${res.status}` };
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!json || (json.success !== true && json.success !== 1)) {
        return { ok: false, error: 'Steam did not return market history.' };
      }
      const pageRows = parseRows(
        typeof json.results_html === 'string' ? json.results_html : '',
        json.hovers,
        json.assets,
        walletCurrencyId,
        walletCurrency
      );
      for (const row of pageRows) rowsByKey.set(row.event_key, row);
      pagesFetched += 1;
      const total = Number(json.total_count);
      if (Number.isFinite(total)) totalCount = total;
      if (!json.results_html || (totalCount != null && start + count >= totalCount)) {
        completedNaturally = true;
        break;
      }
      await sleep(1200);
    }

    return {
      ok: true,
      data: {
        rows: [...rowsByKey.values()],
        wallet: {
          available,
          pending,
          steam_currency_id: walletCurrencyId,
          currency: walletCurrency,
          raw_available: rawAvailable,
          raw_pending: rawPending,
        },
        meta: {
          pages_fetched: pagesFetched,
          requests_made: requestsMade,
          total_count: totalCount,
          completed_naturally: completedNaturally,
          count_per_request: count,
        },
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Steam market history fetch failed' };
  }
}

export async function fetchSteamMarketHistoryForSync(
  steamId64: string,
  onProgress?: (p: { page: number; rows: number }) => void
): Promise<SteamMarketHistoryFetchResult> {
  const tabId = await openFreshSteamMarketTab();
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: readMarketHistoryFromPageMain,
      args: [steamId64, MARKET_HISTORY_MAX_PAGES, MARKET_HISTORY_COUNT, STEAM_ECURRENCY_TO_ISO],
    });
    const result = results[0]?.result as PageMarketHistoryResult | undefined;
    if (!result || !result.ok) throw new Error((result as { error?: string } | undefined)?.error || 'Steam market read failed');
    onProgress?.({ page: result.data.meta.pages_fetched, rows: result.data.rows.length });
    return result.data;
  } finally {
    await closeTabSafe(tabId);
  }
}
