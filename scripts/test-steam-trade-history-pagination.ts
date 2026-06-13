import { fetchTradeHistoryWithToken } from '../src/lib/steam-trade';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

type FetchCall = {
  url: URL;
  init: RequestInit | undefined;
};

type MockTradeHistoryPage = {
  response: {
    trades: Record<string, unknown>[];
    more: boolean;
  };
};

const trade = (tradeid: string, timeInit: number): Record<string, unknown> => ({
  tradeid,
  steamid_other: '123456789',
  status: 3,
  time_init: timeInit,
  assets_given: [],
  assets_received: [],
});

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

async function withMockFetch(
  responder: (callIndex: number, url: URL) => Response,
  fn: (calls: FetchCall[]) => Promise<void>
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    calls.push({ url, init });
    return Promise.resolve(responder(calls.length - 1, url));
  }) as typeof fetch;

  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export async function runSteamTradeHistoryPaginationTests(): Promise<void> {
  await withMockFetch(
    () =>
      jsonResponse({
        response: {
          trades: [trade('1001', 1710000000), trade('1002', 1710000060)],
          more: true,
        },
      } satisfies MockTradeHistoryPage),
    async (calls) => {
      const result = await fetchTradeHistoryWithToken('test-token');
      assert(calls.length === 2, 'repeated trade history page stops after one repeated fetch');
      assert(result.trades.length === 2, 'repeated page returns unique trades already fetched');
      assert(result.meta.requestsMade === 2, 'repeated page records requests made');
      assert(result.meta.completedNaturally === false, 'repeated page marks history incomplete');
      assert(calls[0]!.url.searchParams.get('max_trades') === '500', 'trade history uses 500 rows per page');
      assert(
        calls[1]!.url.searchParams.get('start_after_tradeid') === '1002',
        'second history request uses previous last trade id'
      );
      assert(
        calls[1]!.url.searchParams.get('start_after_time') === '1710000060',
        'second history request uses previous last trade time'
      );
    }
  );

  await withMockFetch(
    (callIndex) => {
      const pages: MockTradeHistoryPage[] = [
        {
          response: {
            trades: [trade('2001', 1710000100), trade('2002', 1710000200)],
            more: true,
          },
        },
        {
          response: {
            trades: [trade('2003', 1710000300)],
            more: false,
          },
        },
      ];
      return jsonResponse(pages[callIndex] ?? pages[1]);
    },
    async (calls) => {
      const result = await fetchTradeHistoryWithToken('test-token');
      assert(calls.length === 2, 'normal trade history pagination fetches both pages');
      assert(result.trades.length === 3, 'normal trade history pagination returns all unique trades');
      assert(result.meta.completedNaturally === true, 'normal trade history pagination completes naturally');
      assert(
        calls[1]!.url.searchParams.get('start_after_tradeid') === '2002',
        'normal second page uses previous cursor trade id'
      );
      assert(
        calls[1]!.url.searchParams.get('start_after_time') === '1710000200',
        'normal second page uses previous cursor time'
      );
    }
  );

  await withMockFetch(
    (callIndex) =>
      jsonResponse({
        response: {
          trades: callIndex === 0 ? [trade('3001', 1710000400)] : [trade('3001', 1710000400)],
          more: true,
        },
      } satisfies MockTradeHistoryPage),
    async (calls) => {
      const result = await fetchTradeHistoryWithToken('test-token');
      assert(calls.length === 2, 'no-new-trades page stops before rate-limit loop');
      assert(result.trades.length === 1, 'no-new-trades page preserves first unique trade');
      assert(result.meta.completedNaturally === false, 'no-new-trades page marks history incomplete');
    }
  );
}
