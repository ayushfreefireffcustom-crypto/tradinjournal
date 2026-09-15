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

export function OutcomeBadge({
  outcome,
  hitLevel,
  pending,
  compact,
}: {
  outcome?: TraderOutcome | null;
  hitLevel?: TraderHitLevel | null;
  pending?: boolean;
  compact?: boolean;
}) {
  if (!outcome && pending) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded border border-border-soft bg-app/40 text-fg-3 ${
          compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
        } tracking-[0.12em] uppercase`}
      >
        <span className="inline-block size-1 rounded-full bg-fg-3 animate-pulse" />
        Open
      </span>
    );
  }
  if (!outcome) return null;
  const label =
    outcome === 'TARGET_HIT' && hitLevel
      ? `${LABELS[outcome]} · ${hitLevel}`
      : LABELS[outcome];
  return (
    <span
      className={`inline-flex items-center rounded border tracking-[0.12em] uppercase ${outcomeTone(outcome)} ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      }`}
      data-testid={`outcome-${outcome}`}
    >
      {label}
    </span>
  );
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
