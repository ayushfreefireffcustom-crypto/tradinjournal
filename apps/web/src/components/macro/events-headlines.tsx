'use client';

import type { MacroState } from '@/lib/macro-api';

export default function MacroEventsHeadlines({
  events,
  headlines,
}: {
  events: MacroState['events'];
  headlines: MacroState['headlines'];
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-3" data-testid="macro-events-headlines">
      <section className="tcard p-4 min-h-[180px]">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// EVENTS</div>
        {!events.length ? (
          <p className="text-sm text-fg-3 mt-3">No upcoming calendar events in window.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {events.slice(0, 8).map((e, i) => (
              <li key={`${e.title}-${e.at}-${i}`} className="flex items-start justify-between gap-2 text-[12px]">
                <div className="min-w-0">
                  <div className="text-fg truncate">{e.title}</div>
                  <div className="text-fg-3 text-[10px] mt-0.5">
                    {e.country ?? '—'} · {e.impact ?? '—'} · {new Date(e.at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="tcard p-4 min-h-[180px]">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// HEADLINES</div>
        {!headlines.length ? (
          <p className="text-sm text-fg-3 mt-3">No headlines yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {headlines.slice(0, 8).map((h, i) => (
              <li key={`${h.url}-${i}`} className="text-[12px]">
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-fg hover:text-profit transition-colors line-clamp-2"
                >
                  {h.title}
                </a>
                <div className="text-fg-3 text-[10px] mt-0.5">
                  {h.source ?? '—'} · {new Date(h.at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
