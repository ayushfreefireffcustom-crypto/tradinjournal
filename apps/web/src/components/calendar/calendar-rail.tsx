'use client';

// Vertical economic-calendar rail — the compact, single-column list that sits
// beside the news feed on the Markets page (replaces the old wide card grid).
// Dense rows: time · impact dot · flag/ccy · title, with Actual/Forecast/Previous
// and surprise coloring. Self-contained: owns its fetch, filters, and detail modal.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDots, Star, ArrowClockwise } from '@phosphor-icons/react';
import EventModal from '@/components/calendar/event-modal';
import {
  rangeWindow,
  surprise,
  flag,
  timeLabel,
  dayKey,
  impactAccent,
  impactPill,
  impactDot,
  type CalRange,
} from '@/lib/calendar-format';
import { api, type CalendarEvent, type EventImpact } from '@/lib/api';

const IMPACTS: EventImpact[] = ['HIGH', 'MEDIUM', 'LOW'];
const REFRESH_MS = 45_000;

export default function CalendarRail() {
  const [range, setRange] = useState<CalRange>('week');
  const [impacts, setImpacts] = useState<Set<EventImpact>>(new Set(['HIGH', 'MEDIUM']));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const load = useCallback(async (spinner: boolean) => {
    if (spinner) setLoading(true);
    const { from, to } = rangeWindow(range);
    try {
      const rows = await api.calendar.list({ from, to });
      setEvents(rows);
      setError('');
    } catch {
      setError('Calendar unavailable.');
    } finally {
      setLoading(false);
    }
  }, [range]);

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

  const groups = useMemo(() => {
    const filtered = events.filter(e => impacts.has(e.impact));
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filtered) (map.get(dayKey(e.eventTime)) ?? map.set(dayKey(e.eventTime), []).get(dayKey(e.eventTime))!).push(e);
    return [...map.entries()];
  }, [events, impacts]);

  const now = Date.now();

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

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="calendar-rail">
      {/* Header */}
      <div className="shrink-0 px-3 py-2.5 border-b border-border-soft">
        <div className="flex items-center gap-2 mb-2">
          <CalendarDots size={14} className="text-fg-3" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-fg-2 font-semibold">Economic Calendar</span>
          <button onClick={() => void load(true)} aria-label="Refresh" className="ml-auto p-1 text-fg-3 hover:text-fg transition-colors">
            <ArrowClockwise size={12} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-[var(--radius-btn)] border border-border-soft overflow-hidden">
            {(['today', 'week'] as CalRange[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                data-testid={`cal-rail-range-${r}`}
                className={`px-2.5 py-1 text-[9.5px] tracking-[0.12em] uppercase transition-colors ${range === r ? 'bg-profit/15 text-fg' : 'text-fg-3 hover:text-fg'}`}
              >
                {r === 'today' ? 'Today' : 'Week'}
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
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2" data-testid="cal-rail-list">
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="shimmer h-9" />)}</div>
        ) : error ? (
          <p className="text-[11px] text-fg-3 px-2 py-4 text-center">{error}</p>
        ) : groups.length === 0 ? (
          <p className="text-[11px] text-fg-3 px-2 py-4 text-center">No events match your filters.</p>
        ) : (
          groups.map(([day, rows]) => (
            <div key={day} className="mb-2">
              <div className="sticky top-0 z-10 bg-app/95 backdrop-blur px-1.5 py-1 text-[9px] tracking-[0.18em] uppercase text-fg-3">{day}</div>
              <div className="space-y-0.5">{rows.map(row)}</div>
            </div>
          ))
        )}
      </div>

      {selected && <EventModal event={selected} onClose={() => setSelected(null)} onToggleWatch={onWatch} />}
    </div>
  );
}
