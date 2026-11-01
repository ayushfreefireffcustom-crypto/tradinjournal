'use client';

// Equity curve with an optional baseline overlay and a drawdown strip.
import { useEffect, useRef, useState } from 'react';

export default function EquityChart({ equity, baseline, height = 180, drawdown = false, testId }: {
  equity: Array<{ t: number; equity: number }>;
  baseline?: Array<{ t: number; equity: number }> | null;
  height?: number;
  drawdown?: boolean;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth); return () => ro.disconnect(); }, []);
  const all = [...equity, ...(baseline ?? [])];
  if (!equity.length) return <div ref={ref} className="sb-eq-empty x-muted">No equity yet</div>;
  const t0 = Math.min(...all.map(p => p.t));
  const t1 = Math.max(...all.map(p => p.t));
  const lo = Math.min(...all.map(p => p.equity));
  const hi = Math.max(...all.map(p => p.equity));
  const ddH = drawdown ? 50 : 0;
  const h = height;
  const X = (t: number) => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * (w - 56));
  const Y = (v: number) => 6 + ((hi - v) / (hi - lo || 1)) * (h - ddH - 18);
  const line = (pts: typeof equity) => pts.map(p => `${X(p.t).toFixed(1)},${Y(p.equity).toFixed(1)}`).join(' ');
  let peak = -Infinity;
  const dd = equity.map(p => { peak = Math.max(peak, p.equity); return { t: p.t, dd: (p.equity / peak - 1) * 100 }; });
  const worst = Math.min(-0.0001, ...dd.map(d => d.dd));
  const up = equity[equity.length - 1]!.equity >= equity[0]!.equity;
  return (
    <div ref={ref} className="sb-eq" data-testid={testId}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Equity curve">
          {[lo, (lo + hi) / 2, hi].map(v => <g key={v}><line x1={0} x2={w - 56} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" /><text x={w - 52} y={Y(v) + 4} className="mk-pc-axis">{v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}</text></g>)}
          {baseline?.length ? <polyline fill="none" stroke="var(--mut)" strokeDasharray="4 3" strokeWidth={1.3} points={line(baseline)} data-testid="sb-eq-baseline" /> : null}
          <polyline fill="none" stroke={up ? 'var(--g)' : 'var(--r)'} strokeWidth={1.8} points={line(equity)} />
          {drawdown && (
            <g transform={`translate(0 ${h - ddH})`}>
              <polygon fill="var(--r-soft)" stroke="var(--r)" strokeWidth={1} points={`0,0 ${dd.map(d => `${X(d.t).toFixed(1)},${((d.dd / worst) * (ddH - 6)).toFixed(1)}`).join(' ')} ${X(dd[dd.length - 1]!.t).toFixed(1)},0`} />
              <text x={w - 52} y={ddH - 8} className="mk-pc-axis">{worst.toFixed(1)}%</text>
            </g>
          )}
        </svg>
      )}
    </div>
  );
}
