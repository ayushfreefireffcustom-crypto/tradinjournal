'use client';

import { useEffect, useState } from 'react';
import { Target, WarningCircle } from '@phosphor-icons/react';
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
    <div className="min-w-0 rounded-lg border border-border bg-app/60 px-3 py-2.5">
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

  return (
    <section
      className="rounded-xl border border-border bg-surface p-4 sm:p-5 animate-[fade-up_0.4s_ease_both]"
      data-testid="trader-track-record"
    >
      <h2 className="font-display font-semibold text-base tracking-tight text-fg">Track record</h2>
      <p className="mt-0.5 text-sm text-fg-3">Wins, losses, calibration.</p>

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
            <Stat
              label="Expectancy"
              value={signedR(record.expectancyR)}
              tone={
                record.expectancyR == null ? 'neutral' : record.expectancyR >= 0 ? 'profit' : 'loss'
              }
            />
            <Stat label="Graded" value={String(record.graded)} />
            <Stat label="Open" value={String(record.pending)} />
          </div>

          {record.graded === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-8 text-center">
              <Target size={18} className="mx-auto text-fg-3" />
              <p className="mt-2 text-sm text-fg-3">No graded calls yet.</p>
            </div>
          ) : (
            <>
              <div data-testid="trader-calibration">
                <div className="text-[10px] uppercase tracking-wider text-fg-3 mb-2">Calibration</div>
                <ul className="space-y-2">
                  {record.calibration.map((b) => {
                    const realized = b.hitRate != null ? b.hitRate * 100 : null;
                    const maxCount = Math.max(...record.calibration.map((x) => x.count), 1);
                    return (
                      <li key={b.bucket} className="flex items-center gap-2 text-xs">
                        <span className="tabular-nums text-fg-2 w-12 shrink-0">{b.bucket}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                          <div
                            className="h-full rounded-full bg-fg-2/80"
                            style={{ width: `${Math.max(6, (b.count / maxCount) * 100)}%` }}
                          />
                        </div>
                        <span
                          className={`tabular-nums w-10 text-right ${
                            realized == null
                              ? 'text-fg-3'
                              : realized >= b.predicted - 5
                                ? 'text-profit'
                                : 'text-loss'
                          }`}
                        >
                          {realized == null ? '—' : `${realized.toFixed(0)}%`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {record.bySymbol.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-fg-3 mb-2">Symbols</div>
                  <ul className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                    {record.bySymbol.slice(0, 5).map((s) => (
                      <li key={s.symbol} className="flex items-center gap-2 px-3 py-2 bg-app/40">
                        <span className="text-sm font-medium">{s.symbol}</span>
                        <span className="ml-auto tabular-nums text-sm text-fg-2">{pct(s.hitRate, 0)}</span>
                        <span className="text-xs tabular-nums text-fg-3">
                          <span className="text-profit">{s.targetHits}</span>
                          <span className="mx-0.5">/</span>
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
              Methodology
            </summary>
            <p className="mt-2 text-xs text-fg-3 leading-relaxed border-t border-border pt-2">
              {record.disclaimer}
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
