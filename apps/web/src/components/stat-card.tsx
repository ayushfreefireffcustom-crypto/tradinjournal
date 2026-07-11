'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

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
  label, value, accent = 'neutral', sub, testId, children,
}: {
  label: string;
  value: string;
  accent?: Accent;
  sub?: string;
  testId?: string;
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

  return (
    <div className="tcard tcard-hover p-4 sm:p-5 flex flex-col" data-testid={testId}>
      <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{label}</div>
      <div className={`font-display font-black text-2xl sm:text-3xl tracking-tight mt-2 numeric ${accentClass[accent]} ${flash}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-fg-3 tracking-wide mt-1 numeric uppercase">{sub}</div>}
      {children && <div className="mt-3">{children}</div>}
    </div>
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
