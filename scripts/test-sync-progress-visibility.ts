import assert from 'node:assert/strict';

import {
  isProgressSliceActiveInv,
  isProgressSliceVisibleInv,
  isProgressSliceVisibleMh,
  isProgressSliceVisibleTo,
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
  const realNow = Date.now;
  const now = 1_000_000;

  try {
    Date.now = () => now;

    const active = invSlice('reading_inventory', now);
    assert.equal(isProgressSliceVisibleInv(active), true, 'active progress should hydrate as visible');
    assert.equal(isProgressSliceActiveInv(active), true, 'active progress should block actions');

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
