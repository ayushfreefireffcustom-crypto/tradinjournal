'use client';

// Vertical economic-calendar rail (Markets page). Rearchitected to be robust to
// the data source: it fetches ONE wide window up front and then filters entirely
// client-side (Upcoming / Today / Week / All + impact). That removes the whole
// class of "navigate to an un-fetched window → empty void" bugs the per-nav
// refetch design had, and it can never race itself. A data-range line makes the
// available coverage explicit (the free ForexFactory feed only carries the
// current week; add an FMP/Finnhub key for history + forecasts).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDots, Star, ArrowClockwise } from '@phosphor-icons/react';
import EventModal from '@/components/calendar/event-modal';
import {
  startOfDay,
  startOfWeek,
  surprise,
  flag,
  timeLabel,
  dayKey,
  impactAccent,
  impactPill,
  impactDot,
} from '@/lib/calendar-format';
import { api, type CalendarEvent, type EventImpact } from '@/lib/api';

const IMPACTS: EventImpact[] = ['HIGH', 'MEDIUM', 'LOW'];
const REFRESH_MS = 45_000;
const FILTERS = ['upcoming', 'today', 'week', 'all'] as const;
type CalFilter = (typeof FILTERS)[number];
const FILTER_LABEL: Record<CalFilter, string> = { upcoming: 'Upcoming', today: 'Today', week: 'Week', all: 'All' };

// Wide fetch window: grab everything the provider will give so all client-side
// filters operate on real data (the API caps at 500 and returns what it has).
function fetchWindow(): { from: string; to: string } {
  const now = Date.now();
  return { from: new Date(now - 30 * 864e5).toISOString(), to: new Date(now + 60 * 864e5).toISOString() };
}

