import assert from 'node:assert/strict';

import { createSingleFlight } from '../src/lib/single-flight';

export async function runSingleFlightTests(): Promise<void> {
  const detectFlight = createSingleFlight<string>();
  let detectCalls = 0;
  let releaseDetect: (value: string) => void = () => {};
  const detectGate = new Promise<string>((resolve) => {
    releaseDetect = resolve;
  });

  const detectOne = detectFlight.run(async () => {
    detectCalls += 1;
    return detectGate;
  });
  const detectTwo = detectFlight.run(async () => {
    detectCalls += 1;
    return 'duplicate';
  });

  assert.equal(detectCalls, 1, 'DETECT_STEAM single-flight should call the underlying check once');
  assert.equal(detectOne, detectTwo, 'DETECT_STEAM duplicate callers should observe the same promise');
  assert.equal(detectFlight.isRunning(), true);
  releaseDetect('steam-ok');
  assert.equal(await detectOne, 'steam-ok');
  assert.equal(await detectTwo, 'steam-ok');
  assert.equal(detectFlight.isRunning(), false);

  const syncAllFlight = createSingleFlight<{ ok: boolean }>();
  let syncAllCalls = 0;
  let releaseSyncAll: (value: { ok: boolean }) => void = () => {};
  const syncAllGate = new Promise<{ ok: boolean }>((resolve) => {
    releaseSyncAll = resolve;
  });

  const syncOne = syncAllFlight.start(async () => {
    syncAllCalls += 1;
    return syncAllGate;
  });
  const syncTwo = syncAllFlight.start(async () => {
    syncAllCalls += 1;
    return { ok: false };
  });

  assert.equal(syncOne.started, true);
  assert.equal(syncTwo.started, false);
  assert.equal(syncOne.promise, syncTwo.promise, 'SYNC_ALL duplicate starts should observe the active run');
  assert.equal(syncAllCalls, 1, 'SYNC_ALL should not start parallel manual sync runs');
  releaseSyncAll({ ok: true });
  assert.deepEqual(await syncTwo.promise, { ok: true });
  assert.equal(syncAllFlight.isRunning(), false);

  let errorCalls = 0;
  await assert.rejects(
    () =>
      syncAllFlight.run(async () => {
        errorCalls += 1;
        throw new Error('boom');
      }),
    /boom/
  );
  assert.equal(syncAllFlight.isRunning(), false);
  assert.deepEqual(
    await syncAllFlight.run(async () => {
      errorCalls += 1;
      return { ok: true };
    }),
    { ok: true }
  );
  assert.equal(errorCalls, 2, 'single-flight should clear after rejection');
}
