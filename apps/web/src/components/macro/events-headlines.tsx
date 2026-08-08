'use client';

import type { MacroState } from '@/lib/macro-api';
import { formatWhen, impactTone } from '@/lib/macro-format';

function impactPill(tone: ReturnType<typeof impactTone>): string {
  if (tone === 'high') return 'text-loss border-loss/40 bg-loss/10';
  if (tone === 'medium') return 'text-warning border-warning/40 bg-warning/10';
  if (tone === 'low') return 'text-fg-3 border-border bg-surface-hover';
  return 'text-fg-3 border-border-soft';
}

export default function MacroEventsHeadlines({
  events,
  headlines,
}: {
  events: MacroState['events'];
  headlines: MacroState['headlines'];
}) {
  const now = Date.now();
  return (
    <div className="grid lg:grid-cols-2 gap-3" data-testid="macro-events-headlines">
      <section className="tcard p-4 min-h-[200px]">
        <div className="flex items-center justify-between border-b border-border-soft pb-2">
          <div className="text-[10px] tracking-[0.2em] text-fg-3">// ECONOMIC CALENDAR</div>
          <div className="text-[10px] text-fg-3 numeric">{events.length}</div>
        </div>
        {!events.length ? (
          <p className="text-sm text-fg-3 mt-3">No calendar events in window.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border-soft">
            {events.slice(0, 8).map((e, i) => {
              const tone = impactTone(e.impact);
              const upcoming = Date.parse(e.at) >= now;
              return (
                <li key={`${e.title}-${e.at}-${i}`} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border shrink-0 ${impactPill(tone)}`}>
                        {(e.impact ?? '—').toUpperCase()}
                      </span>
                      <span className="text-[12px] text-fg truncate">{e.title}</span>
                    </div>
                    <div className="text-[10px] text-fg-3 mt-0.5 ml-0.5">
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
                    <div className={`text-[10px] numeric ${upcoming ? 'text-profit' : 'text-fg-3'}`}>
                      {formatWhen(e.at, now)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="tcard p-4 min-h-[200px]">
        <div className="flex items-center justify-between border-b border-border-soft pb-2">
          <div className="text-[10px] tracking-[0.2em] text-fg-3">// MARKET HEADLINES</div>
          <div className="text-[10px] text-fg-3 numeric">{headlines.length}</div>
        </div>
        {!headlines.length ? (
          <p className="text-sm text-fg-3 mt-3">No headlines yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border-soft">
            {headlines.slice(0, 8).map((h, i) => (
              <li key={`${h.url}-${i}`} className="py-2">
                <a
                  href={h.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-start gap-2"
                >
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-border-strong group-hover:bg-profit shrink-0 transition-colors" />
                  <span className="min-w-0">
                    <span className="block text-[12px] text-fg group-hover:text-profit transition-colors line-clamp-2">
                      {h.title}
                    </span>
                    <span className="block text-[10px] text-fg-3 mt-0.5">
                      {h.source ?? '—'} · {formatWhen(h.at, now)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
