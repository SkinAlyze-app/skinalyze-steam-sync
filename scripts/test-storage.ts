import assert from 'node:assert/strict';

import {
  getPairingForSteamId,
  getPairings,
  getStorage,
  setPaired,
  setSteamSyncEnabled,
} from '../src/lib/storage';

const STEAM_A = '76561198000000001';
const STEAM_B = '76561198000000002';

type StorageRecord = Record<string, unknown>;

function installChromeStorageMock(initial: StorageRecord = {}): StorageRecord {
  const store: StorageRecord = { ...initial };
  const local = {
    async get(keys?: string | string[] | StorageRecord | null): Promise<StorageRecord> {
      if (keys == null) return { ...store };
      if (typeof keys === 'string') return { [keys]: store[keys] };
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, store[key]]));
      }
      return Object.fromEntries(
        Object.entries(keys).map(([key, defaultValue]) => [
          key,
          Object.prototype.hasOwnProperty.call(store, key) ? store[key] : defaultValue,
        ])
      );
    },
    async set(values: StorageRecord): Promise<void> {
      Object.assign(store, values);
    },
    async remove(keys: string | string[]): Promise<void> {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) delete store[key];
    },
  };

  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local },
  };

  return store;
}

async function pair(steamId64: string, token = `token-${steamId64}`): Promise<void> {
  await setPaired({
    token,
    steam_id64: steamId64,
    steam_account_id: null,
    user_handle: null,
    client_id: null,
  });
}

export async function runStorageTests(): Promise<void> {
  installChromeStorageMock();
  await pair(STEAM_A);
  let storage = await getStorage();
  assert.equal(storage.steamSyncEnabled, true, 'fresh pairings default Steam sync to enabled');
  assert.equal((await getPairings())[0]?.steam_sync_enabled, true);

  await setSteamSyncEnabled(false);
  storage = await getStorage();
  assert.equal(storage.steamSyncEnabled, false, 'saved disabled value is returned for active pairing');

  await setPaired({
    token: 'refreshed-token',
    steam_id64: STEAM_A,
    steam_account_id: 'account-a',
    user_handle: 'User A',
    client_id: 'client-a',
  });
  storage = await getStorage();
  assert.equal(storage.steamSyncEnabled, false, 're-pairing the same Steam ID preserves disabled value');
  assert.equal(storage.token, 'refreshed-token');

  installChromeStorageMock();
  await pair(STEAM_A);
  await setSteamSyncEnabled(false, STEAM_A);
  await pair(STEAM_B);
  storage = await getStorage();
  assert.equal(storage.steamExpected, STEAM_B);
  assert.equal(storage.steamSyncEnabled, true, 'new Steam IDs still default to enabled');

  await getPairingForSteamId(STEAM_A);
  storage = await getStorage();
  assert.equal(storage.steamExpected, STEAM_A);
  assert.equal(storage.steamSyncEnabled, false, 'disabled value is isolated to the matching Steam ID');

  await getPairingForSteamId(STEAM_B);
  storage = await getStorage();
  assert.equal(storage.steamExpected, STEAM_B);
  assert.equal(storage.steamSyncEnabled, true, 'enabled value is isolated to the second Steam ID');
}
