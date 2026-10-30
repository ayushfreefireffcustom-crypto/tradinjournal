'use client';

import type { TraderOutcome, TraderHitLevel } from '@/lib/trader-api';

const LABELS: Record<TraderOutcome, string> = {
  TARGET_HIT: 'Target hit',
  STOP_HIT: 'Stop hit',
  EXPIRED: 'Expired',
  SKIPPED: 'Skipped',
};

/** Tag modifier for an outcome: green target, red stop, neutral otherwise. */
export function outcomeTone(outcome: TraderOutcome | null | undefined): string {
  if (outcome === 'TARGET_HIT') return 'x-tag--g';
  if (outcome === 'STOP_HIT') return 'x-tag--r';
  return '';
}

export function OutcomeBadge({ outcome, hitLevel, pending, className = '' }: {
  outcome?: TraderOutcome | null;
  hitLevel?: TraderHitLevel | null;
  pending?: boolean;
  compact?: boolean;
  className?: string;
}) {
  if (!outcome && pending) return <span className={`x-tag ${className}`} data-testid="outcome-open">Open</span>;
  if (!outcome) return null;
  const label = outcome === 'TARGET_HIT' && hitLevel ? `Hit ${hitLevel}` : outcome === 'STOP_HIT' ? 'Stopped' : LABELS[outcome];
  return <span className={`x-tag ${outcomeTone(outcome)} ${className}`} data-testid={`outcome-${outcome}`}>{label}</span>;
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
