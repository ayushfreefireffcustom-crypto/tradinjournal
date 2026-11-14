'use client';

// Small shared pieces for the macro overview: measured width (so SVG text stays
// at its real 11/13 px instead of scaling), sparkline, section head, AI label.
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/** Content-box width of an element, tracked with ResizeObserver. */
export function useWidth<T extends HTMLElement>(fallback = 0): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setW(Math.floor(el.getBoundingClientRect().width));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) =>
  d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

export const pt = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;

export function Spark({ values, w, h = 32, tone = 'ink', dot = true, label }: {
  values: number[];
  w: number;
  h?: number;
  tone?: 'ink' | 'pos' | 'neg';
  dot?: boolean;
  label?: string;
}) {
  if (values.length < 2 || w < 10) return <svg width={w} height={h} aria-hidden className="mo-sp" />;
  const pad = 3;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const X = lin(0, values.length - 1, pad, w - pad - (dot ? 3 : 0));
  const Y = lin(mn, mx === mn ? mn + 1 : mx, h - pad, pad);
  const d = 'M' + values.map((v, i) => pt(X(i), Y(v))).join('L');
  const lx = X(values.length - 1);
  const ly = Y(values[values.length - 1]!);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={`mo-sp mo-sp--${tone}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={d} className="mo-sp-l" />
      {dot && <circle cx={lx} cy={ly} r={2.75} className="mo-sp-d" />}
    </svg>
  );
}

/** "TRADELOGS AI · <detail>". `detail` must be built from the data (counts, sources), never typed in. */
export function AiLabel({ detail }: { detail: string }) {
  return (
    <span className="mo-ai"><b>TRADElogs AI</b> · <span className="m">{detail}</span></span>
  );
}

export function AiLine({ text, detail }: { text: string; detail: string }) {
  return (
    <p className="mo-ail"><AiLabel detail={detail} /><span className="mo-ailt">{text}</span></p>
  );
}

export function SecHead({ title, sub, est, right, id }: { title: string; sub?: ReactNode; est?: boolean; right?: ReactNode; id?: string }) {
  return (
    <div className="mo-sh">
      <h2 id={id}>{title}</h2>
      {est && <span className="mo-est">Estimated</span>}
      {sub && <span className="mo-sh-s">{sub}</span>}
      {right && <div className="mo-sh-r">{right}</div>}
    </div>
  );
}

/** Quiet state for a block whose data isn't there. */
export function Quiet({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="mo-quiet" role="status">
      <span>{children}</span>
      {onRetry && <button type="button" className="mo-retry" onClick={onRetry}>Retry</button>}
    </div>
  );
}
