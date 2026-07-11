'use client';

import { useMemo, useState } from 'react';
import type { Trade } from '@/lib/api';
import { scatterPoints, type ScatterPoint } from '@/lib/stats';

type XAxis = 'hour' | 'duration';

function fmtDur(s: number) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Each closed trade as a dot: x = time-of-day (UTC open hour) or hold duration,
// y = net P&L, colour by win/loss, radius ~ volume. Reveals when/what pays off.
export default function ScatterChart({ trades, height = 240 }: { trades: Trade[]; height?: number }) {
  const [xAxis, setXAxis] = useState<XAxis>('hour');
  const [hover, setHover] = useState<{ leftPx: number; topPx: number; p: ScatterPoint } | null>(null);
  const pts = useMemo(() => scatterPoints(trades), [trades]);

  if (pts.length === 0) {
    return <div className="flex items-center justify-center text-fg-3 text-[12px]" style={{ height }}>No closed trades to plot.</div>;
  }

  const W = 1000, H = height;
  const PAD = { top: 14, right: 16, bottom: 30, left: 46 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const xMax = xAxis === 'hour' ? 24 : Math.max(...pts.map(p => p.durationSecs), 1);
  const xVal = (p: ScatterPoint) => (xAxis === 'hour' ? p.hour : p.durationSecs);
  const absY = Math.max(...pts.map(p => Math.abs(p.netPnl)), 1);
  const volMax = Math.max(...pts.map(p => p.volume), 0.01);

  const toX = (v: number) => PAD.left + (v / xMax) * innerW;
  const toY = (v: number) => PAD.top + innerH / 2 - (v / absY) * (innerH / 2);
  const rOf = (vol: number) => 2.5 + (vol / volMax) * 5;
  const midY = toY(0);

  const xTicks = xAxis === 'hour'
    ? [0, 4, 8, 12, 16, 20].map(h => ({ v: h, label: `${String(h).padStart(2, '0')}h` }))
    : [0, 0.25, 0.5, 0.75, 1].map(f => ({ v: f * xMax, label: fmtDur(f * xMax) }));

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[9px] tracking-widest text-fg-3 uppercase numeric">{pts.length} trades</span>
        <div className="seg">
          {(['hour', 'duration'] as const).map(x => (
            <button key={x} onClick={() => setXAxis(x)} data-active={xAxis === x} data-testid={`scatter-x-${x}`} className="seg-item text-[10px]">
              {x === 'hour' ? 'BY HOUR' : 'BY DURATION'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full" style={{ height }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }} data-testid="scatter-chart">
          {/* zero P&L axis */}
          <line x1={PAD.left} x2={W - PAD.right} y1={midY} y2={midY} stroke="#4A4A4A" strokeWidth="1" />
          {/* x grid + labels */}
          {xTicks.map(t => (
            <g key={t.v}>
              <line x1={toX(t.v)} x2={toX(t.v)} y1={PAD.top} y2={PAD.top + innerH} stroke="#1A1A1A" />
              <text x={toX(t.v)} y={H - 10} textAnchor="middle" fontSize="10" style={{ fontFamily: 'var(--font-mono)' }} fill="#71717A">{t.label}</text>
            </g>
          ))}
          {/* y labels */}
          <text x={PAD.left - 6} y={toY(absY) + 3} textAnchor="end" fontSize="9" style={{ fontFamily: 'var(--font-mono)' }} fill="#71717A">+${absY.toFixed(0)}</text>
          <text x={PAD.left - 6} y={toY(-absY) + 3} textAnchor="end" fontSize="9" style={{ fontFamily: 'var(--font-mono)' }} fill="#71717A">-${absY.toFixed(0)}</text>

          {pts.map((p, i) => (
            <circle
              key={i}
              cx={toX(xVal(p))} cy={toY(p.netPnl)} r={rOf(p.volume)}
              fill={p.netPnl >= 0 ? '#00C566' : '#FF3B30'}
              fillOpacity={hover && hover.p === p ? 0.95 : 0.45}
              stroke={p.netPnl >= 0 ? '#00C566' : '#FF3B30'} strokeWidth={hover && hover.p === p ? 1.2 : 0}
              className="fade-in cursor-pointer"
              style={{ ['--fade-delay' as string]: `${Math.min(i * 6, 500)}ms` }}
              onPointerEnter={() => setHover({ leftPx: (toX(xVal(p)) / W) * 100, topPx: (toY(p.netPnl) / H) * 100, p })}
              onPointerLeave={() => setHover(null)}
            />
          ))}
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded-md border border-border-soft bg-surface/95 backdrop-blur px-2.5 py-1.5 shadow-[var(--shadow-card)] whitespace-nowrap"
            style={{ left: `${hover.leftPx}%`, top: `${hover.topPx}%`, transform: `translate(${hover.leftPx > 60 ? 'calc(-100% - 10px)' : '10px'}, -50%)` }}
            data-testid="scatter-tooltip"
          >
            <div className="text-[11px] font-semibold tracking-tight">{hover.p.symbol} <span className={hover.p.direction === 'LONG' ? 'text-profit' : 'text-loss'}>{hover.p.direction}</span></div>
            <div className={`text-[12px] numeric ${hover.p.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{hover.p.netPnl >= 0 ? '+' : ''}${hover.p.netPnl.toFixed(2)}</div>
            <div className="text-[9px] tracking-widest text-fg-3 uppercase numeric">{String(hover.p.hour).padStart(2, '0')}:00 · {fmtDur(hover.p.durationSecs)} · {hover.p.volume.toFixed(2)} lots</div>
          </div>
        )}
      </div>
    </div>
  );
}
