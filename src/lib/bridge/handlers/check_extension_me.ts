import { apiGet } from '@/lib/api';
import { getStorage } from '@/lib/storage';

export async function handleCheckExtensionMe(): Promise<{ me_ok: boolean; data?: unknown } | { error: string }> {
  const s = await getStorage();
  if (!s.token) return { error: 'Not paired' };
  const me = await apiGet('/api/extension/me', s.token);
  return { me_ok: me.ok, data: me.data };
}
