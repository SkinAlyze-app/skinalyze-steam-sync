import { detectLoggedInSteamId64ViaTab } from '@/lib/steam-tab-fetch';

/** Logged-in Steam ID64 using a steamcommunity.com tab (session cookies). */
export async function detectLoggedInSteamId64(): Promise<string | null> {
  return detectLoggedInSteamId64ViaTab();
}
