// Pure formatters for the macro terminal — unit-tested, no React.

export type BiasTone = 'bull' | 'bear' | 'neutral';

/** Map engine label → UI tone. */
export function biasTone(label: string): BiasTone {
  const u = label.toUpperCase();
  if (u.includes('BULL')) return 'bull';
  if (u.includes('BEAR')) return 'bear';
  return 'neutral';
}

/** Signed % change from value vs prev. null if not computable. */
export function deltaPct(value: number, prev: number | null | undefined): number | null {
  if (prev == null || !Number.isFinite(prev) || !Number.isFinite(value) || prev === 0) return null;
  return ((value - prev) / Math.abs(prev)) * 100;
}

/** Compact number for ticker / cards. */
export function formatMacroNumber(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  if (abs >= 100) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(digits);
  return n.toFixed(Math.min(4, digits + 1));
}

export function formatSignedPct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

export function formatScore(score: number): string {
  if (!Number.isFinite(score)) return '—';
  return String(Math.round(Math.max(0, Math.min(100, score))));
}

/** Humanize bias label for display. */
export function formatBiasLabel(label: string): string {
  return label.replace(/_/g, ' ');
}

/** Relative time for asOf stamps. */
export function formatAsOf(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** Compact a raw USD amount into $T / $B / $M. */
function compactUsd(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/** Compact a raw count into M / K. */
function compactCount(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

/**
 * Format an indicator value honoring its FRED unit — percentages as-is,
 * monetary series scaled to $T/$B, head-counts to M, indices to one decimal.
 */
export function formatIndicatorValue(value: number, unit: string | null | undefined): string {
  if (!Number.isFinite(value)) return '—';
  const u = (unit ?? '').toLowerCase();
  if (u.includes('%')) return `${value.toFixed(2)}%`;
  if ((u.includes('mn') || u.includes('million')) && u.includes('$')) return compactUsd(value * 1e6);
  if ((u.includes('bn') || u.includes('billion')) && u.includes('$')) return compactUsd(value * 1e9);
  if (u.includes('thousand')) return compactCount(value * 1e3);
  if (u.includes('index')) return value.toFixed(1);
  return formatMacroNumber(value);
}

export interface IndicatorDelta {
  text: string;
  /** -1 down, 0 flat, 1 up — for movement coloring (not a good/bad judgment). */
  dir: -1 | 0 | 1;
}

/**
 * Movement of an indicator vs its prior print. Rate/percentage series are shown
 * in basis points; everything else as a signed percent change.
 */
export function indicatorDelta(
  value: number,
  prev: number | null | undefined,
  unit: string | null | undefined,
): IndicatorDelta | null {
  if (prev == null || !Number.isFinite(prev) || !Number.isFinite(value)) return null;
  const diff = value - prev;
  const dir: -1 | 0 | 1 = diff > 0 ? 1 : diff < 0 ? -1 : 0;
  const u = (unit ?? '').toLowerCase();
  if (u.includes('%')) {
    // Rate/yield moves are tiny → basis points; a large swing (e.g. a GDP nowcast
    // jumping several points) reads better as percentage points.
    if (Math.abs(diff) >= 1) return { text: `${diff > 0 ? '+' : ''}${diff.toFixed(1)}pp`, dir };
    const bp = Math.round(diff * 100);
    return { text: `${bp > 0 ? '+' : ''}${bp}bp`, dir };
  }
  const pct = deltaPct(value, prev);
  return { text: pct == null ? '—' : formatSignedPct(pct), dir };
}

/**
 * Relative time that reads both directions — "in 3h" / "in 2d" for upcoming
 * events, "5m ago" for past ones.
 */
export function formatWhen(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const diff = t - now;
  const future = diff >= 0;
  const sec = Math.round(Math.abs(diff) / 1000);
  let core: string;
  if (sec < 60) core = `${sec}s`;
  else if (sec < 3600) core = `${Math.floor(sec / 60)}m`;
  else if (sec < 86400) core = `${Math.floor(sec / 3600)}h`;
  else core = `${Math.floor(sec / 86400)}d`;
  return future ? `in ${core}` : `${core} ago`;
}

/** Map a calendar-impact string to a UI tone. */
export function impactTone(impact: string | null | undefined): 'high' | 'medium' | 'low' | 'none' {
  const u = (impact ?? '').toLowerCase();
  if (u.includes('high') || u === '3') return 'high';
  if (u.includes('med') || u === '2') return 'medium';
  if (u.includes('low') || u === '1') return 'low';
  return 'none';
}

/** Average bias score across assets (for the headline gauge). */
export function averageBiasScore(bias: { score: number }[]): number | null {
  if (!bias.length) return null;
  const finite = bias.map(b => b.score).filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}
