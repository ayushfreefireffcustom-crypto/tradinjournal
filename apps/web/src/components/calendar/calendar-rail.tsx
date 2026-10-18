'use client';

// Vertical economic-calendar rail (Markets page). Rearchitected to be robust to
// the data source: it fetches ONE wide window up front and then filters entirely
// client-side (Upcoming / Today / Week / All + impact). That removes the whole
// class of "navigate to an un-fetched window → empty void" bugs the per-nav
// refetch design had, and it can never race itself. A data-range line makes the
// available coverage explicit (the free ForexFactory feed only carries the
// current week; add an FMP/Finnhub key for history + forecasts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EventModal from '@/components/calendar/event-modal';
import { Loader } from '@/components/loader';
import {
  startOfDay,
  startOfWeek,
  surprise,
  flag,
  timeLabel,
  dayKey,
} from '@/lib/calendar-format';
import { api, type CalendarEvent, type EventImpact } from '@/lib/api';

const IMPACTS: EventImpact[] = ['HIGH', 'MEDIUM', 'LOW'];
const REFRESH_MS = 45_000;
const FILTERS = ['upcoming', 'today', 'week', 'all'] as const;
type CalFilter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<CalFilter, string> = { upcoming: 'Upcoming', today: 'Today', week: 'Week', all: 'All' };

