'use client';

import { useMemo } from 'react';
import type { EquityPoint } from '@/lib/api';

// Compact "underwater" drawdown chart: equity minus its running peak (≤ 0),
// drawn as a red area from the zero line down. Derived from the equity curve,
// so it stays consistent with the equity chart and the date range.
export default function DrawdownChart({ equityCurve, height = 120 }: { equityCurve: EquityPoint[]; height?: number }) {
  const { path, area, minDd, hasData } = useMemo(() => {
    const pts = equityCurve.filter(p => p.time);
    if (pts.length < 2) return { path: '', area: '', minDd: 0, hasData: false };

    let peak = -Infinity;
    const dd = pts.map(p => {
      peak = Math.max(peak, p.equity);
      return p.equity - peak; // ≤ 0
    });
    const minDd = Math.min(...dd, -1);

    const W = 400, H = height;
    const PAD = { top: 6, right: 6, bottom: 6, left: 6 };
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const toX = (i: number) => PAD.left + (i / (dd.length - 1)) * innerW;
    const toY = (v: number) => PAD.top + (v / minDd) * innerH; // v=0 → top, v=minDd → bottom

    const line = dd.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');
    const areaPath = `${line} L ${toX(dd.length - 1).toFixed(1)} ${PAD.top} L ${toX(0).toFixed(1)} ${PAD.top} Z`;
    return { path: line, area: areaPath, minDd, hasData: true };
  }, [equityCurve, height]);

  if (!hasData) return <div className="flex items-center justify-center text-fg-3 text-[11px]" style={{ height }}>No drawdown yet.</div>;

  return (
    <svg viewBox={`0 0 400 ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }} data-testid="drawdown-chart">
      <defs>
        <linearGradient id="ddFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#FF3B30" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#FF3B30" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1="6" x2="394" y1="6" y2="6" stroke="#2A2A2A" strokeDasharray="2 4" />
      <path d={area} fill="url(#ddFill)" className="fade-in" style={{ ['--fade-dur' as string]: '900ms', ['--fade-delay' as string]: '250ms' }} />
      <path d={path} fill="none" stroke="#FF3B30" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" pathLength={1} className="draw-in" />
    </svg>
  );
}
