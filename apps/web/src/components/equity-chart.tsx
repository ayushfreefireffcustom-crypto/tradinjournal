'use client';

import type { EquityPoint } from '@/lib/api';

interface Props {
  data: EquityPoint[];
  height?: number;
  startingBalance?: number;
}

export default function EquityChart({ data, height = 220, startingBalance }: Props) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-fg-3 text-[12px]" style={{ height }}>
        No trade history to chart
      </div>
    );
  }

  const W = 1000;
  const H = height;
  const PAD = { top: 16, right: 20, bottom: 28, left: 60 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = data.map(d => d.equity);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const toX = (i: number) => PAD.left + (i / (data.length - 1)) * innerW;
  const toY = (v: number) => PAD.top + innerH - ((v - minV) / range) * innerH;

  const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d.equity)}`).join(' ');
  const areaD = `${pathD} L ${toX(data.length - 1)} ${PAD.top + innerH} L ${toX(0)} ${PAD.top + innerH} Z`;

  const lastVal = data[data.length - 1]!.equity;
  const firstVal = data[0]!.equity;
  const positive = lastVal >= firstVal;
  const color = positive ? '#00C566' : '#FF3B30';

  const yLabels = 4;
  const yTicks = Array.from({ length: yLabels + 1 }, (_, i) => minV + (range * i) / yLabels);
  const xStep = Math.max(1, Math.floor((data.length - 1) / 6));
  const xTicks = data.filter((_, i) => i % xStep === 0 || i === data.length - 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" data-testid="equity-chart" style={{ height }}>
      <defs>
        <linearGradient id="equityFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <line key={i} x1={PAD.left} y1={toY(v)} x2={PAD.left + innerW} y2={toY(v)} stroke="#1E1E1E" strokeDasharray="2 5" />
      ))}

      {yTicks.map((v, i) => (
        <text key={i} x={PAD.left - 8} y={toY(v) + 4} textAnchor="end" fill="#71717A" fontSize="10" style={{ fontFamily: 'var(--font-mono)' }}>
          {v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`}
        </text>
      ))}

      {/* Starting baseline */}
      {startingBalance != null && startingBalance >= minV && startingBalance <= maxV && (
        <line x1={PAD.left} y1={toY(startingBalance)} x2={PAD.left + innerW} y2={toY(startingBalance)} stroke="#4A4A4A" strokeDasharray="3 3" />
      )}

      <path d={areaD} fill="url(#equityFill)" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

      <circle cx={toX(data.length - 1)} cy={toY(lastVal)} r="4" fill={color} />
      <circle cx={toX(data.length - 1)} cy={toY(lastVal)} r="8" fill={color} opacity="0.18" />

      {xTicks.map((d, i) => {
        const idx = data.indexOf(d);
        const label = d.time ? new Date(d.time).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) : 'Start';
        return (
          <text key={i} x={toX(idx)} y={H - 8} textAnchor="middle" fill="#71717A" fontSize="9.5" style={{ fontFamily: 'var(--font-mono)' }}>
            {label.toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}
