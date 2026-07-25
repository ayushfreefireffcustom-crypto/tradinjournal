'use client';

// Economic Calendar — upcoming macro events with impact, previous/forecast/actual,
// surprise highlighting, per-user watch, and a live "actual" flash as results
// release. Shared data (one ingestion serves all users); this page just reads it.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarBlank, Star, CaretDown, MagnifyingGlass, ArrowClockwise } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import EmptyState from '@/components/empty-state';
import { useAccounts } from '@/lib/use-accounts';
import { api, type CalendarEvent, type EventImpact, type BrokerAccount } from '@/lib/api';

type Range = 'today' | 'week' | 'upcoming';

const IMPACTS: EventImpact[] = ['HIGH', 'MEDIUM', 'LOW'];
const REFRESH_MS = 45_000;

/** ISO-3166 alpha-2 → flag emoji (regional-indicator letters). EU → 🇪🇺. */
function flag(cc: string): string {
  const c = cc.toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '🏳️';
  return String.fromCodePoint(...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function rangeWindow(r: Range): { from: string; to: string } {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (r === 'today') {
    const end = new Date(startOfToday.getTime() + 24 * 3600_000);
    return { from: startOfToday.toISOString(), to: end.toISOString() };
  }
  if (r === 'week') {
    const end = new Date(startOfToday.getTime() + 7 * 24 * 3600_000);
    return { from: startOfToday.toISOString(), to: end.toISOString() };
  }
  return { from: new Date(now.getTime() - 3600_000).toISOString(), to: new Date(startOfToday.getTime() + 8 * 24 * 3600_000).toISOString() };
}

const impactColor: Record<EventImpact, string> = {
  HIGH: 'text-loss border-loss/40 bg-loss/10',
  MEDIUM: 'text-warning border-warning/40 bg-warning/10',
  LOW: 'text-fg-3 border-border-strong bg-surface',
};
// Left-edge accent + label color per impact — the row's scannable impact cue.
const impactAccent: Record<EventImpact, string> = {
  HIGH: 'border-l-loss',
  MEDIUM: 'border-l-warning',
  LOW: 'border-l-border-strong',
};
const impactText: Record<EventImpact, string> = {
  HIGH: 'text-loss',
  MEDIUM: 'text-warning',
  LOW: 'text-fg-3',
};

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** "in 2h 15m" until an event; empty once it has started. */
function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return '';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const h = Math.floor(mins / 60);
  return `in ${h}h ${mins % 60}m`;
}

/** Compare actual vs forecast → direction for the surprise color, when numeric. */
function surprise(actual: string | null, forecast: string | null): 'up' | 'down' | null {
  if (!actual || !forecast) return null;
  const a = parseFloat(actual.replace(/[^0-9.-]/g, ''));
  const f = parseFloat(forecast.replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(a) || Number.isNaN(f) || a === f) return null;
  return a > f ? 'up' : 'down';
}

export default function EconomicCalendarPage() {
  const { accounts, selected, select } = useAccounts();
  const [range, setRange] = useState<Range>('week');
  const [impacts, setImpacts] = useState<Set<EventImpact>>(new Set(['HIGH', 'MEDIUM']));
  const [search, setSearch] = useState('');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    const { from, to } = rangeWindow(range);
    try {
      const rows = await api.calendar.list({ from, to });
      setEvents(rows);
      setError('');
    } catch {
      setError('The economic calendar is unavailable right now.');
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(true); }, [load]);
  // Live refresh so "actual" values appear as they release, without a reload.
  useEffect(() => {
    const t = setInterval(() => void load(false), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const toggleImpact = (i: EventImpact) =>
    setImpacts(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next.size === 0 ? new Set(IMPACTS) : next; // never empty
    });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter(e => impacts.has(e.impact) && (!q || e.title.toLowerCase().includes(q) || e.currency.toLowerCase().includes(q)));
  }, [events, impacts, search]);

  // Group by local day for readable headers.
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      const key = new Date(e.eventTime).toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short' });
      (map.get(key) ?? map.set(key, []).get(key)!).push(e);
    }
    return [...map.entries()];
  }, [filtered]);

  // "This week at a glance" — fills the header with something useful.
  const overview = useMemo(() => {
    const now = Date.now();
    const high = filtered.filter(e => e.impact === 'HIGH');
    const nextHigh = high.find(e => new Date(e.eventTime).getTime() > now) ?? null;
    return { total: filtered.length, highCount: high.length, watched: filtered.filter(e => e.watched).length, nextHigh };
  }, [filtered]);

  const onWatch = useCallback(async (ev: CalendarEvent) => {
    // Optimistic toggle.
    setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, watched: !e.watched } : e)));
    try {
      ev.watched ? await api.calendar.unwatch(ev.id) : await api.calendar.watch(ev.id);
    } catch {
      setEvents(prev => prev.map(e => (e.id === ev.id ? { ...e, watched: ev.watched } : e)));
    }
  }, []);

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="Economic Calendar"
      pageSubtitle="// UPCOMING MARKET EVENTS"
    >
      <div className="flex flex-col h-[calc(100vh-var(--topbar-h,7rem))] min-h-0" data-testid="econ-calendar-page">
        {/* Filter bar */}
        <div className="shrink-0 border-b border-border-soft px-3 sm:px-4 lg:px-6 py-3 flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-[var(--radius-btn)] border border-border-soft overflow-hidden">
            {(['today', 'week', 'upcoming'] as Range[]).map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                data-testid={`cal-range-${r}`}
                className={`px-3 py-1.5 text-[11px] tracking-[0.14em] uppercase transition-colors ${
                  range === r ? 'bg-profit/15 text-fg' : 'text-fg-3 hover:text-fg'
                }`}
              >
                {r === 'today' ? 'Today' : r === 'week' ? 'This week' : 'Upcoming'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {IMPACTS.map(i => (
              <button
                key={i}
                onClick={() => toggleImpact(i)}
                data-testid={`cal-impact-${i}`}
                aria-pressed={impacts.has(i)}
                className={`px-2.5 py-1.5 text-[10px] tracking-[0.14em] uppercase rounded-[var(--radius-btn)] border transition-all ${
                  impacts.has(i) ? impactColor[i] : 'text-fg-3 border-border-soft opacity-50 hover:opacity-100'
                }`}
              >
                {i}
              </button>
            ))}
          </div>

          <div className="relative ml-auto">
            <MagnifyingGlass size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search events…"
              data-testid="cal-search"
              className="w-40 sm:w-52 rounded-[var(--radius-btn)] border border-border-soft bg-surface/60 pl-8 pr-2 py-1.5 text-[12px] outline-none focus:border-profit/45"
            />
          </div>
          <button
            onClick={() => void load(true)}
            aria-label="Refresh"
            className="rounded-[var(--radius-btn)] border border-border-soft p-2 text-fg-3 hover:text-fg transition-colors"
          >
            <ArrowClockwise size={13} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>

        {/* Week-at-a-glance strip */}
        {!loading && !error && groups.length > 0 && (
          <div className="shrink-0 border-b border-border-soft px-3 sm:px-5 lg:px-6 py-2.5 flex items-center gap-6 text-[11px]">
            <span className="flex items-baseline gap-1.5"><span className="numeric text-fg font-semibold text-[15px]">{overview.total}</span><span className="text-fg-3 tracking-wide uppercase text-[10px]">events</span></span>
            <span className="flex items-baseline gap-1.5"><span className="numeric text-loss font-semibold text-[15px]">{overview.highCount}</span><span className="text-fg-3 tracking-wide uppercase text-[10px]">high impact</span></span>
            {overview.watched > 0 && (
              <span className="flex items-baseline gap-1.5"><span className="numeric text-warning font-semibold text-[15px]">{overview.watched}</span><span className="text-fg-3 tracking-wide uppercase text-[10px]">watched</span></span>
            )}
            {overview.nextHigh && (
              <span className="ml-auto flex items-center gap-2 text-fg-3">
                <span className="tracking-wide uppercase text-[10px]">Next high impact</span>
                <span className="text-sm">{flag(overview.nextHigh.country)}</span>
                <span className="text-fg-2 font-medium truncate max-w-[220px]">{overview.nextHigh.title}</span>
                <span className="text-loss font-semibold numeric">{countdown(overview.nextHigh.eventTime)}</span>
              </span>
            )}
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-5 lg:px-6 py-3" data-testid="cal-list">
          {loading ? (
            <div className="flex flex-col gap-px">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="shimmer h-10" />)}</div>
          ) : error ? (
            <EmptyState icon={CalendarBlank} title="Calendar unavailable" hint={error} />
          ) : groups.length === 0 ? (
            <EmptyState icon={CalendarBlank} title="No events" hint="No events match your filters for this window." />
          ) : (
            <div>
              {/* Column header */}
              <div className="hidden md:flex items-center gap-3 pl-4 pr-2 pb-1.5 text-[9px] tracking-[0.16em] uppercase text-fg-3 border-b border-border-soft">
                <span className="w-12">Time</span>
                <span className="w-[4.5rem]">Currency</span>
                <span className="w-14">Impact</span>
                <span className="flex-1">Event</span>
                <span className="w-16 text-right">Previous</span>
                <span className="w-16 text-right">Forecast</span>
                <span className="w-16 text-right">Actual</span>
                <span className="w-14" />
              </div>

              {groups.map(([day, rows]) => (
                <div key={day}>
                  <div className="sticky top-0 z-10 bg-app/95 backdrop-blur px-4 py-1.5 text-[10px] tracking-[0.2em] uppercase text-fg-3 border-b border-border-soft">{day}</div>
                  {rows.map(ev => {
                    const dir = surprise(ev.actual, ev.forecast);
                    const isOpen = expanded === ev.id;
                    const fresh = ev.actualAt && Date.now() - new Date(ev.actualAt).getTime() < REFRESH_MS * 2;
                    return (
                      <div key={ev.id} className={`border-l-2 border-b border-border-soft hover:bg-surface/50 transition-colors ${impactAccent[ev.impact]}`} data-testid="cal-event">
                        <button onClick={() => setExpanded(isOpen ? null : ev.id)} className="w-full flex items-center gap-3 pl-3.5 pr-2 py-2.5 text-left">
                          <span className="w-12 shrink-0 text-[11px] text-fg-3 numeric">{timeLabel(ev.eventTime)}</span>
                          <span className="w-[4.5rem] shrink-0 flex items-center gap-1.5">
                            <span className="text-sm" title={ev.country}>{flag(ev.country)}</span>
                            <span className="text-[11px] font-semibold text-fg-2">{ev.currency}</span>
                          </span>
                          <span className={`w-14 shrink-0 text-[9px] font-bold tracking-[0.1em] uppercase ${impactText[ev.impact]}`}>{ev.impact}</span>
                          <span className="flex-1 min-w-0 truncate text-[13px] text-fg">{ev.title}</span>
                          <span className="hidden md:flex items-center gap-3 text-[11.5px] numeric shrink-0">
                            <span className="w-16 text-right text-fg-3">{ev.previous ?? '–'}</span>
                            <span className="w-16 text-right text-fg-2">{ev.forecast ?? '–'}</span>
                            <span className={`w-16 text-right font-semibold ${fresh ? (dir === 'up' ? 'flash-profit' : dir === 'down' ? 'flash-loss' : '') : ''} ${dir === 'up' ? 'text-profit' : dir === 'down' ? 'text-loss' : 'text-fg'}`}>
                              {ev.actual ?? '–'}{dir === 'up' ? ' ▲' : dir === 'down' ? ' ▼' : ''}
                            </span>
                          </span>
                          <span className="w-14 shrink-0 flex items-center justify-end gap-1">
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={e => { e.stopPropagation(); void onWatch(ev); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); void onWatch(ev); } }}
                              aria-label={ev.watched ? 'Unwatch' : 'Watch'}
                              data-testid="cal-watch"
                              className="p-1"
                            >
                              <Star size={14} weight={ev.watched ? 'fill' : 'regular'} className={ev.watched ? 'text-warning' : 'text-fg-3 hover:text-fg'} />
                            </span>
                            <CaretDown size={12} className={`text-fg-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                          </span>
                        </button>
                        {isOpen && (
                          <div className="border-t border-border-soft bg-app/40 px-4 py-3 text-[12px]">
                            <div className="md:hidden grid grid-cols-3 gap-3 mb-2">
                              <div><div className="text-[9px] uppercase text-fg-3">Previous</div><span className="numeric text-fg-2">{ev.previous ?? '–'}</span></div>
                              <div><div className="text-[9px] uppercase text-fg-3">Forecast</div><span className="numeric text-fg-2">{ev.forecast ?? '–'}</span></div>
                              <div><div className="text-[9px] uppercase text-fg-3">Actual</div><span className="numeric text-fg">{ev.actual ?? '–'}</span></div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-fg-3">
                              <span>{flag(ev.country)} {ev.currency} · {ev.impact} impact</span>
                              {ev.category && <span>Category: <span className="text-fg-2">{ev.category}</span></span>}
                              <span>{new Date(ev.eventTime).toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
              <p className="text-center text-[9px] tracking-[0.2em] text-fg-3 mt-4 pb-2">
                TIMES SHOWN IN YOUR LOCAL TIMEZONE · DATA FOR INFORMATION ONLY
              </p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
