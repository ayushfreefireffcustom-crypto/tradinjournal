'use client';

// Right rail: "Next up" (what's left on today's calendar, UTC, on a now→24:00
// strip) and "Hits your trades" (map stories that touch your open positions or
// the symbols you traded this month; hidden when there are none).
import Link from '@/components/v6/ui/link';
import type { CalendarEvent } from '@/lib/api';
import { countdown, eventHitsTrade, hhmm, type Hit, type Mine } from '@/lib/news-map-api';
import { You, useSize } from './bits';

const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

function endOfUtcDay(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** Today's remaining HIGH/MEDIUM events, soonest first. */
export function upcoming(events: CalendarEvent[], now: number, max = 5): CalendarEvent[] {
  const end = endOfUtcDay(now);
  return events
    .filter(e => { const t = Date.parse(e.eventTime); return t > now && t < end && (e.actual == null || e.actual === ''); })
    .sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime))
    .slice(0, max);
}

function NowAxis({ now, events }: { now: number; events: CalendarEvent[] }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const end = endOfUtcDay(now);
  const x = lin(now, end, 8, Math.max(9, w - 8));
  const ticks: number[] = [];
  for (let t = end; t > now + 75 * 60_000; t -= 4 * 3600_000) ticks.unshift(t);
  return (
    <div ref={ref} className="nw-axis">
      {w > 0 && (
        <svg width={w} height={40} viewBox={`0 0 ${w} 40`} aria-hidden>
          <line className="nw-ax" x1={8} x2={w - 8} y1={20} y2={20} />
          {ticks.map(t => (
            <text key={t} className="nw-t11 nw-tx3" x={x(t)} y={38} textAnchor={t === end ? 'end' : 'middle'}>{t === end ? '24:00' : hhmm(t)}</text>
          ))}
          <line className="nw-now" x1={8} x2={8} y1={10} y2={30} />
          <text className="nw-t11 nw-tx1" x={8} y={8} fontWeight={700}>Now {hhmm(now)}</text>
          {events.map(e => {
            const ex = x(Date.parse(e.eventTime));
            return <rect key={e.id} x={ex - 4} y={16} width={8} height={8} className={e.impact === 'HIGH' ? 'nw-fd' : 'nw-fm'} />;
          })}
        </svg>
      )}
    </div>
  );
}

function fp(e: CalendarEvent): string {
  if (e.forecast || e.previous) return [e.forecast ? `F ${e.forecast}` : '', e.previous ? `P ${e.previous}` : ''].filter(Boolean).join(' · ');
  return /speak|speech|testif|press conference|remarks/i.test(e.title) ? 'Speech' : e.currency;
}

export function NextUp({ events, now, mine, error }: { events: CalendarEvent[] | null; now: number; mine: Mine; error?: boolean }) {
  const list = events ? upcoming(events, now) : [];
  return (
    <section className="nw-next" data-testid="news-next-up">
      <div className="nw-sh nw-sh--rail"><h2>Next up</h2><span className="nw-m">today, UTC</span><Link href="/markets" className="nw-sh-link">Calendar</Link></div>
      {events === null && !error ? (
        <div className="nw-sk nw-sk--rows" aria-hidden><i /><i /><i /></div>
      ) : error ? (
        <p className="nw-none">Calendar unavailable right now.</p>
      ) : list.length === 0 ? (
        <p className="nw-none">Nothing left on today&apos;s calendar.</p>
      ) : (
        <>
          <NowAxis now={now} events={list} />
          <div className="nw-evs">
            {list.map((e, i) => {
              // Tag only the first release that touches a position, not every USD row.
              const first = list.findIndex(x => eventHitsTrade(x, mine));
              const hit = i === first ? eventHitsTrade(e, mine) : null;
              const tr = hit ? mine.open.get(hit) : null;
              return (
                <div key={e.id} className={`nw-ev${e.impact === 'HIGH' ? ' nw-ev--hi' : ''}`}>
                  <span className="nw-ev-t num">{hhmm(e.eventTime)}</span>
                  <span className="nw-ev-n">{e.title}</span>
                  <span className="nw-ev-in num">{countdown(Date.parse(e.eventTime) - now)}</span>
                  <span className="nw-ev-fp num">
                    <span className="nw-ell">{fp(e)}</span>
                    {hit && tr && <You>{`Your ${hit} ${tr.direction === 'LONG' ? 'long' : 'short'}`}</You>}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export function Hits({ hits, onOpen }: { hits: Hit[]; onOpen: (h: Hit) => void }) {
  if (!hits.length) return null;
  return (
    <section className="nw-hits" data-testid="news-hits">
      <div className="nw-sh nw-sh--rail"><h2>Hits your trades</h2><span className="nw-m">from the map</span></div>
      {hits.map(h => (
        <button type="button" key={h.symbol} className="nw-ex" onClick={() => onOpen(h)}>
          <span className="nw-ex-l"><span className="nw-ex-n">{h.title}</span><span className="nw-ex-k">{h.sub}</span></span>
          {h.value && <span className={`nw-ex-v num nw-${h.dir}`}>{h.value}</span>}
        </button>
      ))}
    </section>
  );
}
