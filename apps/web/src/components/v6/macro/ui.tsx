'use client';

// Shared pieces for the v6 macro pages: bias tags, meters, sparklines, line icons
// and the group icon set that replaces the old unicode glyphs.
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { GroupIconName } from '@/lib/macro-meta';
import '@/styles/v6/macro.css';

export type Tone = 'bull' | 'bear' | 'neutral';

export const toneWord = (t: Tone) => (t === 'bull' ? 'Bullish' : t === 'bear' ? 'Bearish' : 'Neutral');
export const toneTag = (t: Tone) => (t === 'bull' ? 'x-tag x-tag--g' : t === 'bear' ? 'x-tag x-tag--r' : 'x-tag');
export const toneText = (t: Tone) => (t === 'bull' ? 'pos' : t === 'bear' ? 'neg' : '');

/** "STRONG_BULLISH" → "Strong bullish". */
export function sentence(s: string): string {
  const t = s.replace(/_/g, ' ').trim().toLowerCase();
  return t ? t[0]!.toUpperCase() + t.slice(1) : t;
}

/** Group names read in sentence case but keep acronyms. */
export function groupTitle(g: string): string {
  return g === 'FX' ? 'FX' : sentence(g);
}

export function BiasTag({ tone, label }: { tone: Tone; label?: string }) {
  return <span className={toneTag(tone)}>{label ? sentence(label) : toneWord(tone)}</span>;
}

/** Long / short / neutral lean from a 0–100 score. */
export function LeanTag({ score }: { score: number }) {
  if (score >= 55) return <span className="x-side x-side--long"><IArrowUR />Long</span>;
  if (score <= 45) return <span className="x-side x-side--short"><IArrowDR />Short</span>;
  return <span className="x-tag">Neutral</span>;
}

/** Bipolar meter centred at 50: fills right for bullish, left for bearish. */
export function Meter({ score, tone }: { score: number; tone: Tone }) {
  const s = Math.max(0, Math.min(100, score));
  return (
    <span className={`mc-meter ${tone}`} aria-hidden>
      <i style={{ left: `${Math.min(s, 50)}%`, width: `${Math.abs(s - 50)}%` }} />
    </span>
  );
}

/** 0–100 track with the 45–55 neutral band and a marker. */
export function ScoreTrack({ score, tone }: { score: number; tone: Tone }) {
  return (
    <span className={`mc-trk ${tone}`} aria-hidden>
      <i style={{ left: `${Math.max(2, Math.min(98, score))}%` }} />
    </span>
  );
}

