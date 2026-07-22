import { detectLoggedInSteamId64ViaTab } from '@/lib/steam-tab-fetch';
import {
  HEADLESS_STEAM_ACCESS,
  allowsSteamTabFallback,
  type SteamAccessPolicy,
} from '@/lib/steam-access';

const STEAM_HOME_URL = 'https://steamcommunity.com/my/home/';
const STEAM_SESSION_TIMEOUT_MS = 15_000;

export function parseLoggedInSteamId64FromHtml(html: string): string | null {
  const match =
    html.match(/g_steamID\s*=\s*['"]?(\d{10,20})['"]?/i) ||
    html.match(/data-miniprofile\s*=\s*['"]?(\d{10,20})['"]?/i);
  return match?.[1] ?? null;
}

export async function detectLoggedInSteamId64Headlessly(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STEAM_SESSION_TIMEOUT_MS);
  try {
    const response = await fetch(STEAM_HOME_URL, {
      credentials: 'include',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return parseLoggedInSteamId64FromHtml(await response.text());
  } finally {
    clearTimeout(timer);
  }
}

/** Logged-in Steam ID64 without a visible tab; explicit user actions may opt into a tab fallback. */
export async function detectLoggedInSteamId64(
  accessPolicy: SteamAccessPolicy = HEADLESS_STEAM_ACCESS
): Promise<string | null> {
  try {
    const detected = await detectLoggedInSteamId64Headlessly();
    if (detected) return detected;
  } catch {
    // Manual actions can fall back below. Automatic callers must remain headless.
  }

  return allowsSteamTabFallback(accessPolicy) ? detectLoggedInSteamId64ViaTab() : null;
}
