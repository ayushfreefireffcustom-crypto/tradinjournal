'use client';

import EmptyState from '@/components/v6/ui/empty-state';
import { useMemo, useState } from 'react';
import type { MacroState } from '@/lib/macro-api';
import { formatWhen } from '@/lib/macro-format';
import { ImpactTag } from '@/components/v6/macro/impact';
import { PanelHead } from '@/components/v6/macro/ui';

type ImpactFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';
const FILTERS: { key: ImpactFilter; label: string }[] = [
  { key: 'ALL', label: 'All' }, { key: 'HIGH', label: 'High' }, { key: 'MEDIUM', label: 'Medium' }, { key: 'LOW', label: 'Low' },
];

/** Macro calendar with impact and country filters plus countdowns. */
export default function MacroCalendarPanel({ events }: { events: MacroState['events'] }) {
  const [impact, setImpact] = useState<ImpactFilter>('ALL');
  const [country, setCountry] = useState('ALL');
  const now = Date.now();

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.country) set.add(e.country);
    return ['ALL', ...Array.from(set).sort()];
  }, [events]);

  // Upcoming first (soonest at the top), then what already happened, most recent first.
  const filtered = events.filter(e => {
    if (impact !== 'ALL' && (e.impact ?? '').toUpperCase() !== impact) return false;
    if (country !== 'ALL' && e.country !== country) return false;
    return true;
  }).sort((a, b) => {
    const ta = Date.parse(a.at), tb = Date.parse(b.at), fa = ta >= now, fb = tb >= now;
    return fa !== fb ? (fa ? -1 : 1) : fa ? ta - tb : tb - ta;
  });

  const upcoming = filtered.filter(e => Date.parse(e.at) >= now);
  const nextHigh = upcoming.find(e => (e.impact ?? '').toUpperCase() === 'HIGH');

  return (
    <div className="mc-stack" data-testid="macro-calendar-panel">
      <PanelHead eyebrow="Economic calendar" title="Event window" right={<span className="x-muted"><span className="m">{filtered.length}</span> events</span>} />

      {nextHigh && (
        <div className="x-card mc-next" data-testid="macro-calendar-next-high">
          <i className="x-dot x-dot--r" aria-hidden />
          <div className="mc-next-m"><small>Next high-impact event</small><b>{nextHigh.title}</b></div>
          <div className="mc-next-r"><small>{nextHigh.country ?? '—'}</small><b className="m pos">{formatWhen(nextHigh.at, now)}</b></div>
        </div>
      )}

      <section className="x-card">
        <div className="mc-filters">
          <div className="x-seg x-seg--sm" role="group" aria-label="Impact">
            {FILTERS.map(f => <button key={f.key} type="button" aria-pressed={impact === f.key} data-active={impact === f.key} onClick={() => setImpact(f.key)}>{f.label}</button>)}
          </div>
          <select value={country} onChange={e => setCountry(e.target.value)} className="x-select mc-sel" aria-label="Country" data-testid="macro-calendar-country">
            {countries.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All countries' : c}</option>)}
          </select>
        </div>

        {!filtered.length ? (
          <EmptyState icon="calendar" ghost="calendar" tone="warn" title="No events match">Try a different impact level or country.</EmptyState>
        ) : (
          <ul className="mc-ev x-list">
            {filtered.map((e, i) => {
              const up = Date.parse(e.at) >= now;
              return (
                <li key={`${e.title}-${e.at}-${i}`}>
                  <ImpactTag impact={e.impact} />
                  <div className="mc-ev-m">
                    <b>{e.title}</b>
                    <small>{e.country ?? '—'}{(e.forecast || e.prev) && <> · forecast <span className="m">{e.forecast ?? '—'}</span> · prior <span className="m">{e.prev ?? '—'}</span></>}</small>
                  </div>
                  <div className="mc-ev-r">
                    {e.actual != null && e.actual !== '' && <b className="m">{e.actual}</b>}
                    <small className={`m ${up ? 'pos' : ''}`}>{formatWhen(e.at, now)}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
