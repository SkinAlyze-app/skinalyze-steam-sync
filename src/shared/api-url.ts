/** Join API origin and path (no trailing slash on origin). Pure helper for tests and runtime. */
export function buildExtensionApiUrl(origin: string, path: string): string {
  const base = origin.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
