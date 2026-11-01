// Number formatting for the whole app (A1.6, A1.7). Page modules re-export or
// wrap these instead of keeping their own copies.
// Rules:
// - negatives use a real minus (U+2212), never a hyphen
// - anything that rounds to zero at the shown precision has no sign: "$0", not "−$0"
// - a missing value (null, undefined, NaN, ±Infinity) is "—", never 0

export const MINUS = '−';
export const UNKNOWN = '—';

const known = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const group = (a: number, min: number, max: number) => a.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
const zeroAt = (v: number, digits: number) => Number(Math.abs(v).toFixed(digits)) === 0;
const sign = (v: number, digits: number, signed: boolean) => (zeroAt(v, digits) ? '' : v < 0 ? MINUS : signed ? '+' : '');

/** "—" for a missing value, otherwise the formatted one. */
export const fmtUnknown = <T>(v: T | null | undefined, f: (x: T) => string): string => (v == null || (typeof v === 'number' && !Number.isFinite(v)) ? UNKNOWN : f(v));

export interface DigitsOpts {
  /** Most decimals shown (default 2). */
  digits?: number;
  /** Fewest decimals shown (default: `digits`, so "1.50" keeps its zero). */
  minDigits?: number;
  /** "+" in front of gains. */
  signed?: boolean;
}

/** Money: "$1,284.50", "−$118.20"; `signed` gives "+$1,284.50". */
export function fmtUsd(v: number | null | undefined, { digits = 2, minDigits = digits, signed = false }: DigitsOpts = {}): string {
  if (!known(v)) return UNKNOWN;
  return `${sign(v, digits, signed)}$${group(Math.abs(v), minDigits, digits)}`;
}

/** Short money for axes and tight cells: "$25k", "$1.5k", "−$300", "$2.4M", "$1.10B". */
export function fmtUsdCompact(v: number | null | undefined, { signed = false }: { signed?: boolean } = {}): string {
  if (!known(v)) return UNKNOWN;
  const a = Math.abs(v);
  // Round before picking the unit, so 999.6 reads "$1.0k" and 999,600 reads "$1.0M".
  const unit = (n: number, u: string) => `${n.toFixed(n >= 9.95 ? 0 : 1)}${u}`;
  const body = a >= 999_500_000 ? `${(a / 1e9).toFixed(2)}B` : a >= 999_500 ? unit(a / 1e6, 'M') : a >= 999.5 ? unit(a / 1e3, 'k') : String(Math.round(a));
  const s = body === '0' ? '' : v < 0 ? MINUS : signed ? '+' : '';
  return `${s}$${body}`;
}

/**
 * Percent. The value is already a percent ("12.3" → "12.3%") unless `ratio`
 * ("0.123" → "12.3%").
 */
export function fmtPct(v: number | null | undefined, { digits = 1, signed = false, ratio = false }: { digits?: number; signed?: boolean; ratio?: boolean } = {}): string {
  if (!known(v)) return UNKNOWN;
  const p = ratio ? v * 100 : v;
  return `${sign(p, digits, signed)}${Math.abs(p).toFixed(digits)}%`;
}

/** Plain number, grouped: "1,284.5", "−0.25". Trailing zeros dropped unless `minDigits`. */
export function fmtNum(v: number | null | undefined, { digits = 2, minDigits = 0, signed = false }: DigitsOpts = {}): string {
  if (!known(v)) return UNKNOWN;
  return `${sign(v, digits, signed)}${group(Math.abs(v), minDigits, digits)}`;
}

/** Big counts: "950", "1.2K", "3.40M", "1.10B". */
export function fmtCompact(v: number | null | undefined): string {
  if (!known(v)) return UNKNOWN;
  const a = Math.abs(v);
  const s = v < 0 && Math.round(a) !== 0 ? MINUS : '';
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}${(a / 1e3).toFixed(1)}K`;
  return `${s}${a.toFixed(0)}`;
}

/** Held time: "45s", "48m", "2h 10m", "1h", "1d 3h". */
export function fmtDuration(secs: number | null | undefined): string {
  if (!known(secs)) return UNKNOWN;
  if (secs < 60) return `${Math.round(secs)}s`;
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}

/** The P&L class for a value: green, red, or muted when flat or unknown (`.pos` / `.neg` / `.flat`). */
export function pnlClass(v: number | null | undefined, epsilon = 1e-9): 'pos' | 'neg' | 'flat' {
  if (!known(v) || Math.abs(v) < epsilon) return 'flat';
  return v > 0 ? 'pos' : 'neg';
}
