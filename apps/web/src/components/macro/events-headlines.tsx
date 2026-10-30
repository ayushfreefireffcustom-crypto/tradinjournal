'use client';

import type { MacroState } from '@/lib/macro-api';
import { formatWhen } from '@/lib/macro-format';
import { ImpactTag } from '@/components/v6/macro/impact';
import { IExt } from '@/components/v6/macro/ui';

export default function MacroEventsHeadlines({
  events,
  headlines,
}: {
  events: MacroState['events'];
  headlines: MacroState['headlines'];
}) {
  const now = Date.now();
  return (
    <div className="mc-2" data-testid="macro-events-headlines">
      <section className="x-card">
        <div className="x-ch"><h2>Economic calendar</h2><span className="x-sub"><span className="m">{events.length}</span> events</span></div>
        {!events.length ? <p className="x-muted mc-p">No calendar events in this window.</p> : (
          <ul className="mc-ev x-list">
            {events.slice(0, 8).map((e, i) => {
              const upcoming = Date.parse(e.at) >= now;
              return (
                <li key={`${e.title}-${e.at}-${i}`}>
                  <ImpactTag impact={e.impact} />
                  <div className="mc-ev-m">
                    <b>{e.title}</b>
                    <small>{e.country ?? '—'}{(e.forecast || e.prev) && <> · forecast <span className="m">{e.forecast ?? '—'}</span> · prior <span className="m">{e.prev ?? '—'}</span></>}</small>
                  </div>
                  <div className="mc-ev-r">
                    {e.actual != null && e.actual !== '' && <b className="m">{e.actual}</b>}
                    <small className={`m ${upcoming ? 'pos' : ''}`}>{formatWhen(e.at, now)}</small>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="x-card">
        <div className="x-ch"><h2>Market headlines</h2><span className="x-sub"><span className="m">{headlines.length}</span> stories</span></div>
        {!headlines.length ? <p className="x-muted mc-p">No headlines yet.</p> : (
          <ul className="mc-hl x-list">
            {headlines.slice(0, 8).map((h, i) => (
              <li key={`${h.url}-${i}`}>
                <a href={h.url} target="_blank" rel="noreferrer">
                  <b>{h.title}</b>
                  <small>{h.source ?? '—'} · {formatWhen(h.at, now)}</small>
                </a>
                <IExt size={13} className="mc-hl-x" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
