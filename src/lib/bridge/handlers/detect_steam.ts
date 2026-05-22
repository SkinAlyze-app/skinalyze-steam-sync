import { detectLoggedInSteamId64 } from '@/lib/steam-detect';
import { getStorage, setLastSteamDetected } from '@/lib/storage';

export async function handleDetectSteam(): Promise<{
  steam_id64: string | null;
  expected: string | null;
  match: boolean | null;
}> {
  const s = await getStorage();
  let detected: string | null = null;
  try {
    detected = await detectLoggedInSteamId64();
  } catch {
    detected = null;
  }
  await setLastSteamDetected(detected);
  const expected = s.steamExpected;
  const match =
    expected && detected ? expected === detected : expected && !detected ? false : null;
  return { steam_id64: detected, expected, match };
}
