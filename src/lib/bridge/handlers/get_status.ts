import { getStorage } from '@/lib/storage';

export async function handleGetStatus(): Promise<{
  paired: boolean;
  user_handle: string | null;
  steam_expected: string | null;
  last_sync_at: string | null;
  last_steam_detected: string | null;
  steam_match: boolean | null;
  last_error: string | null;
  paired_steam_ids: string[];
  pairing_count: number;
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
      paired_steam_ids: s.pairedSteamIds,
      pairing_count: s.pairings.length,
    };
  }

  const steamMatch =
    s.lastSteamDetected && s.pairedSteamIds.length > 0
      ? s.pairedSteamIds.includes(s.lastSteamDetected)
      : null;

  return {
    paired: true,
    user_handle: s.userHandle,
    steam_expected: s.steamExpected,
    last_sync_at: s.lastSyncAt,
    last_steam_detected: s.lastSteamDetected || null,
    steam_match: steamMatch,
    last_error: s.lastError,
    paired_steam_ids: s.pairedSteamIds,
    pairing_count: s.pairings.length,
  };
}