function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export default function CalendarRail() {
  const [filter, setFilter] = useState<CalFilter>('week');
  // Default to HIGH+MEDIUM — the real economic releases. LOW (which includes bank
  // holidays from the TradingView feed) is a toggle so it doesn't flood the list.
  const [impacts, setImpacts] = useState<Set<EventImpact>>(() => new Set<EventImpact>(['HIGH', 'MEDIUM']));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const reqId = useRef(0); // guards against a stale response overwriting a newer one

  const load = useCallback(async (spinner: boolean) => {
    const id = ++reqId.current;
    if (spinner) setLoading(true);
    const { from, to } = fetchWindow();
    try {
      const rows = await api.calendar.list({ from, to });
      if (id !== reqId.current) return; // superseded
      setEvents(rows);
      setError('');
    } catch {
      if (id === reqId.current) setError('The economic calendar is unavailable right now.');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

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
      <button
        key={ev.id}
        type="button"
        onClick={() => setSelected(ev)}
        data-testid="cal-rail-event"
        className={`w-full text-left border-l-2 ${impactAccent[ev.impact]} pl-2.5 pr-1 py-2 rounded-r-md hover:bg-surface transition-colors ${past ? 'opacity-55 hover:opacity-100' : ''}`}
      >
        <div className="flex items-center gap-1.5">
          <span className="numeric text-[10.5px] text-fg-3 shrink-0 w-9">{timeLabel(ev.eventTime)}</span>
          <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${impactDot[ev.impact]}`} />
          <span className="text-[11px] shrink-0" title={ev.country}>{flag(ev.country)}</span>
          <span className="text-[10px] font-semibold text-fg-2 shrink-0">{ev.currency}</span>
          <span className="text-[11.5px] text-fg leading-tight truncate flex-1 min-w-0">{ev.title}</span>
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); void onWatch(ev); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); void onWatch(ev); } }}
            aria-label={ev.watched ? 'Unwatch' : 'Watch'}
            data-testid="cal-rail-watch"
            className="shrink-0 p-0.5 cursor-pointer"
          >
            <Star size={12} weight={ev.watched ? 'fill' : 'regular'} className={ev.watched ? 'text-warning' : 'text-fg-3 hover:text-fg'} />
          </span>
        </div>
        {hasData && (
          <div className="flex items-center gap-2.5 text-[10px] numeric mt-1 pl-[3.375rem]">
            <span className="text-fg-3">A{' '}
              <span className={`font-semibold ${fresh && dir ? (dir === 'up' ? 'flash-profit' : 'flash-loss') : ''} ${dir === 'up' ? 'text-profit' : dir === 'down' ? 'text-loss' : 'text-fg-2'}`}>
                {ev.actual ?? '–'}{dir === 'up' ? '▲' : dir === 'down' ? '▼' : ''}
              </span>
            </span>
            <span className="text-fg-3">F <span className="text-fg-2">{ev.forecast ?? '–'}</span></span>
            <span className="text-fg-3">P <span className="text-fg-2">{ev.previous ?? '–'}</span></span>
          </div>
        )}
      </button>
    );
  };

  // Render a day group; the "today" group is split at the now-line.
  const renderDay = (day: string, rows: CalendarEvent[]) => {
    if (day !== todayKey) return <div className="space-y-0.5">{rows.map(row)}</div>;
    const past = rows.filter(e => new Date(e.eventTime).getTime() <= now);
    const future = rows.filter(e => new Date(e.eventTime).getTime() > now);
    return (
      <div className="space-y-0.5">
        {past.map(row)}
        {past.length > 0 && future.length > 0 && (
          <div className="flex items-center gap-1.5 py-1" data-testid="cal-rail-now">
            <span className="flex items-center gap-1 text-[8.5px] font-bold tracking-[0.18em] uppercase text-profit whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> Now · {nowLabel}
            </span>
            <span className="flex-1 h-px bg-profit/30" />
          </div>
        )}
        {future.map(row)}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="calendar-rail">
      {/* Header */}
      <div className="shrink-0 px-3 py-2.5 border-b border-border-soft space-y-2">
        <div className="flex items-center gap-2">
          <CalendarDots size={14} className="text-fg-3" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-fg-2 font-semibold">Economic Calendar</span>
          <button onClick={() => void load(true)} aria-label="Refresh" className="ml-auto p-1 text-fg-3 hover:text-fg transition-colors">
            <ArrowClockwise size={12} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>

        {/* Time filter + impact filter */}
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-[var(--radius-btn)] border border-border-soft overflow-hidden">
            {FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                data-testid={`cal-rail-filter-${f}`}
                className={`px-2 py-1 text-[9px] tracking-[0.08em] uppercase transition-colors ${filter === f ? 'bg-profit/15 text-fg' : 'text-fg-3 hover:text-fg'}`}
              >
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            {IMPACTS.map(i => (
              <button
                key={i}
                onClick={() => toggleImpact(i)}
                aria-pressed={impacts.has(i)}
                data-testid={`cal-rail-impact-${i}`}
                className={`px-1.5 py-1 text-[8.5px] font-bold tracking-wider uppercase rounded ${impacts.has(i) ? impactPill[i] : 'text-fg-3 opacity-40 hover:opacity-100'}`}
              >
                {i[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Coverage line — what data is actually available */}
        {coverage && (
          <p className="text-[9px] tracking-wide text-fg-3/70 numeric">
            {coverage.count} events · {shortDate(coverage.min)} – {shortDate(coverage.max)}
          </p>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2" data-testid="cal-rail-list">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer h-9" />)}</div>
        ) : error ? (
          <p className="text-[11px] text-fg-3 px-2 py-6 text-center">{error}</p>
        ) : events.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-[12px] text-fg-2">No calendar data yet.</p>
            <p className="text-[10.5px] text-fg-3 mt-1.5 leading-relaxed">Events are ingested from the economic-calendar feed. If this stays empty, the feed may be unconfigured.</p>
          </div>
        ) : totalShown === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-[12px] text-fg-2">No {FILTER_LABEL[filter].toLowerCase()} events{impacts.size < IMPACTS.length ? ' at these impact levels' : ''}.</p>
            <button onClick={() => setFilter('all')} className="text-[10.5px] text-profit hover:underline mt-1.5">Show all {coverage?.count ?? ''} available →</button>
          </div>
        ) : (
          groups.map(([day, rows]) => (
            <div key={day} className="mb-2">
              <div className="sticky top-0 z-10 bg-app/95 backdrop-blur px-1.5 py-1 text-[9px] tracking-[0.18em] uppercase text-fg-3 flex items-center justify-between">
                <span>{day}</span>
                <span className="text-fg-3/60 numeric">{rows.length}</span>
              </div>
              {renderDay(day, rows)}
            </div>
          ))
        )}
      </div>

      {selected && <EventModal event={selected} onClose={() => setSelected(null)} onToggleWatch={onWatch} />}
    </div>
  );
}
