import assert from 'node:assert/strict';

/** Keys we allow on inventory sync POST body (must not include raw HTML, Steam WebAPI session token, or cookies). */
const INVENTORY_SYNC_KEYS = new Set(['steam_id64', 'items', 'idempotency_key']);

/** Keys we allow on trade-offers sync POST body top-level (chunks add offers/history arrays). */
const TRADE_OFFERS_SYNC_KEYS = new Set([
  'steam_id64',
  'offers',
  'trade_history',
  'idempotency_key',
  'sync_run_id',
  'chunk_index',
  'chunk_count',
  'client_meta',
]);

const MARKET_HISTORY_SYNC_KEYS = new Set([
  'steam_id64',
  'rows',
  'wallet',
  'idempotency_key',
  'sync_run_id',
  'chunk_index',
  'chunk_count',
  'client_meta',
]);

const FORBIDDEN_SUBSTRINGS = ['data-loyalty_webapi_token', 'document.cookie', '<html', 'sessionid'];

export function runPayloadShapeTests(): void {
  const invBody = {
    steam_id64: '76561198000000000',
    items: [{ asset_id: '1', market_hash_name: 'AK-47 | Redline (Field-Tested)' }],
    idempotency_key: 'inv_1',
  };
  for (const k of Object.keys(invBody)) {
    assert.ok(INVENTORY_SYNC_KEYS.has(k), `unexpected inventory sync key: ${k}`);
  }
  const serialized = JSON.stringify(invBody);
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    assert.equal(
      serialized.toLowerCase().includes(bad.toLowerCase()),
      false,
      `inventory sync body must not contain ${bad}`
    );
  }

  const tradeBody = {
    steam_id64: '76561198000000000',
    offers: [],
    trade_history: [],
    idempotency_key: 'torun_1',
    client_meta: { offers: {}, history: {}, chunk_size: 200 },
  };
  for (const k of Object.keys(tradeBody)) {
    assert.ok(TRADE_OFFERS_SYNC_KEYS.has(k), `unexpected trade sync key: ${k}`);
  }
  const tradeSerialized = JSON.stringify(tradeBody);
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    assert.equal(
      tradeSerialized.toLowerCase().includes(bad.toLowerCase()),
      false,
      `trade sync body must not contain ${bad}`
    );
  }

  const marketBody = {
    steam_id64: '76561198000000000',
    rows: [
      {
        event_key: 'steam_market:history_row_1',
        side: 'BUY',
        app_id: 730,
        market_hash_name: 'AK-47 | Redline (Field-Tested)',
        display_price: '1,35€',
        steam_currency_id: 3,
        currency: 'EUR',
        price_minor: 135,
        price_numeric: 1.35,
      },
    ],
    wallet: {
      available: 1.35,
      pending: 0,
      steam_currency_id: 3,
      currency: 'EUR',
      raw_available: '1,35€',
      raw_pending: null,
    },
    idempotency_key: 'mh_1',
    client_meta: { pages_fetched: 1, chunk_size: 200 },
  };
  for (const k of Object.keys(marketBody)) {
    assert.ok(MARKET_HISTORY_SYNC_KEYS.has(k), `unexpected market-history sync key: ${k}`);
  }
  const marketSerialized = JSON.stringify(marketBody);
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    assert.equal(
      marketSerialized.toLowerCase().includes(bad.toLowerCase()),
      false,
      `market-history sync body must not contain ${bad}`
    );
  }
}
