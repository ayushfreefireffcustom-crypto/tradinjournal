// Pure formatting + mapping helpers for the macro overview (unit-tested).
import type { MacroFactorKey, MacroDriver, MacroOverviewInput } from '@/lib/macro-api';

const MINUS = '−';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Signed number with a real minus sign. */
export function signed(v: number, dp = 0): string {
  const r = Number(v.toFixed(dp));
  if (r === 0) return (0).toFixed(dp);
  return `${r > 0 ? '+' : MINUS}${Math.abs(r).toFixed(dp)}`;
}

/** Number with thousands separators and a real minus sign. */
export function num(v: number, dp = 0): string {
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  return v < 0 ? `${MINUS}${s}` : s;
}

/** "2026-09" → "Sep" (or "Sep 2025" with year). */
export function monthShort(m: string, withYear = false): string {
  const name = MONTHS[Number(m.slice(5, 7)) - 1] ?? m;
  return withYear ? `${name} ${m.slice(0, 4)}` : name;
}
export function monthLong(m: string): string {
  return MONTHS_LONG[Number(m.slice(5, 7)) - 1] ?? m;
}

/** 1 → "1st", 2 → "2nd", 11 → "11th". */
export function ordinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** USD millions → "$5.71T" / "$812B". */
export function usdMn(mn: number): string {
  const a = Math.abs(mn);
  const sign = mn < 0 ? MINUS : '';
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}T`;
  if (a >= 1_000) return `${sign}$${Math.round(a / 1_000)}B`;
  return `${sign}$${Math.round(a)}M`;
}

/** USD units → "$282M" / "$1.4B" / "$950K". */
export function usdShort(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? MINUS : '';
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${sign}$${Math.round(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`;
  return `${sign}$${Math.round(a)}`;
}

/** Big value + optional unit for an input row. */
export function inputValue(i: MacroOverviewInput): { value: string; unit: string } {
  if (i.format === 'pct') return { value: `${i.value.toFixed(1)}%`, unit: '' };
  if (i.format === 'usd_mn') return { value: usdMn(i.value), unit: '' };
  const a = Math.abs(i.value);
  return { value: a.toFixed(1), unit: i.value < 0 ? (a === 1 ? 'hike' : 'hikes') : a === 1 ? 'cut' : 'cuts' };
}

/** Row label; a cuts row reads "Hikes priced" when the value is hikes (older payloads say "Cuts" either way). */
export function inputLabel(i: Pick<MacroOverviewInput, 'format' | 'label' | 'value'>): string {
  if (i.format !== 'cuts') return i.label;
  return i.value < 0 ? i.label.replace(/^Cuts priced/, 'Hikes priced') : i.label.replace(/^Hikes priced/, 'Cuts priced');
}

export function inputDelta(i: MacroOverviewInput): string {
  if (i.delta == null) return '';
  if (i.format === 'usd_mn') return Math.abs(i.delta) < 500 ? '0' : `${i.delta > 0 ? '+' : MINUS}${usdMn(Math.abs(i.delta))}`;
  // Hikes are shown as a positive count, so their change is too: 3.8 → 3.9 hikes reads +0.1.
  if (i.format === 'cuts' && i.value < 0) return signed(-i.delta, 1);
  return signed(i.delta, 1);
}

export const ASSET_NAME: Record<string, string> = {
  XAU: 'Gold',
  BTC: 'Bitcoin',
  NDX: 'Nasdaq 100',
  SPX: 'S&P 500',
  DXY: 'US dollar',
  UST: 'Treasuries',
  OIL: 'WTI oil',
  ETH: 'Ethereum',
  XAG: 'Silver',
  SOL: 'Solana',
};

/** Narrow-screen names (phone grid). */
export const ASSET_SHORT: Record<string, string> = { ...ASSET_NAME, NDX: 'Nasdaq', DXY: 'Dollar', UST: 'Treasury' };

/** Engine asset → canonical journal symbols (lib/symbol-match canonical keys). */
export const ASSET_SYMBOLS: Record<string, string[]> = {
  XAU: ['XAUUSD'],
  BTC: ['BTCUSD'],
  NDX: ['US100'],
  SPX: ['US500'],
  DXY: ['DXY', 'USDX'],
  UST: ['TLT', 'ZB', 'ZN'],
  OIL: ['WTIUSD'],
  ETH: ['ETHUSD'],
  XAG: ['XAGUSD'],
  SOL: ['SOLUSD', 'SOLUSDT'],
};

