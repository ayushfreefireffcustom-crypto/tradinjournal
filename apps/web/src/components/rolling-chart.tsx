'use client';

import { useMemo } from 'react';
import type { Trade } from '@/lib/api';
import { rollingSeries } from '@/lib/stats';
import { useChartHover } from '@/hooks/use-chart-hover';
import ChartTooltip from './chart-tooltip';

// Rolling win-rate (%) and expectancy ($/trade) over a trailing window of closed
// trades — reveals whether the edge is improving or decaying over time.
export default function RollingChart({ trades, window = 20, height = 220 }: { trades: Trade[]; window?: number; height?: number }) {
  const series = useMemo(() => rollingSeries(trades, window), [trades, window]);
  const { ref, pos, hoverProps } = useChartHover<HTMLDivElement>();

  if (series.length < 2) {
    return <div className="flex items-center justify-center text-fg-3 text-[12px]" style={{ height }}>Need ≥ {window} closed trades to chart the rolling edge.</div>;
  }

  const W = 1000, H = height;
  const PAD = { top: 16, right: 16, bottom: 24, left: 16 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const exps = series.map(s => s.expectancy);
  const eMin = Math.min(0, ...exps), eMax = Math.max(0, ...exps);
  const eRange = eMax - eMin || 1;

  const toX = (i: number) => PAD.left + (i / (series.length - 1)) * innerW;
  const yWin = (v: number) => PAD.top + innerH - v * innerH;          // win-rate 0..1
  const yExp = (v: number) => PAD.top + innerH - ((v - eMin) / eRange) * innerH;

  const winPath = series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${yWin(s.winRate).toFixed(1)}`).join(' ');
  const expPath = series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${yExp(s.expectancy).toFixed(1)}`).join(' ');
  const zeroY = yExp(0);

  // Hover → nearest index
  let idx = -1;
  if (pos) {
    const plot = Math.max(0, Math.min(1, (pos.xFrac * W - PAD.left) / innerW));
    idx = Math.round(plot * (series.length - 1));
  }
  const hovered = idx >= 0 ? series[idx] : null;
  const tipLeft = idx >= 0 ? (toX(idx) / W) * 100 : 0;

  return (
    <div ref={ref} className="relative w-full" style={{ height }} {...hoverProps}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }} data-testid="rolling-chart">
        {/* 50% win-rate reference */}
        <line x1={PAD.left} x2={W - PAD.right} y1={yWin(0.5)} y2={yWin(0.5)} stroke="#2A2A2A" strokeDasharray="2 5" />
        {/* Expectancy zero line */}
        <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} stroke="#4A4A4A" strokeDasharray="3 3" />

        <path d={expPath} fill="none" stroke="#F5A623" strokeWidth="1.5" strokeLinejoin="round" pathLength={1} className="draw-in" />
        <path d={winPath} fill="none" stroke="#00C566" strokeWidth="1.5" strokeLinejoin="round" pathLength={1} className="draw-in" />

        {hovered && (
          <>
            <line x1={toX(idx)} x2={toX(idx)} y1={PAD.top} y2={PAD.top + innerH} stroke="#71717A" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
            <circle cx={toX(idx)} cy={yWin(hovered.winRate)} r="3.5" fill="#00C566" />
            <circle cx={toX(idx)} cy={yExp(hovered.expectancy)} r="3.5" fill="#F5A623" />
          </>
        )}
      </svg>

      {/* Legend */}
      <div className="absolute top-1 left-2 flex items-center gap-3 text-[9px] tracking-widest text-fg-3 uppercase">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#00C566' }} /> Win %</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#F5A623' }} /> Expectancy</span>
      </div>

      {hovered && (
        <ChartTooltip leftPct={tipLeft} testId="rolling-tooltip">
          <div className="text-[9px] tracking-widest text-fg-3 uppercase numeric">Trade #{hovered.i}</div>
          <div className="text-[11px] numeric text-profit">{(hovered.winRate * 100).toFixed(0)}% win</div>
          <div className={`text-[11px] numeric ${hovered.expectancy >= 0 ? 'text-profit' : 'text-loss'}`}>{hovered.expectancy >= 0 ? '+' : '-'}${Math.abs(hovered.expectancy).toFixed(0)}/trade</div>
        </ChartTooltip>
      )}
    </div>
  );
}
