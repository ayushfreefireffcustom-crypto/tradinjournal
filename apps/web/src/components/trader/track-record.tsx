'use client';

import { useEffect, useState } from 'react';
import { Pulse, WarningCircle } from '@phosphor-icons/react';
import { traderApi, type TraderTrackRecord } from '@/lib/trader-api';
import { pct, signedR } from './outcome-badge';

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit' | 'loss' | 'neutral';
}) {
  const color =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-fg';
  return (
    <div className="min-w-0 rounded-lg border border-border bg-app/50 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-fg-3">{label}</div>
      <div className={`mt-1 font-semibold text-lg tabular-nums leading-none ${color}`}>{value}</div>
    </div>
  );
}

export default function TrackRecordPanel({ scope = 'all' }: { scope?: 'all' | 'me' }) {
  const [record, setRecord] = useState<TraderTrackRecord | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    traderApi
      .trackRecord(scope)
      .then((d) => {
        if (!cancelled) setRecord(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const early = (record?.graded ?? 0) < 30;
  const expTone =
    record?.expectancyR == null ? 'neutral' : record.expectancyR >= 0 ? 'profit' : 'loss';

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-border bg-surface p-4 sm:p-5 animate-[fade-up_0.4s_ease_both]"
      data-testid="trader-track-record"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-50"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--color-fg-2) 10%, transparent), transparent)',
        }}
      />

      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Pulse size={14} className="text-fg-2" />
            <h2 className="font-display font-semibold text-base tracking-tight text-fg">Track record</h2>
          </div>
          {record && record.graded > 0 && (
            <span className="text-[10px] tabular-nums text-fg-3">{record.graded} graded</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-fg-3">Targets, stops, and whether the confidence matched.</p>

        {loading && (
          <div className="mt-4 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-9 rounded-lg bg-surface-hover animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-loss flex items-center gap-2">
            <WarningCircle size={15} /> {error}
          </p>
        )}

        {!loading && !error && record && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="Hit rate"
                value={pct(record.hitRate, 0)}
                tone={record.hitRate != null && record.hitRate >= 0.5 ? 'profit' : 'neutral'}
              />
              <Stat label="Expectancy" value={signedR(record.expectancyR)} tone={expTone} />
              <Stat label="Open" value={String(record.pending)} />
              <Stat label="Expired" value={String(record.expired)} />
            </div>

            {early && (
              <p className="text-[11px] text-fg-3 leading-relaxed rounded-lg border border-border bg-app/40 px-3 py-2">
                {record.graded === 0
                  ? 'Nothing graded yet. Calls show up here after the horizon closes.'
                  : `${record.graded} graded so far — too few to trust a win rate.`}
              </p>
            )}

            {record.graded > 0 && (
              <>
                <div data-testid="trader-calibration">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-fg-3">Calibration</span>
                    <span className="text-[10px] text-fg-3">said vs hit</span>
                  </div>
                  <ul className="space-y-2.5">
                    {record.calibration.map((b) => {
                      const realized = b.hitRate != null ? b.hitRate * 100 : null;
                      const close = realized != null && Math.abs(realized - b.predicted) <= 8;
                      return (
                        <li key={b.bucket}>
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="tabular-nums text-fg-2">{b.bucket}%</span>
                            <span className="tabular-nums text-fg-3">
                              {b.count === 0 ? '—' : `${b.count}`}
                              <span className="mx-1.5 text-fg-3/50">·</span>
                              <span className="text-fg-2">{b.predicted}%</span>
                              <span className="mx-1 text-fg-3">→</span>
                              <span
                                className={
                                  realized == null ? 'text-fg-3' : close ? 'text-profit' : 'text-loss'
                                }
                              >
                                {realized == null ? '—' : `${realized.toFixed(0)}%`}
                              </span>
                            </span>
                          </div>
                          <div className="relative h-1 rounded-full bg-border overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                realized == null ? 'bg-fg-3/30' : close ? 'bg-profit' : 'bg-loss'
                              }`}
                              style={{ width: `${realized == null ? 8 : Math.max(6, realized)}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {record.bySymbol.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-fg-3 mb-2">Symbols</div>
                    <ul className="space-y-1">
                      {record.bySymbol.slice(0, 5).map((s) => (
                        <li
                          key={s.symbol}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.03]"
                        >
                          <span className="text-sm font-medium">{s.symbol}</span>
                          <span className="text-[10px] tabular-nums text-fg-3">{s.count}</span>
                          <span className="ml-auto tabular-nums text-sm text-fg-2">{pct(s.hitRate, 0)}</span>
                          <span className="text-[11px] tabular-nums">
                            <span className="text-profit">{s.targetHits}</span>
                            <span className="text-fg-3 mx-0.5">/</span>
                            <span className="text-loss">{s.stopHits}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <details>
              <summary className="cursor-pointer text-xs text-fg-3 hover:text-fg-2 list-none">
                How grading works
              </summary>
              <p className="mt-2 text-xs text-fg-3 leading-relaxed border-t border-border pt-2">
                {record.disclaimer}
              </p>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
