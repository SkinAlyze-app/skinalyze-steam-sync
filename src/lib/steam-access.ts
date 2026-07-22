export type SteamAccessPolicy = 'headless_only' | 'allow_tab_fallback';

export const HEADLESS_STEAM_ACCESS: SteamAccessPolicy = 'headless_only';
export const MANUAL_STEAM_ACCESS: SteamAccessPolicy = 'allow_tab_fallback';

export function allowsSteamTabFallback(policy: SteamAccessPolicy): boolean {
  return policy === MANUAL_STEAM_ACCESS;
}

export function automaticSteamRetryMessage(detail: string): string {
  const clean = detail.trim().replace(/\s+/g, ' ');
  return `Automatic Steam check could not finish. No tab was opened; SkinAlyze will retry automatically.${clean ? ` ${clean}` : ''}`;
}
