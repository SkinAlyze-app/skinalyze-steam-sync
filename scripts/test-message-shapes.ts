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

const FORBIDDEN_SUBSTRINGS = ['data-loyalty_webapi_token', 'document.cookie', '<html'];

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
}
