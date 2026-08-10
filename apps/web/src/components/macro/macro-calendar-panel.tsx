'use client';

import { useMemo, useState } from 'react';
import type { MacroState } from '@/lib/macro-api';
import { formatWhen, impactTone } from '@/lib/macro-format';

function impactPill(tone: ReturnType<typeof impactTone>): string {
  if (tone === 'high') return 'text-loss border-loss/40 bg-loss/10';
  if (tone === 'medium') return 'text-warning border-warning/40 bg-warning/10';
  if (tone === 'low') return 'text-fg-3 border-border bg-surface-hover';
  return 'text-fg-3 border-border-soft';
}

type ImpactFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';

/** Richer macro calendar with impact filters + countdowns. */
export default function MacroCalendarPanel({ events }: { events: MacroState['events'] }) {
  const [impact, setImpact] = useState<ImpactFilter>('ALL');
  const [country, setCountry] = useState('ALL');
  const now = Date.now();

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.country) set.add(e.country);
    return ['ALL', ...Array.from(set).sort()];
  }, [events]);

  const filtered = events.filter(e => {
    if (impact !== 'ALL' && (e.impact ?? '').toUpperCase() !== impact) return false;
    if (country !== 'ALL' && e.country !== country) return false;
    return true;
  });

  const upcoming = filtered.filter(e => Date.parse(e.at) >= now);
  const nextHigh = upcoming.find(e => (e.impact ?? '').toUpperCase() === 'HIGH');

  return (
    <div className="space-y-3" data-testid="macro-calendar-panel">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-fg-3">// ECONOMIC CALENDAR</div>
          <h2 className="font-display font-black text-xl tracking-tight mt-1">Event Window</h2>
        </div>
        <div className="text-[11px] text-fg-3 numeric">{filtered.length} events</div>
      </div>

      {nextHigh && (
        <div className="tcard p-3 border-loss/25 flex items-center justify-between gap-3" data-testid="macro-calendar-next-high">
          <div className="min-w-0">
            <div className="text-[9px] tracking-[0.16em] text-loss">NEXT HIGH IMPACT</div>
            <div className="text-[13px] text-fg truncate mt-0.5">{nextHigh.title}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-fg-3">{nextHigh.country ?? '—'}</div>
            <div className="numeric text-[12px] text-profit mt-0.5">{formatWhen(nextHigh.at, now)}</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="seg overflow-x-auto no-scrollbar">
          {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as ImpactFilter[]).map(x => (
            <button
              key={x}
              type="button"
              data-active={impact === x}
              onClick={() => setImpact(x)}
              className="seg-item shrink-0 tracking-[0.12em]"
            >
              {x}
            </button>
          ))}
        </div>
        <select
          value={country}
          onChange={e => setCountry(e.target.value)}
          className="bg-surface border border-border rounded-[var(--radius-btn)] px-2 py-1.5 text-[11px] text-fg"
          data-testid="macro-calendar-country"
        >
          {countries.map(c => (
            <option key={c} value={c}>{c === 'ALL' ? 'All countries' : c}</option>
          ))}
        </select>
      </div>

      {!filtered.length ? (
        <div className="tcard p-4 text-sm text-fg-3">No events match these filters.</div>
      ) : (
        <ul className="tcard divide-y divide-border-soft">
          {filtered.map((e, i) => {
            const tone = impactTone(e.impact);
            const upcomingEv = Date.parse(e.at) >= now;
            return (
              <li key={`${e.title}-${e.at}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${impactPill(tone)}`}>
                      {(e.impact ?? '—').toUpperCase()}
                    </span>
                    <span className="text-[13px] text-fg truncate">{e.title}</span>
                  </div>
                  <div className="text-[10px] text-fg-3 mt-0.5">
                    {e.country ?? '—'}
                    {(e.forecast || e.prev) && (
                      <span className="numeric"> · F {e.forecast ?? '—'} · P {e.prev ?? '—'}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {e.actual != null && e.actual !== '' && (
                    <div className="numeric text-[12px] text-fg">{e.actual}</div>
                  )}
                  <div className={`text-[10px] numeric ${upcomingEv ? 'text-profit' : 'text-fg-3'}`}>
                    {formatWhen(e.at, now)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
