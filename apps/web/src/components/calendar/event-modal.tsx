'use client';

// Economic-event detail modal. Design references: TradingView's event popup and
// Investing.com's event detail — lead with what the event IS, show the
// Previous → Forecast → Actual progression with a plain-English surprise read,
// and keep actions understated. Provenance is fetched from the detail endpoint.
import { useEffect, useMemo, useState } from 'react';
import { X, Star, Clock, TrendUp, TrendDown, Minus } from '@phosphor-icons/react';
import { api, type CalendarEvent, type CalendarEventDetail, type EventImpact } from '@/lib/api';

const impactMeta: Record<EventImpact, { pill: string; dot: string; note: string }> = {
  HIGH: { pill: 'bg-loss/15 text-loss', dot: 'bg-loss', note: 'High-impact — often moves the market on release.' },
  MEDIUM: { pill: 'bg-warning/15 text-warning', dot: 'bg-warning', note: 'Medium-impact — can move the market.' },
  LOW: { pill: 'bg-surface text-fg-3', dot: 'bg-border-strong', note: 'Low-impact — usually a limited reaction.' },
};

// Plain-English descriptions for common events (à la Investing.com's event blurbs).
const GLOSSARY: Array<[RegExp, string]> = [
  [/federal funds|fomc|fed /i, "The Fed's benchmark interest-rate decision — the single biggest driver of the US dollar."],
  [/non[-\s]?farm|nfp/i, 'Monthly change in US jobs excluding farming — a top-tier market mover.'],
  [/\bcpi\b|consumer price/i, 'Consumer Price Index — the headline inflation gauge central banks track.'],
  [/\bppi\b|producer price/i, 'Producer Price Index — wholesale inflation, often a lead for CPI.'],
  [/\bgdp\b|gross domestic/i, 'Gross Domestic Product — the broadest measure of economic growth.'],
  [/unemployment/i, 'Share of the labor force without a job — a key labor-market signal.'],
  [/retail sales/i, 'Consumer spending at retailers — a read on demand.'],
  [/\bpmi\b|purchasing managers/i, "Purchasing Managers' Index — a forward-looking activity survey (>50 = expansion)."],
  [/interest rate|bank rate|rate decision/i, "The central bank's benchmark interest-rate decision."],
  [/speaks|speech|press conference|testimony/i, 'Remarks from a central-bank official — watched closely for policy hints.'],
];

function flag(cc: string): string {
  const c = cc.toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '🏳️';
  return String.fromCodePoint(...[...c].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function num(s: string | null): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.eE+-]/g, ''));
  return Number.isNaN(n) ? null : n;
}

function providers(sources: unknown): { names: string[]; conflict: boolean } {
  if (!sources || typeof sources !== 'object') return { names: [], conflict: false };
  const s = sources as { raw?: Array<{ source?: string }>; impactConflict?: boolean };
  const names = Array.isArray(s.raw) ? [...new Set(s.raw.map(r => r?.source).filter((x): x is string => !!x))] : [];
  return { names, conflict: !!s.impactConflict };
}

