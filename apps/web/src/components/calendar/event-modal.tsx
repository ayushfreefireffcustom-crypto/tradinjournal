'use client';

// Economic-event detail modal. Design references: TradingView's event popup and
// Investing.com's event detail — lead with what the event IS, show the
// Previous → Forecast → Actual progression with a plain-English surprise read,
// and keep actions understated. Provenance is fetched from the detail endpoint.
import { useEffect, useMemo, useState } from 'react';
import { IClose } from '@/components/v3/icons';
import { api, type CalendarEvent, type CalendarEventDetail, type EventImpact } from '@/lib/api';

const impactMeta: Record<EventImpact, { pill: string; label: string; note: string }> = {
  HIGH: { pill: 'r', label: 'High impact', note: 'Often moves the market on release.' },
  MEDIUM: { pill: 'a', label: 'Medium impact', note: 'Can move the market.' },
  LOW: { pill: 'n', label: 'Low impact', note: 'Usually a limited reaction.' },
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
      if (a > f) return { arrow: '↑', cls: 'lg', text: 'Actual came in above forecast' };
      if (a < f) return { arrow: '↓', cls: 'sh', text: 'Actual came in below forecast' };
      return { arrow: '→', cls: 'mute', text: 'Actual in line with forecast' };
    }
    if (!released && f != null && p != null) {
      if (f > p) return { arrow: '↑', cls: 'mute', text: 'Forecast points higher than previous' };
      if (f < p) return { arrow: '↓', cls: 'mute', text: 'Forecast points lower than previous' };
      return { arrow: '→', cls: 'mute', text: 'Forecast unchanged from previous' };
    }
    return null;
  })();

  const heroCol = released ? 'actual' : 'forecast';
  const dir = event.actual && read?.cls === 'lg' ? 'up' : event.actual && read?.cls === 'sh' ? 'down' : null;

  const col = (key: string, label: string, value: string | null) => {
    const hero = key === heroCol;
    const tone = key === 'actual' && event.actual ? (dir === 'up' ? 'lg' : dir === 'down' ? 'sh' : '') : '';
    return <div className={`em-col ${hero ? 'hero' : ''}`}><span>{label}</span><b className={`num ${tone}`}>{value ?? '–'}</b></div>;
  };

  return (
    <div className="v3 v3-modal" role="dialog" aria-modal="true" aria-labelledby="em-t" data-testid="event-modal">
      <div className="v3-modal-bg" onClick={onClose} />
      <div className="v3-modal-card em-card">
        <div className="em-bd">
          <div className="em-top">
            <span className="em-cc"><span className="fl">{flag(event.country)}</span>{event.currency}</span>
            <span className={`v3-pill ${impact.pill}`}>{impact.label}</span>
            <button onClick={onClose} aria-label="Close" className="v3-modal-x" style={{ marginLeft: 'auto' }}><IClose size={16} /></button>
          </div>
          <h2 id="em-t">{event.title}</h2>
          {description && <p className="em-desc">{description}</p>}
          <div className="em-when">
            <span className="num">{new Date(event.eventTime).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            {countdown ? <span className="v3-pill v num">{countdown}</span> : <span className="v3-pill n">Released</span>}
          </div>
          <div className="em-cols">
            {col('previous', 'Previous', event.previous)}
            {col('forecast', 'Forecast', event.forecast)}
            {col('actual', 'Actual', event.actual)}
          </div>
          {read && <p className={`em-read ${read.cls}`}><b>{read.arrow}</b> {read.text}</p>}
          <p className="em-meta">{impact.note}{prov.names.length > 0 && <> · Source: {prov.names.join(' + ')}</>}{prov.conflict && <span className="am"> · Sources disagreed on impact</span>}</p>
          {released ? (
            <div className="em-released" data-testid="event-modal-released">Already released</div>
          ) : (
            <button onClick={() => { setWatched(w => !w); onToggleWatch(event); }} data-testid="event-modal-watch" className={`em-watch ${watched ? 'on' : ''}`} aria-pressed={watched}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill={watched ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z" /></svg>
              {watched ? 'Watching — you’ll get a reminder' : 'Watch & remind me'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