/** Small decorative sparkline; colour follows the given tone or net direction. */
export function Spark({ values, tone, width = 64, height = 22, fluid = false, area = false }: {
  values: number[]; tone?: Tone; width?: number; height?: number; fluid?: boolean; area?: boolean;
}) {
  const clean = values.filter(v => Number.isFinite(v));
  if (clean.length < 2) return <span className="mc-spark-empty" style={fluid ? undefined : { width, height }} aria-hidden />;
  const mn = Math.min(...clean), mx = Math.max(...clean), sp = mx - mn || 1;
  const pad = 2;
  const x = (i: number) => pad + (i / (clean.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (height - pad * 2) * (1 - (v - mn) / sp);
  const d = clean.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const t: Tone = tone ?? (clean[clean.length - 1]! >= clean[0]! ? 'bull' : 'bear');
  const col = t === 'bull' ? 'var(--g)' : t === 'bear' ? 'var(--r)' : 'var(--mut)';
  return (
    <svg className={`mc-spark ${fluid ? 'fluid' : ''}`} width={fluid ? undefined : width} height={fluid ? undefined : height}
      viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      {area && <path d={`${d} L${x(clean.length - 1)} ${height} L${x(0)} ${height}Z`} fill={col} fillOpacity=".1" />}
      <path d={d} fill="none" stroke={col} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Track an element's content-box size. */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      setSize(s => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Section heading above a panel's cards. */
export function PanelHead({ title, eyebrow, right, lead }: { title: string; eyebrow?: string; right?: ReactNode; lead?: ReactNode }) {
  return (
    <header className="mc-ph">
      <div className="mc-ph-t">
        <div>
          {eyebrow && <span className="mc-ph-e">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        {right && <div className="mc-ph-r">{right}</div>}
      </div>
      {lead && <p>{lead}</p>}
    </header>
  );
}

// ─── icons ───────────────────────────────────────────────────────────────────

type IP = { size?: number; className?: string };
const svg = (size: number, className: string | undefined, children: ReactNode, sw = 1.7) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
);
export const ISearch = ({ size = 15, className }: IP) => svg(size, className, <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const IRefresh = ({ size = 15, className }: IP) => svg(size, className, <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20v-4h-4" /></>);
export const IChevronR = ({ size = 14, className }: IP) => svg(size, className, <path d="m9 6 6 6-6 6" />);
export const IChevronL = ({ size = 14, className }: IP) => svg(size, className, <path d="m15 6-6 6 6 6" />);
export const IChevronD = ({ size = 14, className }: IP) => svg(size, className, <path d="m6 9 6 6 6-6" />);
export const IClose = ({ size = 18, className }: IP) => svg(size, className, <path d="M6 6l12 12M18 6 6 18" />);
export const ILock = ({ size = 22, className }: IP) => svg(size, className, <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>);
export const INote = ({ size = 22, className }: IP) => svg(size, className, <><path d="M5 4h10l4 4v12H5z" /><path d="M9 12h6M9 16h4" /></>);
export const ICheck = ({ size = 15, className }: IP) => svg(size, className, <path d="m5 12.5 4.5 4.5L19 7.5" />, 1.9);
export const IExt = ({ size = 13, className }: IP) => svg(size, className, <><path d="M14 5h5v5" /><path d="M19 5 11 13" /><path d="M18 14v5H5V6h5" /></>);
export const ISend = ({ size = 16, className }: IP) => svg(size, className, <><path d="M4 12 20 4l-6 16-3-7z" /><path d="m11 13 9-9" /></>);
export const ISpark = ({ size = 20, className }: IP) => svg(size, className, <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M6.5 17.5 9 15M15 9l2.5-2.5" />);
export const IArrowUR = ({ size = 12, className }: IP) => svg(size, className, <path d="M7 17 17 7M9 7h8v8" />, 2);
export const IArrowDR = ({ size = 12, className }: IP) => svg(size, className, <path d="M7 7l10 10M17 9v8H9" />, 2);
export const IInfo = ({ size = 14, className }: IP) => svg(size, className, <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 7.6v.2" strokeWidth="2.2" /></>, 1.6);
export const ICalendar = ({ size = 22, className }: IP) => svg(size, className, <><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M4 10h16M9 3v4M15 3v4" /></>);
export const INews = ({ size = 22, className }: IP) => svg(size, className, <><rect x="4" y="5" width="16" height="14" rx="2.5" /><path d="M8 9h8M8 13h8M8 16h5" /></>);

// Built lazily so importing this module never evaluates JSX (keeps plain unit tests happy).
const groupPaths = (): Record<GroupIconName, ReactNode> => ({
  inflation: <><path d="M4 18 10 12l3 3 7-8" /><path d="M15 7h5v5" /></>,
  growth: <><path d="M4 20h16" /><path d="M7 16v-4M12 16V8M17 16v-7" /></>,
  labor: <><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19a6.5 6.5 0 0 1 13 0" /></>,
  rates: <path d="M3 15c3 0 3-6 6-6s3 6 6 6 3-6 6-6" />,
  bank: <><path d="M4 9.5 12 5l8 4.5" /><path d="M6 10v7M10 10v7M14 10v7M18 10v7M4 19.5h16" /></>,
  liquidity: <><path d="M12 4s5.5 6 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10 12 4 12 4Z" /></>,
  risk: <><path d="M12 4 21 19H3z" /><path d="M12 10v4M12 16.8v.2" /></>,
  positioning: <><path d="M8 4v16M8 4 4.5 7.5M8 4l3.5 3.5" /><path d="M16 20V4M16 20l-3.5-3.5M16 20l3.5-3.5" /></>,
  fx: <><circle cx="12" cy="12" r="8.5" /><path d="M14.8 9.2c-.5-1-1.5-1.5-2.8-1.5-1.6 0-2.7.8-2.7 2.1 0 2.9 5.7 1.6 5.7 4.4 0 1.3-1.2 2.1-2.9 2.1-1.4 0-2.5-.6-3-1.6M12 6v1.7M12 16.3V18" /></>,
  other: <><circle cx="6" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="18" cy="12" r="1" /></>,
});

export function GroupIcon({ name, size = 15 }: { name: GroupIconName; size?: number }) {
  const paths = groupPaths();
  return <span className="mc-gi">{svg(size, undefined, paths[name] ?? paths.other, 1.6)}</span>;
}

/** Current app theme, kept in sync when the frame toggles it. */
export function useDocTheme(): 'dark' | 'light' {
  const [t, setT] = useState<'dark' | 'light'>('dark');
  useLayoutEffect(() => {
    const el = document.documentElement;
    const read = () => setT(el.dataset.theme === 'light' ? 'light' : 'dark');
    read();
    const mo = new MutationObserver(read);
    mo.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return t;
}

/** Long / short chip (same look as the desk's SideChip, without pulling in the desk module). */
export function SideChip({ dir }: { dir: 'LONG' | 'SHORT' }) {
  const long = dir === 'LONG';
  return <span className={`x-side ${long ? 'x-side--long' : 'x-side--short'}`}>{long ? <IArrowUR /> : <IArrowDR />}{long ? 'Long' : 'Short'}</span>;
}
