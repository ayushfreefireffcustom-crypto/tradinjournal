'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClockCounterClockwise, ArrowClockwise } from '@phosphor-icons/react';
import { traderApi, type TraderAnalysis } from '@/lib/trader-api';
import { formatAsOf, formatMacroNumber } from '@/lib/macro-format';
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
    <section className="tcard p-4 sm:p-5 animate-[fade-up_0.55s_ease_both]" data-testid="trader-history">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <ClockCounterClockwise size={14} className="text-fg-3" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-fg-3">Your recent calls</span>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="text-fg-3 hover:text-fg-2 transition-colors p-1 rounded"
          aria-label="Refresh history"
        >
          <ArrowClockwise size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && rows.length === 0 && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-surface-hover/50 animate-pulse" />
          ))}
        </div>
      )}

      {error && <p className="text-sm text-loss">{error}</p>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-[12px] text-fg-3 py-6 text-center leading-relaxed">
          Your analyses will land here — with outcomes once the grader finishes.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-border-soft -mx-1">
          {rows.map((a, i) => (
            <li key={a.id ?? `${a.symbol}-${a.asOf}`}>
              <button
                type="button"
                onClick={() => onSelect?.(a)}
                className="w-full text-left px-1 py-2.5 rounded-md hover:bg-surface-hover/60 transition-colors group animate-[fade-up_0.4s_ease_both]"
                style={{ animationDelay: `${Math.min(i, 12) * 28}ms` }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-display font-bold text-[13px] tracking-tight truncate">
                    {a.symbol}
                  </span>
                  <span className={`text-[10px] tracking-[0.14em] uppercase ${dirTone(a.direction)}`}>
                    {a.direction}
                  </span>
                  <span className="ml-auto shrink-0">
                    <OutcomeBadge
                      outcome={a.outcome}
                      hitLevel={a.hitLevel}
                      pending={!a.outcome}
                      compact
                    />
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-fg-3 numeric">
                  <span>{a.timeframes.join('·')}</span>
                  <span>·</span>
                  <span>{a.confidence}%</span>
                  <span>·</span>
                  <span className="truncate">{formatAsOf(a.asOf)}</span>
                  <span className="ml-auto text-fg-3 group-hover:text-fg-2 transition-colors">
                    {formatMacroNumber(a.entryLow)}–{formatMacroNumber(a.entryHigh)}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
