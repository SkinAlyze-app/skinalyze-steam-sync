import assert from 'node:assert/strict';

import {
  friendlyMarketHistorySyncError,
  isProgressSliceActiveInv,
  isProgressSliceVisibleInv,
  isProgressSliceVisibleMh,
  isProgressSliceVisibleTo,
  INVENTORY_READING_STALE_MS,
  TERMINAL_TTL_MS,
  type InventorySyncPhase,
  type SyncProgressSlice,
} from '../src/lib/sync-progress';

function invSlice(
  phase: InventorySyncPhase,
  updatedAt: number,
  percent = phase === 'completed' ? 100 : 40
): SyncProgressSlice<InventorySyncPhase> {
  return {
    phase,
    label: phase,
    percent,
    updatedAt,
  };
}

export function runSyncProgressVisibilityTests(): void {
  assert.equal(
    friendlyMarketHistorySyncError('Steam market history HTTP 429'),
    'Steam rate-limited market history. Inventory and trade offers can still sync. Wait a few minutes before retrying.'
  );

  const realNow = Date.now;
  const now = 1_000_000;

  try {
    Date.now = () => now;

    const active = invSlice('reading_inventory', now);
    assert.equal(isProgressSliceVisibleInv(active), true, 'active progress should hydrate as visible');
    assert.equal(isProgressSliceActiveInv(active), true, 'active progress should block actions');

    const oldReadingInventory = invSlice('reading_inventory', now - INVENTORY_READING_STALE_MS - 1);
    assert.equal(
      isProgressSliceVisibleInv(oldReadingInventory),
      false,
      'stale reading-inventory progress should clear after the hard read timeout'
    );
    assert.equal(
      isProgressSliceActiveInv(oldReadingInventory),
      false,
      'stale reading-inventory progress should not block actions after popup reopen'
    );

    const terminal = invSlice('completed', now);
    assert.equal(isProgressSliceVisibleInv(terminal), true, 'fresh terminal progress should remain visible');
    assert.equal(isProgressSliceActiveInv(terminal), false, 'terminal progress should not block actions');

    const oldTerminal = invSlice('completed', now - TERMINAL_TTL_MS - 1);
    assert.equal(isProgressSliceVisibleInv(oldTerminal), false, 'stale terminal inventory progress should clear');

    assert.equal(
      isProgressSliceVisibleTo({
        phase: 'completed',
        label: 'Trade offers sync finished.',
        percent: 100,
        updatedAt: now,
      }),
      true,
      'fresh terminal trade-offer progress should remain visible after popup reopen'
    );
    assert.equal(
      isProgressSliceVisibleMh({
        phase: 'uploading_history',
        label: 'Uploading market history...',
        percent: 90,
        updatedAt: now,
      }),
      true,
      'active market-history progress should remain visible after popup reopen'
    );
  } finally {
    Date.now = realNow;
  }
}
