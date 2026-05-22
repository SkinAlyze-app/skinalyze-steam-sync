import { getStorage } from '@/lib/storage';

export async function handleGetStatus(): Promise<{
  paired: boolean;
  user_handle: string | null;
  steam_expected: string | null;
  last_sync_at: string | null;
  last_steam_detected: string | null;
  steam_match: boolean | null;
  last_error: string | null;
}> {
  const s = await getStorage();
  if (!s.token) {
    return {
      paired: false,
      user_handle: null,
      steam_expected: null,
      last_sync_at: s.lastSyncAt,
      last_steam_detected: s.lastSteamDetected || null,
      steam_match: null,
      last_error: s.lastError,
    };
  }

  return {
    paired: true,
    user_handle: s.userHandle,
    steam_expected: s.steamExpected,
    last_sync_at: s.lastSyncAt,
    last_steam_detected: s.lastSteamDetected || null,
    steam_match:
      s.lastSteamDetected && s.steamExpected ? s.lastSteamDetected === s.steamExpected : null,
    last_error: s.lastError,
  };
}
