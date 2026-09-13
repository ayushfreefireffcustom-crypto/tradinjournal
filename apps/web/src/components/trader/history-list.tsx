'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowClockwise } from '@phosphor-icons/react';
import { traderApi, type TraderAnalysis } from '@/lib/trader-api';
import { formatAsOf } from '@/lib/macro-format';
import { OutcomeBadge } from './outcome-badge';

function dirTone(d: string): string {
  if (d === 'LONG') return 'text-profit';
  if (d === 'SHORT') return 'text-loss';
  return 'text-fg-3';
}

export default function AnalysisHistory({
  refreshKey,
  onSelect,
}: {
  refreshKey?: number;
  onSelect?: (a: TraderAnalysis) => void;
}) {
  const [rows, setRows] = useState<TraderAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await traderApi.history());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  return (
    <section
      className="rounded-xl border border-border bg-surface p-4 animate-[fade-up_0.45s_ease_both]"
      data-testid="trader-history"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-sm font-medium text-fg">Recent</h3>
        <button
          type="button"
          onClick={() => void load()}
          className="text-fg-3 hover:text-fg p-1 rounded-md transition-colors"
          aria-label="Refresh"
        >
          <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && rows.length === 0 && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-surface-hover animate-pulse" />
          ))}
        </div>
      )}

      {error && <p className="text-sm text-loss">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-fg-3 py-6 text-center">No calls yet.</p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border">
          {rows.map((a) => (
            <li key={a.id ?? `${a.symbol}-${a.asOf}`}>
              <button
                type="button"
                onClick={() => onSelect?.(a)}
                className="w-full flex items-center gap-2 py-2.5 text-left hover:bg-white/[0.04] -mx-1 px-1.5 rounded-md transition-colors"
              >
                <span
                  className={`size-1.5 rounded-full shrink-0 ${
                    a.direction === 'LONG' ? 'bg-profit' : a.direction === 'SHORT' ? 'bg-loss' : 'bg-fg-3'
                  }`}
                />
                <span className="text-sm font-medium truncate">{a.symbol}</span>
                <span className={`text-[11px] font-medium ${dirTone(a.direction)}`}>{a.direction}</span>
                <span className="text-[11px] tabular-nums text-fg-3">{a.confidence}%</span>
                {a.confidenceSource === 'meta_lgbm' && (
                  <span className="text-[9px] uppercase tracking-wider text-profit/80">model</span>
                )}
                {a.confidenceSource === 'meta_v1' && (
                  <span className="text-[9px] uppercase tracking-wider text-profit/80">meta</span>
                )}
                <span className="ml-auto shrink-0 flex items-center gap-2">
                  <OutcomeBadge
                    outcome={a.outcome}
                    hitLevel={a.hitLevel}
                    pending={!a.outcome}
                    compact
                  />
                  <span className="text-[10px] tabular-nums text-fg-3 hidden sm:inline">
                    {formatAsOf(a.asOf)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