export function tradedLabel(asset: string, symbols: ReadonlySet<string>): 'In your journal' | 'Not traded' {
  return (ASSET_SYMBOLS[asset] ?? []).some(s => symbols.has(s)) ? 'In your journal' : 'Not traded';
}

export const DRIVER_LABEL: Record<MacroFactorKey, { long: string; short: string }> = {
  rates: { long: 'Yields', short: 'Yld' },
  dollar: { long: 'Dollar', short: 'USD' },
  liquidity: { long: 'Liquidity', short: 'Liq' },
  policy: { long: 'Fed', short: 'Fed' },
  inflation: { long: 'Inflation', short: 'Infl' },
  growth: { long: 'Growth', short: 'Grw' },
  credit: { long: 'Credit', short: 'Crd' },
  risk: { long: 'Risk', short: 'VIX' },
};

const arrow = (d: -1 | 0 | 1) => (d > 0 ? ' ↑' : d < 0 ? ' ↓' : ' flat');

/** Second header line for a driver column, e.g. "10Y 4.12% ↑". */
export function driverReading(d: MacroDriver, coreCpiYoY: number | null): string {
  const v = d.value;
  const a = arrow(d.direction);
  switch (d.key) {
    case 'rates': return v == null ? 'no data' : `10Y ${v.toFixed(2)}%${a}`;
    case 'dollar': return v == null ? 'no data' : `USD ${v.toFixed(1)}${a}`;
    case 'liquidity': return v == null ? 'no data' : `${usdMn(v)}${a}`;
    case 'policy': return v == null ? 'no data' : `EFFR ${v.toFixed(2)}%${a}`;
    case 'inflation': return coreCpiYoY != null ? `Core ${coreCpiYoY.toFixed(1)}%${a}` : v == null ? 'no data' : `CPI${a}`;
    case 'growth': return v == null ? 'no data' : `Payrolls${a}`;
    case 'credit': return v == null ? 'no data' : `HY ${v.toFixed(2)}%${a}`;
    case 'risk': return v == null ? 'no data' : `VIX ${v.toFixed(1)}${a}`;
  }
}

/** Heat colour for a −2..+2 cell (alpha steps from the design). */
export function heat(v: number | null | undefined): string {
  if (!v) return 'transparent';
  const a = [0, 0.2, 0.46, 0.7][Math.min(3, Math.round(Math.abs(v)))];
  return v > 0 ? `rgba(8,196,101,${a})` : `rgba(254,58,49,${a})`;
}

/** Surprise colour: positive = hotter (hurts risk) = red. */
export function surpriseFill(level: number | null): string | null {
  if (level == null) return null;
  if (level === 0) return 'var(--s3)';
  if (level > 0) return `rgba(254,58,49,${level > 1 ? 0.8 : 0.42})`;
  return `rgba(8,196,101,${level < -1 ? 0.7 : 0.38})`;
}

export function cellText(v: number): string {
  return v ? `${v > 0 ? '+' : MINUS}${Math.abs(v)}` : '·';
}

/** "Long cluster 1.0% below is the nearer magnet" (≤ 8 words), or null. */
export function magnetLine(longPct: number, shortPct: number, longUsd: number, shortUsd: number): string | null {
  const hasL = longUsd > 0 && longPct < 0;
  const hasS = shortUsd > 0 && shortPct > 0;
  if (!hasL && !hasS) return null;
  const long = hasL && (!hasS || Math.abs(longPct) <= Math.abs(shortPct));
  const pct = Math.abs(long ? longPct : shortPct);
  return `${long ? 'Long' : 'Short'} cluster ${pct.toFixed(1)}% ${long ? 'below' : 'above'} is the nearer magnet`;
}

/**
 * Source label for the liquidation estimate, from the DTO's `sources`: the
 * exchanges that actually answered (first word of each feed) + "est.".
 * ['Binance USDⓈ-M klines', 'Binance open interest history', 'TRADElogs estimate …'] → "Binance · est."
 */
export function liqSourceLabel(sources: string[]): string {
  const skip = new Set(['tradelogs', 'volume', 'weighted', 'venues']);
  const ex: string[] = [];
  for (const s of sources) {
    const w = s.trim().split(/\s+/)[0] ?? '';
    if (!w || skip.has(w.toLowerCase()) || ex.includes(w)) continue;
    ex.push(w);
  }
  const volumeOnly = sources.some(s => /^volume stand-in/i.test(s.trim()));
  return [...ex, ...(volumeOnly ? ['volume stand-in'] : []), 'est.'].join(' \u00b7 ');
}

/** Words in a line (the ≤ 8-word AI rule). */
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
