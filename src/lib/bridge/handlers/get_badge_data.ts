import { apiPost, messageFromExtensionApiBody } from '@/lib/api';
import { getActivePairing, getPairingForSteamId } from '@/lib/storage';

export async function handleGetBadges(
  assetIds: string[],
  steamId64?: string | null
): Promise<{ statuses: Record<string, string> } | { error: string }> {
  const pairing = steamId64 ? await getPairingForSteamId(steamId64) : await getActivePairing();
  if (!pairing) {
    return { error: 'Not paired' };
  }
  const res = await apiPost('/api/extension/inventory/status', pairing.token, { asset_ids: assetIds });
  if (!res.ok) {
    return { error: messageFromExtensionApiBody(res.data, res.status) };
  }
  const data = res.data as { statuses?: Record<string, string> };
  return { statuses: data.statuses ?? {} };
}
