export type SteamCurrencyCode =
  | 'USD'
  | 'GBP'
  | 'EUR'
  | 'CHF'
  | 'RUB'
  | 'PLN'
  | 'BRL'
  | 'JPY'
  | 'NOK'
  | 'IDR'
  | 'MYR'
  | 'PHP'
  | 'SGD'
  | 'THB'
  | 'VND'
  | 'KRW'
  | 'TRY'
  | 'UAH'
  | 'MXN'
  | 'CAD'
  | 'AUD'
  | 'NZD'
  | 'CNY'
  | 'INR'
  | 'CLP'
  | 'PEN'
  | 'COP'
  | 'ZAR'
  | 'HKD'
  | 'TWD'
  | 'SAR'
  | 'AED'
  | 'SEK'
  | 'ARS'
  | 'ILS'
  | 'BYN'
  | 'KZT'
  | 'KWD'
  | 'QAR'
  | 'CRC'
  | 'UYU'
  | 'BGN'
  | 'HRK'
  | 'CZK'
  | 'DKK'
  | 'HUF'
  | 'RON';

export const STEAM_ECURRENCY_TO_ISO: Record<number, SteamCurrencyCode> = {
  1: 'USD',
  2: 'GBP',
  3: 'EUR',
  4: 'CHF',
  5: 'RUB',
  6: 'PLN',
  7: 'BRL',
  8: 'JPY',
  9: 'NOK',
  10: 'IDR',
  11: 'MYR',
  12: 'PHP',
  13: 'SGD',
  14: 'THB',
  15: 'VND',
  16: 'KRW',
  17: 'TRY',
  18: 'UAH',
  19: 'MXN',
  20: 'CAD',
  21: 'AUD',
  22: 'NZD',
  23: 'CNY',
  24: 'INR',
  25: 'CLP',
  26: 'PEN',
  27: 'COP',
  28: 'ZAR',
  29: 'HKD',
  30: 'TWD',
  31: 'SAR',
  32: 'AED',
  33: 'SEK',
  34: 'ARS',
  35: 'ILS',
  36: 'BYN',
  37: 'KZT',
  38: 'KWD',
  39: 'QAR',
  40: 'CRC',
  41: 'UYU',
  42: 'BGN',
  43: 'HRK',
  44: 'CZK',
  45: 'DKK',
  46: 'HUF',
  47: 'RON',
};

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export type ParsedSteamMoney = {
  price_numeric: number;
  price_minor: number;
};

export function steamCurrencyCodeFromId(value: unknown): SteamCurrencyCode | null {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return null;
  return STEAM_ECURRENCY_TO_ISO[Math.floor(n)] ?? null;
}

export function parseSteamMoney(displayPrice: string): ParsedSteamMoney | null {
  const raw = displayPrice.replace(/\u00a0/g, ' ').trim();
  if (!raw) return null;
  let numeric = raw.replace(/[^\d,.\-]/g, '');
  if (!numeric || numeric === '-' || numeric === ',' || numeric === '.') return null;
  const negative = numeric.includes('-');
  numeric = numeric.replace(/-/g, '');
  const lastComma = numeric.lastIndexOf(',');
  const lastDot = numeric.lastIndexOf('.');
  const decimalSep = lastComma > lastDot ? ',' : lastDot >= 0 ? '.' : '';

  if (decimalSep) {
    const otherSep = decimalSep === ',' ? '.' : ',';
    const parts = numeric.split(decimalSep);
    const after = parts[parts.length - 1] ?? '';
    if (after.length === 2) {
      numeric = `${parts.slice(0, -1).join('').replaceAll(otherSep, '')}.${after}`;
    } else {
      numeric = numeric.replace(/[,.]/g, '');
    }
  }

  const major = Number.parseFloat(numeric);
  if (!Number.isFinite(major)) return null;
  const signed = negative ? -major : major;
  return {
    price_numeric: Math.round(signed * 100) / 100,
    price_minor: Math.round(signed * 100),
  };
}

export function parseSteamMarketDate(raw: string | null | undefined, now = new Date()): string | null {
  if (!raw) return null;
  const text = raw.replace(/\u00a0/g, ' ').trim();
  if (!text) return null;
  const explicit = new Date(text);
  if (Number.isFinite(explicit.getTime()) && /\d{4}/.test(text)) return explicit.toISOString();
  const m =
    text.match(/(\d{1,2})\s+([A-Za-z]{3,9})(?:[\s,]+(\d{4}))?/i) ||
    text.match(/([A-Za-z]{3,9})\s+(\d{1,2})(?:[\s,]+(\d{4}))?/i);
  if (!m) return null;
  const day = Number.parseInt(/^\d/.test(m[1] ?? '') ? String(m[1]) : String(m[2]), 10);
  const monthKey = (/^\d/.test(m[1] ?? '') ? String(m[2]) : String(m[1])).toLowerCase();
  const month = MONTHS[monthKey];
  if (!Number.isFinite(day) || month == null) return null;
  let year = Number.parseInt(String(m[3] ?? ''), 10);
  if (!Number.isFinite(year)) year = now.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, month, day, 12, 0, 0));
  if (!m[3] && candidate.getTime() - now.getTime() > 2 * 24 * 60 * 60 * 1000) {
    candidate = new Date(Date.UTC(year - 1, month, day, 12, 0, 0));
  }
  return candidate.toISOString();
}

export function supportsSteamMarketItem(appId: number, marketHashName: string): boolean {
  if (appId === 730) return true;
  return appId === 440 && marketHashName.trim() === 'Mann Co. Supply Crate Key';
}

export function stableSteamMarketEventKey(parts: {
  rowId?: string | null;
  side: string;
  appId: number;
  assetId?: string | null;
  marketHashName: string;
  actedOnRaw?: string | null;
  displayPrice?: string | null;
  index?: number;
}): string {
  if (parts.rowId?.trim()) return `steam_market:${parts.rowId.trim()}`;
  const raw = [
    parts.side,
    parts.appId,
    parts.assetId ?? '',
    parts.marketHashName,
    parts.actedOnRaw ?? '',
    parts.displayPrice ?? '',
    parts.index ?? 0,
  ].join('|');
  return `steam_market:${encodeURIComponent(raw).replace(/%/g, '').slice(0, 180)}`;
}
