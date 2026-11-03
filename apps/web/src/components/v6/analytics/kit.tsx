'use client';

// Building blocks for the v6 analytics cards: card chrome with a drag handle
// slot, a sortable wrapper, container measuring, axis ticks and the tooltip.
import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import '@/styles/v6/desk.css';
import '@/styles/v6/analytics.css';
import InfoTip from '@/components/v6/ui/info-tip';
import { METRIC_HELP, type MetricKey } from '@/lib/metric-help';
import Unknown from '@/components/v6/ui/unknown';

export const MONO = { fontFamily: 'var(--mono)' } as const;

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

export function niceStep(range: number, count: number) {
  const raw = range / Math.max(1, count);
  if (raw <= 0 || !Number.isFinite(raw)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Round axis ticks that cover [min, max]. */
export function ticks(min: number, max: number, count = 4): number[] {
  if (min === max) { min -= 1; max += 1; }
  const step = niceStep(max - min, count);
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.abs(v) < step / 1e6 ? 0 : v);
  return out;
}

// ─── drag handle (supplied by SortableCard, rendered inside the card header) ──

type HandleProps = { id: string; attributes: Record<string, unknown>; listeners: Record<string, unknown> | undefined };
const HandleCtx = createContext<HandleProps | null>(null);

function DragHandle() {
  const h = useContext(HandleCtx);
  if (!h) return null;
  return (
    <button {...h.attributes} {...h.listeners} className="an-handle" aria-label="Drag to reorder" data-testid={`drag-${h.id}`}>
      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
        <circle cx="2" cy="2" r="1.3" /><circle cx="8" cy="2" r="1.3" /><circle cx="2" cy="7" r="1.3" />
        <circle cx="8" cy="7" r="1.3" /><circle cx="2" cy="12" r="1.3" /><circle cx="8" cy="12" r="1.3" />
      </svg>
    </button>
  );
}

/** Wraps an analytics card so it can be dragged by its header handle to reorder. */
export function SortableCard({ id, span = 12, className = '', children }: { id: string; span?: number; className?: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 20 : undefined, '--span': span } as CSSProperties;
  return (
    <div ref={setNodeRef} style={style} data-testid={`sortable-${id}`} className={`an-cell an-span ${className} ${isDragging ? 'is-drag' : ''}`}>
      <HandleCtx.Provider value={{ id, attributes: attributes as unknown as Record<string, unknown>, listeners }}>{children}</HandleCtx.Provider>
    </div>
  );
}

/** Card chrome shared by every analytics block. */
export function ACard({ title, sub, right, children, className = '', testId }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={`x-card an-card ${className}`} data-testid={testId}>
      <div className="x-ch">
        <h2>{title}</h2>
        {sub && <span className="x-sub">{sub}</span>}
        <div className="x-r">{right}<DragHandle /></div>
      </div>
      {children}
    </section>
  );
}

export function Empty({ children, h }: { children: ReactNode; h?: number }) {
  return <div className="an-empty" style={h ? { minHeight: h } : undefined}>{children}</div>;
}

/** Chart tooltip, kept inside the chart box. */
export function Tip({ x, y, w, children, width = 160 }: { x: number; y: number; w: number; children: ReactNode; width?: number }) {
  const left = x + 12 + width > w ? Math.max(0, x - 12 - width) : x + 12;
  return <div className="dk-tip an-tip" style={{ left, top: Math.max(0, y) }}>{children}</div>;
}

/** Small row of labelled numbers under a chart. */
/** `why` explains a "—" value (QW.9). */
export function Facts({ items }: { items: { l: string; v: string; c?: string; h?: MetricKey; why?: string }[] }) {
  return (
    <div className="x-strip an-facts" style={{ ['--n' as string]: items.length }}>
      {items.map(t => <div key={t.l}><span>{t.l}{t.h && <InfoTip {...METRIC_HELP[t.h]} />}</span><b className={`m ${t.c ?? ''}`}>{t.v === '—' && t.why ? <Unknown why={t.why} /> : t.v}</b></div>)}
    </div>
  );
}
