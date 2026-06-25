'use client';

import type { EquityPoint } from '@/lib/api';

interface Props {
  data: EquityPoint[];
  height?: number;
}

export default function EquityChart({ data, height = 160 }: Props) {
  if (data.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: 13, color: 'var(--text-subtle)' }}>No trade history to chart</p>
      </div>
    );
  }

  const W = 800;
  const H = height;
  const PAD = { top: 12, right: 16, bottom: 24, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = data.map(d => d.equity);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const toX = (i: number) => PAD.left + (i / (data.length - 1)) * innerW;
  const toY = (v: number) => PAD.top + innerH - ((v - minV) / range) * innerH;

  const pts = data.map((d, i) => `${toX(i)},${toY(d.equity)}`).join(' ');
  const pathD = `M ${pts.split(' ').join(' L ')}`;
  const areaD = `${pathD} L ${toX(data.length - 1)},${PAD.top + innerH} L ${toX(0)},${PAD.top + innerH} Z`;

  const lastVal = data[data.length - 1]!.equity;
  const firstVal = data[0]!.equity;
  const positive = lastVal >= firstVal;
  const color = positive ? 'var(--green)' : 'var(--red)';
  const areaColor = positive ? 'rgba(34,212,114,0.08)' : 'rgba(240,82,82,0.08)';

  // Y axis labels
  const yLabels = 4;
  const yTicks = Array.from({ length: yLabels + 1 }, (_, i) => minV + (range * i) / yLabels);

  // X axis labels (show up to 5 dates)
  const xStep = Math.max(1, Math.floor((data.length - 1) / 4));
  const xTicks = data.filter((_, i) => i % xStep === 0 || i === data.length - 1);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height, display: 'block' }}
      preserveAspectRatio="none"
    >
      {/* Grid lines */}
      {yTicks.map((v, i) => (
        <line
          key={i}
          x1={PAD.left} y1={toY(v)} x2={PAD.left + innerW} y2={toY(v)}
          stroke="var(--border)" strokeWidth="0.5"
        />
      ))}

      {/* Y axis labels */}
      {yTicks.map((v, i) => (
        <text key={i} x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fill="var(--text-subtle)" fontSize="9">
          {v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`}
        </text>
      ))}

      {/* Area fill */}
      <path d={areaD} fill={areaColor} />

      {/* Line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Dots at first and last */}
      <circle cx={toX(0)} cy={toY(firstVal)} r="2.5" fill={color} />
      <circle cx={toX(data.length - 1)} cy={toY(lastVal)} r="3" fill={color} />

      {/* X axis labels */}
      {xTicks.map((d, i) => {
        const idx = data.indexOf(d);
        const label = d.time ? new Date(d.time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'Start';
        const x = toX(idx);
        return (
          <text key={i} x={x} y={H - 4} textAnchor="middle" fill="var(--text-subtle)" fontSize="8.5">
            {label}
          </text>
        );
      })}
    </svg>
  );
}
