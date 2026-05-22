import {
  mergeNormalizedOffersPreservingItems,
  mergeTradeOfferItemPair,
  mergeTradeOfferItemLists,
} from '../src/lib/trade-offer-steam-merge';

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(msg);
};

export function runTradeOfferMergeTests(): void {
  assert(
    mergeTradeOfferItemPair(
      { asset_id: '1', market_hash_name: 'AK-47 | Redline' },
      { asset_id: '1', icon_url: '-iconhash' }
    ).market_hash_name === 'AK-47 | Redline',
    'mergeTradeOfferItemPair keeps name from first'
  );
  assert(
    mergeTradeOfferItemPair(
      { asset_id: '1' },
      { asset_id: '1', market_hash_name: 'M4A1-S | Cyrex' }
    ).market_hash_name === 'M4A1-S | Cyrex',
    'mergeTradeOfferItemPair fills name from second'
  );

  const zip = mergeTradeOfferItemLists(
    [{ asset_id: '10', market_hash_name: 'A' }],
    [{ asset_id: '10', icon_url: 'i' }]
  );
  assert(zip.length === 1, 'zip merge length');
  assert(zip[0]!.market_hash_name === 'A' && zip[0]!.icon_url === 'i', 'zip merge combines fields');

  const swapped = mergeTradeOfferItemLists(
    [{ asset_id: '2', market_hash_name: 'Rare' }],
    [{ asset_id: '2' }]
  );
  assert(swapped[0]!.market_hash_name === 'Rare', 'same asset id merges across primary/secondary');

  const sparseNewer = {
    offer_id: '9001',
    partner_steam_id64: '76561198000000000',
    offer_state: 3,
    is_our_offer: false,
    message: null,
    expiration_time: null,
    time_created: '2024-01-02T00:00:00.000Z',
    time_updated: '2024-01-03T00:00:00.000Z',
    items_to_receive: [{ asset_id: '99' }],
    items_to_give: [],
  };
  const richOlder = {
    offer_id: '9001',
    partner_steam_id64: '76561198000000000',
    offer_state: 3,
    is_our_offer: false,
    message: null,
    expiration_time: null,
    time_created: '2024-01-01T00:00:00.000Z',
    time_updated: '2024-01-02T00:00:00.000Z',
    items_to_receive: [
      { asset_id: '99', market_hash_name: 'USP-S | Kill Confirmed', icon_url: '-9a' },
    ],
    items_to_give: [],
  };

  const merged = mergeNormalizedOffersPreservingItems(richOlder, sparseNewer);
  assert(merged.time_updated === sparseNewer.time_updated, 'newer scalar timestamps win');
  assert(
    merged.items_to_receive[0]?.market_hash_name === 'USP-S | Kill Confirmed',
    'rich item metadata survives newer sparse snapshot'
  );
}
