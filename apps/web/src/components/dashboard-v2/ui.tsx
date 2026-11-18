'use client';

// Building blocks for Dashboard v2: the widget card, the AI footer line and
// label, small toggles, on-chart callouts and a width hook for the SVG charts.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ChatCircleText } from '@phosphor-icons/react';
import Link from 'next/link';
import type { AiLine as AiLineT } from '@/lib/dashboard-v2-api';
import { fmtAi } from '@/lib/dashboard-v2-format';

/** Measured content width of an element (0 until mounted). */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.floor(el.getBoundingClientRect().width));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Small "TRADElogs AI" label: the coach's chat icon + text. */
export function AiMark({ short = false }: { short?: boolean }) {
  return <span className="d2-ai"><ChatCircleText size={14} aria-hidden />{short ? null : <span className="d2-ai-l">TRADElogs </span>}AI</span>;
}

/** One AI line in a widget footer: label + number, with an optional link. */
export function AiFoot({ line, link, href, onClick }: { line: AiLineT | null; link?: string; href?: string; onClick?: () => void }) {
  if (!line) return null;
  const v = fmtAi(line);
  return (
    <div className="d2-ail" data-ai>
      <AiMark />
      <span className="d2-ail-t">
        {line.text}{v && <> <span className={`d2-n ${line.fmt === 'money' ? 'mny' : ''} ${line.tone === 'up' ? 'up' : line.tone === 'dn' ? 'dn' : ''}`}>{v}</span></>}
        {line.suffix && (line.suffix.startsWith('/') ? line.suffix : <> {line.suffix}</>)}
      </span>
      {link && href && <Link href={href} className="d2-ail-a">{link}<ArrowRight size={11} /></Link>}
      {link && !href && onClick && <button type="button" className="d2-ail-a" onClick={onClick}>{link}<ArrowRight size={11} /></button>}
    </div>
  );
}

export function Widget({
  id, title, sub, tools, children, foot, span = 4, flush = false, className = '', onExplain,
}: {
  id: string; title: string; sub?: ReactNode; tools?: ReactNode; children: ReactNode; foot?: ReactNode;
  span?: 3 | 4 | 6 | 8 | 12; flush?: boolean; className?: string; onExplain?: () => void;
}) {
  return (
    <section className={`d2-card d2-w ${className}`} data-span={span} data-testid={`w-${id}`} aria-label={title}>
      <header className="d2-wh">
        <h2>{title}{sub ? <span> {sub}</span> : null}</h2>
        <div className="d2-wt">
          {tools}
          {onExplain && <button type="button" className="d2-ex" onClick={onExplain} data-ai aria-label={`Explain ${title}`}><ChatCircleText size={14} /><span>Explain</span></button>}
        </div>
      </header>
      <div className={`d2-wb${flush ? ' flush' : ''}`}>{children}</div>
      {foot}
    </section>
  );
}

export function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ v: T; label: string; disabled?: boolean; title?: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="d2-tg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.v} type="button" aria-pressed={value === o.v} className={value === o.v ? 'on' : ''} disabled={o.disabled} title={o.title} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

/** Compact empty state inside a widget. */
export function Empty({ title, note }: { title: string; note?: string }) {
  return <div className="d2-empty"><b>{title}</b>{note && <span>{note}</span>}</div>;
}

/** Signed amounts and figures in a note: "−$1,281" red, "+0.4R" green, "$853" or "36%" bold. */
const NOTE_TOKEN = /([−+-]?\$?\d[\d,.]*(?:[kKmM]|R|%|×)?)/;
function noteParts(text: string) {
  return text.split(NOTE_TOKEN).filter(Boolean).map((part, i) => {
    const signed = /^[−+-]\$?\d/.test(part);
    const figure = /^\$?\d[\d,.]*(?:[kKmM]|R|%|×)?$/.test(part) && /[$%R×]/.test(part);
    if (!signed && !figure) return <tspan key={i}>{part}</tspan>;
    const fill = part.startsWith('+') ? 'var(--d2-gt)' : signed ? 'var(--d2-rt)' : 'var(--tx)';
    return <tspan key={i} fontWeight={700} fill={fill}>{part}</tspan>;
  });
}

/** SVG note on a chart: one line in a small pill with a coloured edge, and an optional leader line. */
export function Callout({ x, y, text, w, lead, tone = 'dn', maxX }: { x: number; y: number; text: string; w?: number; lead?: [number, number]; tone?: 'dn' | 'up'; maxX: number }) {
  const tw = Math.min(w ?? calloutW(text), maxX);
  const bx = Math.max(0, Math.min(x, maxX - tw));
  const h = 30;
  const color = tone === 'dn' ? 'var(--d2-r)' : 'var(--d2-g)';
  return (
    <g data-ai className="d2-callout">
      {lead && <line x1={lead[0]} y1={lead[1]} x2={lead[0] < bx ? bx : lead[0] > bx + tw ? bx + tw : lead[0]} y2={lead[1] < y ? y : y + h} stroke={color} strokeOpacity={0.55} strokeWidth={1} strokeDasharray="2 3" />}
      <g transform={`translate(${bx.toFixed(1)},${y.toFixed(1)})`}>
        <rect className="d2-note-bg" width={tw} height={h} rx={10} />
        <rect x={8} y={8} width={3} height={14} rx={1.5} fill={color} />
        <text x={19} y={19.5} fontSize={13} fontWeight={500} fill="var(--tx)">{noteParts(text)}</text>
      </g>
    </g>
  );
}
/** Width a callout will take, so charts can place it. */
export const calloutW = (text: string) => Math.round(Math.max(96, text.length * 7.05 + 30));
