'use client';

import type { TraderOutcome, TraderHitLevel } from '@/lib/trader-api';

const LABELS: Record<TraderOutcome, string> = {
  TARGET_HIT: 'Target hit',
  STOP_HIT: 'Stop hit',
  EXPIRED: 'Expired',
  SKIPPED: 'Skipped',
};

export function outcomeTone(outcome: TraderOutcome | null | undefined): string {
  if (outcome === 'TARGET_HIT') return 'text-profit border-profit/25 bg-profit/10';
  if (outcome === 'STOP_HIT') return 'text-loss border-loss/25 bg-loss/10';
  if (outcome === 'EXPIRED') return 'text-fg-2 border-border-soft bg-surface-hover';
  if (outcome === 'SKIPPED') return 'text-fg-3 border-border-soft bg-transparent';
  return 'text-fg-3 border-border-soft bg-app/40';
}

export function OutcomeBadge({ outcome, hitLevel, pending }: {
  outcome?: TraderOutcome | null;
  hitLevel?: TraderHitLevel | null;
  pending?: boolean;
  compact?: boolean;
}) {
  if (!outcome && pending) return <span className="v3-pill a sx-out">Open</span>;
  if (!outcome) return null;
  const label = outcome === 'TARGET_HIT' && hitLevel ? `Hit ${hitLevel}` : outcome === 'STOP_HIT' ? 'Stopped' : LABELS[outcome];
  const tone = outcome === 'TARGET_HIT' ? 'g' : outcome === 'STOP_HIT' ? 'r' : 'n';
  return <span className={`v3-pill ${tone} sx-out`} data-testid={`outcome-${outcome}`}>{label}</span>;
}

export function pct(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function signedR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}R`;
}
