import { setPaired, setLastError } from '@/lib/storage';
import { extensionApiUrl } from '@/shared/constants';

const MANIFEST = chrome.runtime.getManifest();
const VERSION = MANIFEST.version ?? '0.1.0';

export async function handlePair(code: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (trimmed.length < 6) {
    return { ok: false, error: 'Enter the 6-character code from SkinAlyze settings.' };
  }

  const res = await fetch(`${extensionApiUrl('/api/extension/pair/confirm')}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: trimmed, extension_version: VERSION }),
    credentials: 'omit',
  });
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    steam_id64?: string;
    user_handle?: string | null;
    error?: string;
  };

  if (!res.ok || !data.token || !data.steam_id64) {
    await setLastError(data.error || 'Pairing failed');
    return { ok: false, error: data.error || 'Pairing failed' };
  }

  await setPaired({
    token: data.token,
    steam_id64: data.steam_id64,
    user_handle: data.user_handle ?? null,
  });
  await setLastError('');
  return { ok: true };
}