function useNow(active: boolean): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, [active]);
  return Date.now();
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
  const now = useNow(true);

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

  const eventMs = new Date(event.eventTime).getTime();
  const released = !!event.actual || eventMs <= now;
  const impact = impactMeta[event.impact];
  const prov = useMemo(() => providers(detail?.sources), [detail]);
  const description = useMemo(() => GLOSSARY.find(([re]) => re.test(event.title))?.[1] ?? null, [event.title]);

  // Countdown for upcoming events.
  const countdown = (() => {
    const ms = eventMs - now;
    if (ms <= 0) return null;
    const mins = Math.round(ms / 60_000);
    if (mins < 60) return `in ${mins}m`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `in ${h}h ${mins % 60}m`;
    return `in ${Math.floor(h / 24)}d ${h % 24}h`;
  })();

  // Plain-English read: surprise vs forecast once released, else change vs previous.
  const read = (() => {
    const a = num(event.actual), f = num(event.forecast), p = num(event.previous);
    if (event.actual && a != null && f != null) {
      if (a > f) return { icon: TrendUp, cls: 'text-profit', text: 'Actual came in above forecast' };
      if (a < f) return { icon: TrendDown, cls: 'text-loss', text: 'Actual came in below forecast' };
      return { icon: Minus, cls: 'text-fg-3', text: 'Actual in line with forecast' };
    }
    if (!released && f != null && p != null) {
      if (f > p) return { icon: TrendUp, cls: 'text-profit', text: 'Forecast points higher than previous' };
      if (f < p) return { icon: TrendDown, cls: 'text-loss', text: 'Forecast points lower than previous' };
      return { icon: Minus, cls: 'text-fg-3', text: 'Forecast unchanged from previous' };
    }
    return null;
  })();

  const heroCol = released ? 'actual' : 'forecast';
  const dir = read?.cls === 'text-profit' ? 'up' : read?.cls === 'text-loss' ? 'down' : null;

  const col = (key: string, label: string, value: string | null) => {
    const hero = key === heroCol;
    const colored = key === 'actual' && event.actual ? (dir === 'up' ? 'text-profit' : dir === 'down' ? 'text-loss' : 'text-fg') : 'text-fg';
    return (
      <div className={`flex-1 px-3 py-3 text-center ${hero ? 'bg-surface/60' : ''}`}>
        <div className="text-[9px] tracking-[0.16em] uppercase text-fg-3">{label}</div>
        <div className={`text-[18px] font-semibold numeric mt-1 ${hero ? colored : 'text-fg-2'}`}>{value ?? '–'}</div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="event-modal">
      <button className="absolute inset-0 bg-black/65 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-[var(--radius-card)] border border-border-strong bg-app shadow-2xl fade-up">
        <div className={`h-1 w-full ${impact.dot}`} />
        <div className="p-5 sm:p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl leading-none">{flag(event.country)}</span>
              <span className="text-[13px] font-semibold text-fg-2">{event.currency}</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${impact.pill}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${impact.dot}`} /> {event.impact}
              </span>
            </div>
            <button onClick={onClose} aria-label="Close" className="shrink-0 w-7 h-7 -mt-0.5 -mr-1 rounded-md flex items-center justify-center text-fg-3 hover:text-fg hover:bg-surface transition-colors">
              <X size={15} weight="bold" />
            </button>
          </div>

          <h2 className="font-display font-bold text-[19px] leading-snug tracking-tight text-fg mt-3">{event.title}</h2>
          {description && <p className="text-[12.5px] text-fg-3 leading-relaxed mt-1.5">{description}</p>}

          {/* Time + countdown */}
          <div className="flex items-center gap-2 mt-3 text-[11.5px]">
            <span className="flex items-center gap-1.5 text-fg-3"><Clock size={12} /> {new Date(event.eventTime).toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            {countdown ? (
              <span className="px-2 py-0.5 rounded-full bg-profit/10 text-profit text-[10px] font-semibold tracking-wide numeric">{countdown}</span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-surface text-fg-3 text-[10px] font-semibold tracking-wide uppercase">Released</span>
            )}
          </div>

          {/* Previous → Forecast → Actual */}
          <div className="mt-4 rounded-[var(--radius-btn)] border border-border-soft overflow-hidden flex divide-x divide-border-soft">
            {col('previous', 'Previous', event.previous)}
            {col('forecast', 'Forecast', event.forecast)}
            {col('actual', 'Actual', event.actual)}
          </div>

          {/* Plain-English read */}
          {read && (
            <div className={`flex items-center gap-2 mt-3 text-[12px] ${read.cls}`}>
              <read.icon size={14} weight="bold" /> <span>{read.text}</span>
            </div>
          )}

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-4 pt-3 border-t border-border-soft text-[10.5px] text-fg-3">
            <span>{impact.note}</span>
            {prov.names.length > 0 && <span className="ml-auto">Source: <span className="text-fg-2">{prov.names.join(' + ')}</span></span>}
            {prov.conflict && <span className="w-full text-warning">Sources disagreed on the impact level.</span>}
          </div>

          {/* Watch toggle — understated, clearly a toggle */}
          <button
            onClick={() => { setWatched(w => !w); onToggleWatch(event); }}
            data-testid="event-modal-watch"
            className={`w-full flex items-center justify-center gap-2 mt-4 py-2.5 rounded-[var(--radius-btn)] text-[12px] font-semibold tracking-wide border transition-colors ${
              watched ? 'bg-warning/15 text-warning border-warning/40' : 'border-border-strong text-fg hover:border-profit/50 hover:text-profit'
            }`}
          >
            <Star size={14} weight={watched ? 'fill' : 'regular'} />
            {watched ? 'Watching — you’ll be reminded' : 'Watch & remind me'}
          </button>
        </div>
      </div>
    </div>
  );
}
