'use client';

// Economic-event detail modal. Shows the full event, its previous/forecast/actual
// with surprise coloring, a countdown for upcoming events, and — fetched from the
// detail endpoint — the provenance (which providers contributed the data).
import { useEffect, useMemo, useState } from 'react';
import { X, Star, Clock } from '@phosphor-icons/react';
import { api, type CalendarEvent, type CalendarEventDetail, type EventImpact } from '@/lib/api';

const impactPill: Record<EventImpact, string> = {
  HIGH: 'bg-loss/15 text-loss',
  MEDIUM: 'bg-warning/15 text-warning',
  LOW: 'bg-surface text-fg-3',
};

function flag(cc: string): string {
  const c = cc.toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '🏳️';
  return String.fromCodePoint(...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function surprise(actual: string | null, forecast: string | null): 'up' | 'down' | null {
  if (!actual || !forecast) return null;
  const a = parseFloat(actual.replace(/[^0-9.-]/g, ''));
  const f = parseFloat(forecast.replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(a) || Number.isNaN(f) || a === f) return null;
  return a > f ? 'up' : 'down';
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const full = d.toLocaleString(undefined, { weekday: 'long', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return full;
  const mins = Math.round(ms / 60_000);
  const cd = mins < 60 ? `in ${mins}m` : `in ${Math.floor(mins / 60)}h ${mins % 60}m`;
  return `${full} · ${cd}`;
}

/** Unique provider names from the detail's provenance JSON. */
function providers(sources: unknown): { names: string[]; conflict: boolean } {
  if (!sources || typeof sources !== 'object') return { names: [], conflict: false };
  const s = sources as { raw?: Array<{ source?: string }>; impactConflict?: boolean };
  const names = Array.isArray(s.raw) ? [...new Set(s.raw.map(r => r?.source).filter((x): x is string => !!x))] : [];
  return { names, conflict: !!s.impactConflict };
}

export default function EventModal({
  event,
  onClose,
  onToggleWatch,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onToggleWatch: (ev: CalendarEvent) => void;
}) {
  const [detail, setDetail] = useState<CalendarEventDetail | null>(null);
  const [watched, setWatched] = useState(event.watched);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    api.calendar.get(event.id).then(d => { if (alive) setDetail(d); }).catch(() => {});
    return () => { alive = false; };
  }, [event.id]);

  const dir = surprise(event.actual, event.forecast);
  const prov = useMemo(() => providers(detail?.sources), [detail]);

  const stat = (label: string, value: string | null, cls = 'text-fg') => (
    <div className="flex-1 rounded-[var(--radius-btn)] border border-border-soft bg-surface/40 px-3 py-2.5 text-center">
      <div className="text-[9px] tracking-[0.16em] uppercase text-fg-3">{label}</div>
      <div className={`text-[16px] font-semibold numeric mt-0.5 ${cls}`}>{value ?? '–'}</div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="event-modal">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-[var(--radius-card)] border border-border-strong bg-app shadow-2xl fade-up">
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{flag(event.country)}</span>
              <span className="text-[13px] font-semibold text-fg-2">{event.currency}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase ${impactPill[event.impact]}`}>{event.impact}</span>
            </div>
            <button onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 -mt-1 -mr-1 rounded-md border border-border-soft flex items-center justify-center text-fg-3 hover:text-fg hover:border-border-strong transition-colors">
              <X size={14} weight="bold" />
            </button>
          </div>

          <h2 className="font-display font-bold text-[18px] leading-snug tracking-tight text-fg mt-3">{event.title}</h2>
          <div className="flex items-center gap-1.5 text-[11.5px] text-fg-3 mt-1.5">
            <Clock size={12} /> {whenLabel(event.eventTime)}
          </div>

          <div className="flex gap-2 mt-4">
            {stat('Previous', event.previous)}
            {stat('Forecast', event.forecast)}
            {stat('Actual', event.actual ? `${event.actual}${dir === 'up' ? ' ▲' : dir === 'down' ? ' ▼' : ''}` : null, dir === 'up' ? 'text-profit' : dir === 'down' ? 'text-loss' : 'text-fg')}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-fg-3 mt-4">
            {event.category && <span>Category: <span className="text-fg-2">{event.category}</span></span>}
            {prov.names.length > 0 && <span>Data from: <span className="text-fg-2">{prov.names.join(', ')}</span></span>}
            {prov.conflict && <span className="text-warning">Sources disagreed on impact</span>}
          </div>

          <button
            onClick={() => { setWatched(w => !w); onToggleWatch(event); }}
            data-testid="event-modal-watch"
            className={`w-full justify-center mt-5 py-2.5 rounded-[var(--radius-btn)] btn ${watched ? 'btn-ghost' : 'btn-primary'}`}
          >
            <Star size={14} weight={watched ? 'fill' : 'regular'} className={watched ? 'text-warning' : ''} />
            {watched ? 'Watching — remove reminder' : 'Watch & remind me'}
          </button>
          <p className="text-center text-[9px] tracking-[0.18em] uppercase text-fg-3 mt-3">Time in your local timezone · data for information only</p>
        </div>
      </div>
    </div>
  );
}
