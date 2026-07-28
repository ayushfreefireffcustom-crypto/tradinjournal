// Shared helpers for calendar provider adapters: a hard-timeout JSON fetch, an
// impact normalizer, and currency↔country mapping (providers key events by
// currency; the UI wants an ISO-3166 country for the flag).
import type { EventImpact } from '../types.js';

const FETCH_TIMEOUT_MS = 10_000;

/** GET JSON with a hard timeout merged onto the caller's abort signal. */
export async function fetchJson<T>(url: string, signal?: AbortSignal, extraHeaders?: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json', ...extraHeaders } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Map a provider's impact label (string or number) to our enum. Defaults LOW. */
export function normalizeImpact(raw: unknown): EventImpact {
  if (typeof raw === 'number') return raw >= 3 ? 'HIGH' : raw === 2 ? 'MEDIUM' : 'LOW';
  const s = String(raw ?? '').toLowerCase();
  if (s.includes('high') || s === '3') return 'HIGH';
  if (s.includes('medium') || s.includes('moderate') || s === '2') return 'MEDIUM';
  return 'LOW'; // low / holiday / unknown
}

/** Representative ISO-3166 alpha-2 country for a currency (drives the flag). */
const CURRENCY_COUNTRY: Record<string, string> = {
  USD: 'US', EUR: 'EU', GBP: 'GB', JPY: 'JP', AUD: 'AU', CAD: 'CA', CHF: 'CH',
  NZD: 'NZ', CNY: 'CN', HKD: 'HK', SGD: 'SG', INR: 'IN', ZAR: 'ZA', MXN: 'MX',
  BRL: 'BR', RUB: 'RU', KRW: 'KR', TRY: 'TR', SEK: 'SE', NOK: 'NO', DKK: 'DK',
  PLN: 'PL',
};

export function currencyToCountry(currency: string): string {
  return CURRENCY_COUNTRY[currency.toUpperCase()] ?? currency.slice(0, 2).toUpperCase();
}

const COUNTRY_CURRENCY: Record<string, string> = Object.fromEntries(
  Object.entries(CURRENCY_COUNTRY).map(([cur, country]) => [country, cur]),
);

/** Representative currency for an ISO-3166 country (for providers that give only country). */
export function countryToCurrency(country: string): string {
  return COUNTRY_CURRENCY[country.toUpperCase()] ?? country.toUpperCase();
}

/** Parse a provider datetime to a UTC Date. Appends 'Z' when no tz is present. */
export function toUtc(raw: string): Date {
  const s = raw.trim();
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  // "YYYY-MM-DD HH:MM:SS" (no tz) → treat as UTC.
  const iso = hasTz ? s : `${s.replace(' ', 'T')}Z`;
  return new Date(iso);
}

/** Coerce a possibly-empty provider field to a trimmed string or undefined. */
export function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s === '' || s === '-' ? undefined : s;
}
