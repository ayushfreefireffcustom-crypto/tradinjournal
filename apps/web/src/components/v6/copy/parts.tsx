'use client';

// Copy-trading pieces: the follows stream, the equity chart, grade and status
// badges and the monogram. The generic helpers (useLoad, usePoll, ago, Modal,
// ErrorCard) live in components/v6/ui.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Follow, RiskGrade } from '@/lib/copy-api';
import { usd } from '@/lib/copy-api';
import '@/styles/v6/kit.css';

const MONO = { fontFamily: 'var(--mono)' } as const;

/**
 * Refetch when the user's copy trading changes (C3.4): the API pings
 * /api/follows/stream. EventSource reconnects by itself; callers keep a slow
 * poll as a fallback in case the stream can't connect.
 */
export function useCopyStream(onChange: () => void, on = true) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    if (!on || typeof EventSource === 'undefined') return;
    const es = new EventSource(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/follows/stream`, { withCredentials: true });
    let t: ReturnType<typeof setTimeout> | null = null;
    // Several writes land together (order, position, follow); refetch once.
    es.onmessage = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => ref.current(), 300);
    };
    return () => { if (t) clearTimeout(t); es.close(); };
  }, [on]);
}

function useSize<T extends HTMLElement>() {
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

const compact = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 10_000 ? 0 : 1)}k` : `$${v.toFixed(0)}`);
const shortDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function EquityLine({ points, empty }: { points: Array<{ t: string; equityUsd: number }>; empty: string }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <div className="cp-chart cp-chart--empty" ref={ref}>{empty}</div>;
  const R = 52, L = 2, T = 10, B = h - 20;
  const vs = points.map(p => p.equityUsd);
  let mn = Math.min(...vs), mx = Math.max(...vs);
  if (mx - mn < 1) { mn -= 1; mx += 1; }
  const X = (i: number) => L + (i / (points.length - 1)) * (w - L - R);
  const Y = (v: number) => B - ((v - mn) / (mx - mn)) * (B - T);
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.equityUsd).toFixed(1)}`).join(' ');
  const up = vs[vs.length - 1]! >= vs[0]!;
  const col = up ? 'var(--g)' : 'var(--r)';
  const hp = hover != null ? points[hover] : null;
  const ticks = w > 520 ? [0, 0.25, 0.5, 0.75, 1] : [0, 1];
  return (
    <div className="cp-chart" ref={ref}
      onPointerMove={e => {
        const box = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - box.left - L) / (w - L - R)) * (points.length - 1));
        setHover(i >= 0 && i < points.length ? i : null);
      }}
      onPointerLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Equity from ${usd(vs[0])} to ${usd(vs[vs.length - 1])}`}>
          <defs><linearGradient id="cp-eq-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={col} stopOpacity=".22" /><stop offset="1" stopColor={col} stopOpacity="0" /></linearGradient></defs>
          {[0, 1 / 3, 2 / 3, 1].map(f => {
            const v = mn + (mx - mn) * f;
            return <g key={f}><line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" /><text x={w - R + 8} y={Y(v) + 3.5} fontSize="11" fill="var(--axis)" style={MONO}>{compact(v)}</text></g>;
          })}
          <path d={`${line} L${X(points.length - 1)} ${B} L${X(0)} ${B}Z`} fill="url(#cp-eq-g)" />
          <path d={line} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" />
          {ticks.map((f, k) => {
            const i = Math.round(f * (points.length - 1));
            return <text key={k} x={X(i)} y={h - 3} fontSize="11" fill="var(--axis)" textAnchor={k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}>{shortDate(points[i]!.t)}</text>;
          })}
          {hp && hover != null && (
            <g>
              <line x1={X(hover)} x2={X(hover)} y1={T} y2={B} stroke="var(--axis)" strokeOpacity=".6" strokeDasharray="3 3" />
              <circle cx={X(hover)} cy={Y(hp.equityUsd)} r="4.5" fill="var(--s1)" stroke={col} strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {hp && hover != null && (
        <div className="cp-tip" style={{ left: Math.min(Math.max(X(hover) + 12, 0), Math.max(0, w - 150)), top: Math.max(0, Y(hp.equityUsd) - 52) }}>
          <span>{new Date(hp.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
          <b className="m">{usd(hp.equityUsd)}</b>
        </div>
      )}
    </div>
  );
}

const GRADE_TEXT: Record<RiskGrade, string> = {
  A: 'Low risk: max drawdown under 10%',
  B: 'Moderate risk: max drawdown 10–20%',
  C: 'Elevated risk: max drawdown 20–30%',
  D: 'High risk: max drawdown 30–45%',
  E: 'Very high risk: max drawdown 45% or more',
};
export function GradeBadge({ grade }: { grade: RiskGrade | null }) {
  if (!grade) return <span className="cp-grade cp-grade--new" title="Graded after 7 days of history">New</span>;
  return <span className={`cp-grade cp-grade--${grade}`} title={GRADE_TEXT[grade]} aria-label={`Risk grade ${grade}. ${GRADE_TEXT[grade]}`}>{grade}</span>;
}

export function FollowStatusTag({ f }: { f: Pick<Follow, 'status' | 'pauseReason'> }) {
  if (f.status === 'ACTIVE') return <span className="x-tag x-tag--g"><i className="x-dot" />Copying</span>;
  if (f.status === 'PAUSED') return <span className="x-tag x-tag--r" title={f.pauseReason ?? undefined}><i className="x-dot x-dot--r" />Paused</span>;
  return <span className="x-tag"><i className="x-dot x-dot--off" />Stopped</span>;
}

export function Monogram({ name }: { name: string }) {
  const m = name.trim().split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase() || 'TL';
  return <span className="x-mk cp-mono" aria-hidden>{m}</span>;
}
