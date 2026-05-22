import { extensionApiUrl } from '@/shared/constants';

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function apiPost(path: string, token: string | null, body: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(extensionApiUrl(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'omit',
    });
  } catch (e) {
    return { ok: false, status: 0, data: { error: e instanceof Error ? e.message : 'Network error' } };
  }

  const data = await parseJson(res);
  return { ok: res.ok, status: res.status, data };
}

export async function apiGet(path: string, token: string): Promise<{ ok: boolean; status: number; data: unknown }> {
  let res: Response;
  try {
    res = await fetch(extensionApiUrl(path), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'omit',
    });
  } catch (e) {
    return { ok: false, status: 0, data: { error: e instanceof Error ? e.message : 'Network error' } };
  }
  const data = await parseJson(res);
  return { ok: res.ok, status: res.status, data };
}

/** Avoid `String(undefined) === 'undefined'` when JSON has an `error` key with a missing/null value. */
export function messageFromExtensionApiBody(data: unknown, httpStatus: number): string {
  if (data && typeof data === 'object' && 'error' in data) {
    const v = (data as Record<string, unknown>).error;
    if (v != null && v !== '') {
      const s = String(v).trim();
      if (s) return s;
    }
  }
  return `HTTP ${httpStatus}`;
}
