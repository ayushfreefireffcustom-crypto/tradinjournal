'use client';

import { useEffect, useState } from 'react';
import { ChartLineUp, Scales, Target, WarningCircle } from '@phosphor-icons/react';
import { traderApi, type TraderTrackRecord } from '@/lib/trader-api';
import { formatAsOf } from '@/lib/macro-format';
import { pct, signedR } from './outcome-badge';

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'profit' | 'loss' | 'neutral';
}) {
  const color =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-fg';
  return (
    <div className="min-w-0 rounded-lg border border-border-soft bg-app/35 px-3 py-2.5">
      <div className="text-[9px] tracking-[0.16em] uppercase text-fg-3">{label}</div>
      <div className={`mt-1 font-display font-black text-xl numeric leading-none ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-[10px] text-fg-3 truncate">{sub}</div>}
    </div>
  );
}

function CalibrationBars({ record }: { record: TraderTrackRecord }) {
  const maxCount = Math.max(...record.calibration.map((b) => b.count), 1);
  return (
    <div className="space-y-2.5" data-testid="trader-calibration">
      <div className="flex items-end justify-between gap-2">
        <div className="text-[10px] tracking-[0.16em] uppercase text-fg-3">Calibration by confidence</div>
        <div className="text-[10px] text-fg-3">predicted vs realized</div>
      </div>
      <ul className="space-y-2">
        {record.calibration.map((b, i) => {
          const realized = b.hitRate != null ? b.hitRate * 100 : null;
          const predicted = b.predicted;
          const barW = `${Math.max(8, (b.count / maxCount) * 100)}%`;
          return (
            <li
              key={b.bucket}
              className="animate-[fade-up_0.45s_ease_both]"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-center justify-between gap-2 text-[10px]">
                <span className="numeric text-fg-2 w-14 shrink-0">{b.bucket}%</span>
                <div className="flex-1 min-w-0">
                  <div className="h-1.5 rounded-full bg-border-soft overflow-hidden">
                    <div
                      className="h-full rounded-full bg-fg-2/70 origin-left animate-[bar-grow-x_0.6s_ease_both]"
                      style={{ width: barW, animationDelay: `${80 + i * 40}ms` }}
                    />
                  </div>
                </div>
                <span className="numeric text-fg-3 w-8 text-right shrink-0">{b.count}</span>
              </div>
              <div className="mt-1 flex items-center gap-3 pl-14 text-[10px] text-fg-3">
                <span>
                  Pred <span className="text-fg-2 numeric">{predicted}%</span>
                </span>
                <span>
                  Real{' '}
                  <span className={`numeric ${realized == null ? 'text-fg-3' : realized >= predicted - 5 ? 'text-profit' : 'text-loss'}`}>
                    {realized == null ? '—' : `${realized.toFixed(0)}%`}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
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
        if (!cancelled) setError(e instanceof Error ? e.message : 'Track record unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <section
      className="tcard p-4 sm:p-5 overflow-hidden relative animate-[fade-up_0.5s_ease_both]"
      data-testid="trader-track-record"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 100% 0%, color-mix(in oklab, var(--color-profit) 18%, transparent), transparent 60%)',
        }}
      />

      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Scales size={14} className="text-fg-3" />
              <span className="text-[10px] tracking-[0.2em] uppercase text-fg-3">Public track record</span>
            </div>
            <h2 className="mt-1 font-display font-black text-lg tracking-tight text-fg">
              Wins, losses, calibration
            </h2>
            <p className="mt-1 text-[12px] text-fg-3 leading-relaxed max-w-md">
              Every graded call — including stops. Confidence buckets show whether “70%” actually meant ~70%.
            </p>
          </div>
          {record && (
            <div className="text-[10px] text-fg-3 numeric shrink-0 pt-1">{formatAsOf(record.asOf)}</div>
          )}
        </div>

        {loading && (
          <div className="mt-5 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-surface-hover/60 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-loss flex items-center gap-2">
            <WarningCircle size={16} /> {error}
          </p>
        )}

        {!loading && !error && record && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat
                label="Hit rate"
                value={pct(record.hitRate, 0)}
                sub={`${record.targetHits}T / ${record.stopHits}S`}
                tone={record.hitRate != null && record.hitRate >= 0.5 ? 'profit' : 'neutral'}
              />
              <Stat
                label="Expectancy"
                value={signedR(record.expectancyR)}
                sub="avg R per graded call"
                tone={
                  record.expectancyR == null
                    ? 'neutral'
                    : record.expectancyR >= 0
                      ? 'profit'
                      : 'loss'
                }
              />
              <Stat label="Graded" value={String(record.graded)} sub={`${record.pending} still open`} />
              <Stat label="Expired" value={String(record.expired)} sub={`${record.skipped} wait skips`} />
            </div>

            {record.graded === 0 ? (
              <div className="rounded-lg border border-dashed border-border-soft px-4 py-8 text-center">
                <Target size={22} className="mx-auto text-fg-3" />
                <p className="mt-2 text-sm text-fg-2">No graded calls yet</p>
                <p className="mt-1 text-[12px] text-fg-3 max-w-sm mx-auto leading-relaxed">
                  Run analyses and wait for the horizon — the grader marks target hit, stop hit, or expired against live candles.
                </p>
              </div>
            ) : (
              <>
                <CalibrationBars record={record} />

                {record.bySymbol.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <ChartLineUp size={12} className="text-fg-3" />
                      <span className="text-[10px] tracking-[0.16em] uppercase text-fg-3">Top symbols</span>
                    </div>
                    <ul className="divide-y divide-border-soft rounded-lg border border-border-soft overflow-hidden">
                      {record.bySymbol.slice(0, 6).map((s, i) => (
                        <li
                          key={s.symbol}
                          className="flex items-center gap-3 px-3 py-2 bg-app/25 animate-[fade-up_0.4s_ease_both]"
                          style={{ animationDelay: `${i * 35}ms` }}
                        >
                          <span className="font-display font-bold text-[13px] tracking-tight">{s.symbol}</span>
                          <span className="text-[10px] text-fg-3 numeric">{s.count} calls</span>
                          <span className="ml-auto numeric text-[12px] text-fg-2">{pct(s.hitRate, 0)}</span>
                          <span className="text-[10px] text-fg-3">
                            <span className="text-profit">{s.targetHits}</span>
                            <span className="mx-1">/</span>
                            <span className="text-loss">{s.stopHits}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <details className="group">
              <summary className="cursor-pointer list-none text-[11px] tracking-[0.12em] uppercase text-fg-3 hover:text-fg-2 transition-colors">
                Methodology & disclaimer
              </summary>
              <div className="mt-2 space-y-2 text-[11px] text-fg-3 leading-relaxed border-t border-border-soft pt-2">
                <p>{record.methodology}</p>
                <p className="text-fg-2">{record.disclaimer}</p>
              </div>
            </details>
          </div>
        )}
      </div>
    </section>
  );
}
