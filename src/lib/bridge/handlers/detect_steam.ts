import { detectLoggedInSteamId64 } from '@/lib/steam-detect';
import { HEADLESS_STEAM_ACCESS, type SteamAccessPolicy } from '@/lib/steam-access';
import { getStorage, setLastSteamDetected } from '@/lib/storage';

export async function handleDetectSteam(
  accessPolicy: SteamAccessPolicy = HEADLESS_STEAM_ACCESS
): Promise<{
  steam_id64: string | null;
  expected: string | null;
  match: boolean | null;
}> {
  const s = await getStorage();
  let detected: string | null = null;
  try {
    detected = await detectLoggedInSteamId64(accessPolicy);
  } catch {
    detected = null;
  }
  await setLastSteamDetected(detected);
  const expected = s.steamExpected;
  const match =
    detected && s.pairedSteamIds.length > 0
      ? s.pairedSteamIds.includes(detected)
      : expected && !detected
        ? false
        : null;
  return { steam_id64: detected, expected, match };
}
