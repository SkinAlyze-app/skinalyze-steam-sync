import assert from 'node:assert/strict';
import {
  parseSteamMarketDate,
  parseSteamMoney,
  stableSteamMarketEventKey,
  steamCurrencyCodeFromId,
  supportsSteamMarketItem,
} from '../src/lib/steam-market-history-parser';

export function runMarketHistoryTests(): void {
  assert.equal(steamCurrencyCodeFromId(1), 'USD');
  assert.equal(steamCurrencyCodeFromId(3), 'EUR');
  assert.equal(steamCurrencyCodeFromId(23), 'CNY');
  assert.equal(steamCurrencyCodeFromId(8), 'JPY');
  assert.equal(steamCurrencyCodeFromId(16), 'KRW');
  assert.equal(steamCurrencyCodeFromId(32), 'AED');
  assert.equal(steamCurrencyCodeFromId(33), 'SEK');

  assert.deepEqual(parseSteamMoney('$1.35'), { price_numeric: 1.35, price_minor: 135 });
  assert.deepEqual(parseSteamMoney('1,35€'), { price_numeric: 1.35, price_minor: 135 });
  assert.deepEqual(parseSteamMoney('CN¥ 12.34'), { price_numeric: 12.34, price_minor: 1234 });
  assert.deepEqual(parseSteamMoney('¥100'), { price_numeric: 100, price_minor: 10000 });
  assert.deepEqual(parseSteamMoney('₩1,000'), { price_numeric: 1000, price_minor: 100000 });
  assert.deepEqual(parseSteamMoney('AED 1.23'), { price_numeric: 1.23, price_minor: 123 });
  assert.deepEqual(parseSteamMoney('SEK 12,34'), { price_numeric: 12.34, price_minor: 1234 });

  assert.equal(supportsSteamMarketItem(730, 'AK-47 | Redline (Field-Tested)'), true);
  assert.equal(supportsSteamMarketItem(440, 'Mann Co. Supply Crate Key'), true);
  assert.equal(supportsSteamMarketItem(440, 'Backpack Expander'), false);
  assert.equal(supportsSteamMarketItem(570, 'Treasure'), false);

  assert.equal(
    parseSteamMarketDate('19 Mar', new Date('2026-06-11T12:00:00.000Z')),
    '2026-03-19T12:00:00.000Z'
  );
  assert.equal(
    parseSteamMarketDate('20 Dec', new Date('2026-01-11T12:00:00.000Z')),
    '2025-12-20T12:00:00.000Z'
  );

  assert.equal(
    stableSteamMarketEventKey({
      rowId: 'history_row_123',
      side: 'BUY',
      appId: 730,
      marketHashName: 'AK-47 | Redline (Field-Tested)',
    }),
    'steam_market:history_row_123'
  );
}
