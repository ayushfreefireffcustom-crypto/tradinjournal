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

/** Average bias score across assets (for the headline gauge). */
export function averageBiasScore(bias: { score: number }[]): number | null {
  if (!bias.length) return null;
  const finite = bias.map(b => b.score).filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((a, b) => a + b, 0) / finite.length;
}
