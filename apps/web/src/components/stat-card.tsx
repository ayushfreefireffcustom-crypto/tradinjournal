'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import AnimatedNumber from './animated-number';

type Accent = 'profit' | 'loss' | 'warning' | 'neutral';

const accentClass: Record<Accent, string> = {
  profit: 'text-profit',
  loss: 'text-loss',
  warning: 'text-warning',
  neutral: 'text-fg',
};

const barColor: Record<'profit' | 'loss' | 'neutral', string> = {
  profit: '#00C566',
  loss: '#FF3B30',
  neutral: '#4A4A4A',
};

/**
 * Premium KPI card: uppercase sans label, big mono value that flashes in its
 * sign colour when it changes, optional sub-label and custom content (bars).
 */
export function StatCard({
  label, value, count, format, accent = 'neutral', sub, testId, spark, children,
}: {
  label: string;
  value: string;
  // When provided, the value counts up to `count` (formatted via `format`).
  count?: number;
  format?: (n: number) => string;
  accent?: Accent;
  sub?: string;
  testId?: string;
  // Optional trend sparkline shown under the value (e.g. cumulative P&L).
  spark?: number[];
  children?: ReactNode;
}) {
  const [flash, setFlash] = useState('');
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setFlash(accent === 'loss' ? 'flash-loss' : 'flash-profit');
      const t = setTimeout(() => setFlash(''), 460);
      return () => clearTimeout(t);
    }
  }, [value, accent]);

  const valueCls = `font-display font-black text-2xl sm:text-3xl tracking-tight mt-2 numeric ${accentClass[accent]} ${flash}`;

  return (
    <div className="tcard tcard-hover p-4 sm:p-5 flex flex-col" data-testid={testId}>
      <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{label}</div>
      {count != null && format ? (
        <AnimatedNumber value={count} format={format} className={valueCls} />
      ) : (
        <div className={valueCls}>{value}</div>
      )}
      {sub && <div className="text-[10px] text-fg-3 tracking-wide mt-1 numeric uppercase">{sub}</div>}
      {spark && spark.length > 1 && (
        <Sparkline data={spark} color={accent === 'loss' ? '#FF3B30' : accent === 'profit' ? '#00C566' : '#71717A'} />
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

/** Tiny inline trend line (no axes) for KPI cards. */
export function Sparkline({ data, color, height = 26 }: { data: number[]; color: string; height?: number }) {
  const W = 100, H = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const toX = (i: number) => (i / (data.length - 1)) * W;
  const toY = (v: number) => H - 2 - ((v - min) / range) * (H - 4);
  const d = data.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`).join(' ');
  const last = data[data.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2.5" style={{ height }} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="draw-in" style={{ ['--draw-dur' as string]: '900ms' }} />
      <circle cx={toX(data.length - 1)} cy={toY(last)} r="2" fill={color} className="fade-in" style={{ ['--fade-delay' as string]: '700ms' }} />
    </svg>
  );
}

/** A labelled set of mini progress bars (avg win/loss, long/short, etc.). */
export function TwinBars({ rows }: { rows: { label: string; value: string; pct: number; color: 'profit' | 'loss' | 'neutral' }[] }) {
  return (
    <div className="flex flex-col gap-2">
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2 text-[10px]">
          <span className="text-fg-3 tracking-widest uppercase w-6 shrink-0">{r.label}</span>
          <div className="kpi-bar flex-1 min-w-0">
            <div className="kpi-bar-fill" style={{ width: `${Math.max(2, Math.min(100, r.pct))}%`, background: barColor[r.color] }} />
          </div>
          <span className={`numeric shrink-0 ${r.color === 'loss' ? 'text-loss' : r.color === 'profit' ? 'text-profit' : 'text-fg-2'}`}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}
