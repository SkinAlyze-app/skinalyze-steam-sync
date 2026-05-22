import { apiPost, messageFromExtensionApiBody } from '@/lib/api';
import { getStorage } from '@/lib/storage';

export async function handleGetBadges(
  assetIds: string[]
): Promise<{ statuses: Record<string, string> } | { error: string }> {
  const s = await getStorage();
  if (!s.token) {
    return { error: 'Not paired' };
  }
  const res = await apiPost('/api/extension/inventory/status', s.token, { asset_ids: assetIds });
  if (!res.ok) {
    return { error: messageFromExtensionApiBody(res.data, res.status) };
  }
  const data = res.data as { statuses?: Record<string, string> };
  return { statuses: data.statuses ?? {} };
}
