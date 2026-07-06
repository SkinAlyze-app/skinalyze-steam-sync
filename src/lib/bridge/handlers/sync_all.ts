import { handleSyncInventory } from '@/lib/bridge/handlers/sync_inventory';
import { handleSyncTradeOffers } from '@/lib/bridge/handlers/sync_trade_offers';
import { handleSyncMarketHistory } from '@/lib/bridge/handlers/sync_market_history';
import {
  resetInventorySyncProgressIdle,
  resetMarketHistorySyncProgressIdle,
  resetTradeOffersSyncProgressIdle,
} from '@/lib/sync-progress';

export type SyncAllResult =
  | {
      ok: true;
      inventory: unknown;
      tradeOffers: { count: number };
      marketHistory: { count: number };
    }
  | { ok: false; error: string };

export async function handleSyncAll(): Promise<SyncAllResult> {
  resetInventorySyncProgressIdle();
  resetTradeOffersSyncProgressIdle();
  resetMarketHistorySyncProgressIdle();

  const inventory = await handleSyncInventory();
  if (!inventory.ok) return { ok: false, error: inventory.error };
  const inventoryData = inventory.data as { skipped?: boolean; reason?: string } | undefined;
  if (inventoryData?.skipped && inventoryData.reason === 'steam_sync_disabled') {
    return {
      ok: true,
      inventory: inventory.data,
      tradeOffers: { count: 0 },
      marketHistory: { count: 0 },
    };
  }

  const tradeOffers = await handleSyncTradeOffers();
  if (!tradeOffers.ok) return { ok: false, error: tradeOffers.error };

  const marketHistory = await handleSyncMarketHistory();
  if (!marketHistory.ok) return { ok: false, error: marketHistory.error };

  return {
    ok: true,
    inventory: inventory.data,
    tradeOffers: { count: tradeOffers.count },
    marketHistory: { count: marketHistory.count },
  };
}
