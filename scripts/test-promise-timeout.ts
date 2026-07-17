import assert from 'node:assert/strict';

import { withTimeout } from '../src/lib/promise-timeout';

export async function runPromiseTimeoutTests(): Promise<void> {
  assert.equal(await withTimeout(Promise.resolve('ok'), 100, 'should not time out'), 'ok');

  await assert.rejects(
    withTimeout(Promise.reject(new Error('source failed')), 100, 'should not replace original error'),
    /source failed/
  );

  await assert.rejects(
    withTimeout(new Promise(() => {}), 10, 'operation timed out'),
    /operation timed out/
  );
}