// Fetch window centred near now (recent past + the month ahead) so the client-side
// filters (Upcoming/Today/Week/All) all have real data. DAY-ALIGNED so the from/to
// don't change every render — otherwise a millisecond-precise window makes every
// request a fresh cache miss (the calendar read caches on the exact from/to).
function fetchWindow(): { from: string; to: string } {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return {
    from: new Date(startOfToday.getTime() - 7 * 864e5).toISOString(),
    to: new Date(startOfToday.getTime() + 31 * 864e5).toISOString(),
  };
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CalendarRail() {
  const [filter, setFilter] = useState<CalFilter>('upcoming');
  // Default to HIGH+MEDIUM — the real economic releases. LOW (which includes bank
  // holidays from the TradingView feed) is a toggle so it doesn't flood the list.
  const [impacts, setImpacts] = useState<Set<EventImpact>>(() => new Set<EventImpact>(['HIGH', 'MEDIUM']));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const reqId = useRef(0); // guards against a stale response overwriting a newer one

  // Fetch only the selected impacts server-side — the default HIGH+MEDIUM is ~3×
  // smaller than every-impact (which includes bank-holiday noise). Refetch when
  // the impact set changes.
  const impactsKey = [...impacts].sort().join(',');
  const load = useCallback(async (spinner: boolean) => {
    const id = ++reqId.current;
    if (spinner) setLoading(true);
    const { from, to } = fetchWindow();
    try {
      const rows = await api.calendar.list({ from, to, impacts: impactsKey ? (impactsKey.split(',') as EventImpact[]) : undefined });
      if (id !== reqId.current) return; // superseded
      setEvents(rows);
      setError('');
    } catch {
      if (id === reqId.current) setError('The economic calendar is unavailable right now.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [impactsKey]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    const t = setInterval(() => void load(false), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const toggleImpact = (i: EventImpact) =>
    setImpacts(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next.size === 0 ? new Set(IMPACTS) : next;
    });

  const onWatch = useCallback(async (ev: CalendarEvent) => {
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, watched: !e.watched } : e)));
    try {
      ev.watched ? await api.calendar.unwatch(ev.id) : await api.calendar.watch(ev.id);
    } catch {
      setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, watched: ev.watched } : e)));
    }
  }, []);

  // The full available range (for the coverage line) — independent of filters.
  const coverage = useMemo(() => {
    if (events.length === 0) return null;
    const times = events.map(e => new Date(e.eventTime).getTime());
    return { min: new Date(Math.min(...times)), max: new Date(Math.max(...times)), count: events.length };
  }, [events]);

  const now = Date.now();
  const todayKey = dayKey(new Date().toISOString());
  const nowLabel = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const groups = useMemo(() => {
    const startToday = startOfDay(new Date()).getTime();
    const weekStart = startOfWeek(new Date()).getTime();
    const weekEnd = weekStart + 7 * 864e5;
    const inFilter = (ev: CalendarEvent): boolean => {
      const t = new Date(ev.eventTime).getTime();
      if (filter === 'all') return true;
      if (filter === 'today') return dayKey(ev.eventTime) === todayKey;
      if (filter === 'week') return t >= weekStart && t < weekEnd;
      return t >= startToday; // upcoming
    };
    const filtered = events.filter(e => impacts.has(e.impact) && inFilter(e));
    filtered.sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      const k = dayKey(e.eventTime);
      (map.get(k) ?? map.set(k, []).get(k)!).push(e);
    }
    return [...map.entries()];
  }, [events, impacts, filter, todayKey]);

  const totalShown = groups.reduce((n, [, r]) => n + r.length, 0);

  const row = (ev: CalendarEvent) => {
    const dir = surprise(ev.actual, ev.forecast);
    const fresh = ev.actualAt && Date.now() - new Date(ev.actualAt).getTime() < REFRESH_MS * 2;
    const past = new Date(ev.eventTime).getTime() <= now;
    const hasData = !!(ev.previous || ev.forecast || ev.actual);
    return (
      <div key={ev.id} className={`cr-ev ${past ? 'past' : ''}`} data-testid="cal-rail-event">
        <button type="button" className="cr-main" onClick={() => setSelected(ev)}>
          <span className="t num">{timeLabel(ev.eventTime)}</span>
          <i className={`dot ${ev.impact.toLowerCase()}`} title={`${ev.impact.toLowerCase()} impact`} />
          <span className="b">
            <span className="n"><span className="fl" title={ev.country}>{flag(ev.country)}</span> {ev.currency} · {ev.title}</span>
            {hasData && (
              <span className="v num">
                {ev.actual != null && <span className={`a ${fresh ? 'fresh' : ''} ${dir === 'up' ? 'lg' : dir === 'down' ? 'sh' : ''}`}>A {ev.actual}{dir === 'up' ? '▲' : dir === 'down' ? '▼' : ''}</span>}
                <span>F {ev.forecast ?? '–'}</span><span>P {ev.previous ?? '–'}</span>
              </span>
            )}
          </span>
        </button>
        {!past && (
          <button type="button" className={`cr-star ${ev.watched ? 'on' : ''}`} onClick={() => void onWatch(ev)} aria-pressed={ev.watched} aria-label={ev.watched ? `Stop watching ${ev.title}` : `Watch ${ev.title}`} data-testid="cal-rail-watch">
            <svg width="17" height="17" viewBox="0 0 24 24" fill={ev.watched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z" /></svg>
          </button>
        )}
      </div>
    );
  };

  // Render a day group; the "today" group is split at the now-line.
  const renderDay = (day: string, rows: CalendarEvent[]) => {
    if (day !== todayKey) return <>{rows.map(row)}</>;
    const past = rows.filter(e => new Date(e.eventTime).getTime() <= now);
    const future = rows.filter(e => new Date(e.eventTime).getTime() > now);
    return (
      <>
        {past.map(row)}
        {past.length > 0 && future.length > 0 && (
          <div className="cr-now" data-testid="cal-rail-now"><span><i />Now · {nowLabel}</span></div>
        )}
        {future.map(row)}
      </>
    );
  };
  const dayTitle = (k: string) => {
    const first = groups.find(([d]) => d === k)?.[1][0];
    if (!first) return k;
    const d = new Date(first.eventTime);
    const lbl = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return k === todayKey ? `Today · ${lbl}` : lbl;
  };

  return (
    <section className="v3-card cr" data-testid="calendar-rail" aria-labelledby="cr-t">
      <div className="cr-hd">
        <div className="cr-top">
          <h3 id="cr-t">Economic calendar</h3>
          <button onClick={() => void load(true)} aria-label="Refresh calendar" className="cr-ref"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className={loading ? 'spin' : undefined}><path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7" /></svg></button>
        </div>
        <div className="cr-ctl">
          <div className="v3-seg sm" role="group" aria-label="Range">
            {FILTERS.map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)} data-testid={`cal-rail-filter-${f}`}>{FILTER_LABEL[f]}</button>)}
          </div>
          <div className="cr-imp" role="group" aria-label="Impact">
            {IMPACTS.map(i => <button key={i} aria-pressed={impacts.has(i)} className={i.toLowerCase()} onClick={() => toggleImpact(i)} data-testid={`cal-rail-impact-${i}`} title={`${i.toLowerCase()} impact`}>{i[0]}</button>)}
          </div>
        </div>
        {coverage && <p className="cr-cov num">{coverage.count} events · {shortDate(coverage.min)} — {shortDate(coverage.max)}</p>}
      </div>

      <div className="cr-list" data-testid="cal-rail-list">
        {loading ? <div className="cr-empty"><Loader label="Loading events" /></div>
          : error ? <p className="cr-empty">{error}</p>
          : events.length === 0 ? <div className="cr-empty"><b>No calendar data yet</b>Events appear once the economic-calendar feed is connected.</div>
          : totalShown === 0 ? (
            <div className="cr-empty"><b>No {FILTER_LABEL[filter].toLowerCase()} events{impacts.size < IMPACTS.length ? ' at these impact levels' : ''}</b>
              <button onClick={() => setFilter('all')} className="v3-link">Show all {coverage?.count ?? ''} events</button></div>
          ) : groups.map(([day, rows]) => (
            <div key={day} className="cr-day">
              <div className="cr-dh"><span>{dayTitle(day)}</span><span className="num">{rows.length}</span></div>
              {renderDay(day, rows)}
            </div>
          ))}
      </div>

      {selected && <EventModal event={selected} onClose={() => setSelected(null)} onToggleWatch={onWatch} />}
    </section>
  );
}
