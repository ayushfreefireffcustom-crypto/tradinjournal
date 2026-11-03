'use client';

// Small SVG charts for the options pages: lines (with hover readout, zero line
// and markers) and mirrored bars (calls up, puts down, by strike).
import { useEffect, useRef, useState, type ReactNode } from 'react';

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export interface LineSeries { key: string; label: string; color: string; points: Array<[number, number]>; dashed?: boolean; width?: number }
export interface Marker { x: number; label: string; color?: string }

const AXIS = 62;

/**
 * Where each marker's label goes: text centred on its line where it fits, in the
 * first row (12 px apart) where it doesn't overlap a label already placed, so
 * close markers (Index, Max pain, Gamma centre) stack instead of colliding.
 */
export function markerLabels(xs: number[], labels: string[], width: number): Array<{ x: number; y: number; anchor: 'start' | 'middle' | 'end' }> {
  const rows: Array<Array<[number, number]>> = [];
  return xs.map((x, k) => {
    const tw = labels[k]!.length * 5.8 + 6;
    const anchor = x > width - tw / 2 - 4 ? 'end' : x < tw / 2 + 4 ? 'start' : 'middle';
    const lx = anchor === 'end' ? x - tw : anchor === 'start' ? x : x - tw / 2;
    let r = 0;
    while (rows[r]?.some(([a, b]) => lx < b && lx + tw > a)) r++;
    (rows[r] ??= []).push([lx, lx + tw]);
    return { x: Math.min(width - 4, Math.max(4, x)), y: 12 + r * 12, anchor };
  });
}
export function LineChart({ series, height = 220, xFmt, yFmt, markers = [], zero = false, fillZero, testId, empty = 'No data yet', yDomain, onHoverX, cursorX, xLog = false }: {
  series: LineSeries[]; height?: number; xFmt: (x: number) => string; yFmt: (y: number) => string; markers?: Marker[]; zero?: boolean;
  /** Log-spaced x (days to expiry), so near expiries don't crowd the left edge. */
  xLog?: boolean;
  /** Shade a series green above zero and red below (payoff charts). */
  fillZero?: string; testId?: string; empty?: ReactNode; yDomain?: [number, number]; onHoverX?: (x: number | null) => void; cursorX?: number | null;
}) {
  const [ref, w] = useWidth();
  const [hx, setHx] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  if (!all.length) return <div ref={ref} className="op-empty x-muted" data-testid={testId}>{empty}</div>;
  const x0 = Math.min(...all.map((p) => p[0]));
  const x1 = Math.max(...all.map((p) => p[0]));
  let y0 = yDomain?.[0] ?? Math.min(...all.map((p) => p[1]));
  let y1 = yDomain?.[1] ?? Math.max(...all.map((p) => p[1]));
  if (zero) { y0 = Math.min(y0, 0); y1 = Math.max(y1, 0); }
  const pad = (y1 - y0) * 0.08 || Math.abs(y1) * 0.1 || 1;
  y0 -= pad; y1 += pad;
  const pw = Math.max(10, w - AXIS);
  const ph = height - 22;
  const tx = (x: number) => (xLog ? Math.log1p(Math.max(0, x)) : x);
  const ux = (t: number) => (xLog ? Math.expm1(t) : t);
  const X = (x: number) => (x1 === x0 ? pw / 2 : ((tx(x) - tx(x0)) / (tx(x1) - tx(x0))) * pw);
  const Y = (y: number) => 6 + ((y1 - y) / (y1 - y0)) * (ph - 12);
  const path = (pts: Array<[number, number]>) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const ticks = [0.1, 0.5, 0.9].map((f) => y0 + (y1 - y0) * f);
  // As many x labels as fit: date-time labels need ~150 px, numbers ~80.
  const nx = Math.max(2, Math.min(5, Math.floor(pw / (xFmt(x1).length > 9 ? 150 : 80))));
  const xt = Array.from({ length: nx }, (_, k) => ux(tx(x0) + (tx(x1) - tx(x0)) * (0.03 + (0.94 * k) / (nx - 1))));
  const nearest = (s: LineSeries, x: number) => s.points.reduce((a, p) => (Math.abs(p[0] - x) < Math.abs(a[0] - x) ? p : a), s.points[0]!);
  const shownX = cursorX ?? hx;
  const fill = fillZero ? series.find((s) => s.key === fillZero) : undefined;
  return (
    <div ref={ref} className="op-chart" data-testid={testId}>
      <div className="op-read m" aria-live="off">
        {shownX != null ? <>{xFmt(shownX)}{series.map((s) => s.points.length ? <span key={s.key} style={{ color: s.color }}> · {s.label} {yFmt(nearest(s, shownX)[1])}</span> : null)}</>
          : <span className="x-muted">{series.map((s) => s.label).join(' · ')}</span>}
      </div>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={series.map((s) => s.label).join(', ')}
          onPointerMove={(e) => { const b = e.currentTarget.getBoundingClientRect(); const px = e.clientX - b.left; if (px > pw) return; const x = ux(tx(x0) + (px / pw) * (tx(x1) - tx(x0))); setHx(x); onHoverX?.(x); }}
          onPointerLeave={() => { setHx(null); onHoverX?.(null); }}>
          {ticks.map((v, k) => <g key={k}><line x1={0} x2={pw} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" /><text x={pw + 6} y={Y(v) + 4} className="mk-pc-axis">{yFmt(v)}</text></g>)}
          {xt.map((v, k) => <text key={k} x={X(v)} y={height - 5} textAnchor={k === 0 ? 'start' : k === xt.length - 1 ? 'end' : 'middle'} className="mk-pc-axis">{xFmt(v)}</text>)}
          {zero && <line x1={0} x2={pw} y1={Y(0)} y2={Y(0)} stroke="var(--line-2)" />}
          {fill && fill.points.length > 1 && (
            <>
              <clipPath id={`up-${testId}`}><rect x={0} y={0} width={pw} height={Y(0)} /></clipPath>
              <clipPath id={`dn-${testId}`}><rect x={0} y={Y(0)} width={pw} height={Math.max(0, ph - Y(0))} /></clipPath>
              <path d={`${path(fill.points)}L${X(fill.points.at(-1)![0])},${Y(0)}L${X(fill.points[0]![0])},${Y(0)}Z`} fill="var(--g-soft)" clipPath={`url(#up-${testId})`} />
              <path d={`${path(fill.points)}L${X(fill.points.at(-1)![0])},${Y(0)}L${X(fill.points[0]![0])},${Y(0)}Z`} fill="var(--r-soft)" clipPath={`url(#dn-${testId})`} />
            </>
          )}
          {(() => { const at = markerLabels(markers.map((m) => X(m.x)), markers.map((m) => m.label), pw); return markers.map((m, k) => (
            <g key={k}>
              <line x1={X(m.x)} x2={X(m.x)} y1={4} y2={ph} stroke={m.color ?? 'var(--axis)'} strokeDasharray="3 3" />
              <text x={at[k]!.x} y={at[k]!.y} textAnchor={at[k]!.anchor} className="op-mk" fill={m.color ?? 'var(--mut)'}>{m.label}</text>
            </g>
          )); })()}
          {series.map((s) => <path key={s.key} d={path(s.points)} fill="none" stroke={s.color} strokeWidth={s.width ?? 1.6} strokeDasharray={s.dashed ? '5 4' : undefined} data-testid={testId ? `${testId}-${s.key}` : undefined} />)}
          {shownX != null && <line x1={X(shownX)} x2={X(shownX)} y1={4} y2={ph} stroke="var(--line-2)" pointerEvents="none" />}
        </svg>
      )}
    </div>
  );
}

/** Calls above the axis, puts below, one column per strike. */
export function MirrorBars({ rows, height = 220, markers = [], xFmt, yFmt, upLabel, downLabel, testId }: {
  rows: Array<{ x: number; up: number; down: number }>; height?: number; markers?: Marker[]; xFmt: (x: number) => string; yFmt: (y: number) => string; upLabel: string; downLabel: string; testId?: string;
}) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return <div ref={ref} className="op-empty x-muted" data-testid={testId}>No data yet</div>;
  const max = Math.max(1e-9, ...rows.map((r) => Math.max(r.up, r.down)));
  const pw = Math.max(10, w - 8);
  const mid = (height - 20) / 2;
  const bw = pw / rows.length;
  const xs = rows.map((r) => r.x);
  const X = (x: number) => {
    // Markers between strikes land proportionally between their columns.
    const i = xs.findIndex((v) => v >= x);
    if (i === 0) return bw / 2;
    if (i < 0) return (xs.length - 0.5) * bw;
    const a = xs[i - 1]!;
    const b = xs[i]!;
    return (i - 1 + (x - a) / (b - a)) * bw + bw / 2;
  };
  const step = Math.max(1, Math.ceil(rows.length / Math.max(2, Math.floor(pw / 70))));
  const h = rows[hover ?? -1];
  return (
    <div ref={ref} className="op-chart" data-testid={testId}>
      <div className="op-read m">{h ? <>{xFmt(h.x)} · <span className="pos">{upLabel} {yFmt(h.up)}</span> · <span className="neg">{downLabel} {yFmt(h.down)}</span></> : <span className="x-muted">{upLabel} above, {downLabel} below</span>}</div>
      {w > 0 && (
        <svg width={w} height={height} role="img" aria-label={`${upLabel} and ${downLabel} by strike`} onPointerLeave={() => setHover(null)}>
          <line x1={0} x2={pw} y1={mid} y2={mid} stroke="var(--line-2)" />
          {rows.map((r, i) => (
            <g key={r.x} onPointerEnter={() => setHover(i)}>
              <rect x={i * bw} y={0} width={bw} height={height - 20} fill="transparent" />
              <rect x={i * bw + bw * 0.15} y={mid - (r.up / max) * (mid - 4)} width={bw * 0.7} height={(r.up / max) * (mid - 4)} fill="var(--g)" opacity={hover === i ? 1 : 0.8} />
              <rect x={i * bw + bw * 0.15} y={mid} width={bw * 0.7} height={(r.down / max) * (mid - 4)} fill="var(--r)" opacity={hover === i ? 1 : 0.8} />
              {i % step === 0 && <text x={i * bw + bw / 2} y={height - 5} textAnchor="middle" className="mk-pc-axis">{xFmt(r.x)}</text>}
            </g>
          ))}
          {(() => { const at = markerLabels(markers.map((m) => X(m.x)), markers.map((m) => m.label), pw); return markers.map((m, k) => (
            <g key={k} pointerEvents="none">
              <line x1={X(m.x)} x2={X(m.x)} y1={2} y2={height - 20} stroke={m.color ?? 'var(--tx)'} strokeDasharray="3 3" />
              <text x={at[k]!.x} y={at[k]!.y} textAnchor={at[k]!.anchor} className="op-mk" fill={m.color ?? 'var(--tx)'}>{m.label}</text>
            </g>
          )); })()}
        </svg>
      )}
    </div>
  );
}
