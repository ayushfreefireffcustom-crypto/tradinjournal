'use client';

import { useState } from 'react';
import { ChartLine, Check } from '@phosphor-icons/react';

// klinecharts built-in indicators. Main-pane overlays and sub-pane oscillators.
const INDICATORS: { name: string; label: string }[] = [
  { name: 'MA', label: 'Moving Average' },
  { name: 'EMA', label: 'Exp. Moving Average' },
  { name: 'BOLL', label: 'Bollinger Bands' },
  { name: 'SAR', label: 'Parabolic SAR' },
  { name: 'VOL', label: 'Volume' },
  { name: 'MACD', label: 'MACD' },
  { name: 'RSI', label: 'RSI' },
  { name: 'KDJ', label: 'KDJ' },
];

export default function IndicatorMenu({
  onAdd,
  onClear,
}: {
  onAdd: (name: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Set<string>>(new Set());

  const toggle = (name: string) => {
    onAdd(name);
    setActive(prev => new Set(prev).add(name));
  };

  return (
    <div className="relative" data-testid="indicator-menu">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[10px] tracking-wide uppercase text-fg-2 border border-border-soft hover:text-fg hover:border-border-strong transition-colors"
      >
        <ChartLine size={13} weight="bold" /> Indicators
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-56 rounded-[var(--radius-card)] border border-border-strong bg-surface shadow-xl p-1">
            {INDICATORS.map(ind => (
              <button
                key={ind.name}
                onClick={() => toggle(ind.name)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded text-[12px] text-fg-2 hover:bg-surface-hover hover:text-fg transition-colors"
              >
                <span>{ind.label} <span className="text-fg-3 text-[10px] numeric">{ind.name}</span></span>
                {active.has(ind.name) && <Check size={12} weight="bold" className="text-profit" />}
              </button>
            ))}
            <div className="border-t border-border-soft mt-1 pt-1">
              <button
                onClick={() => { onClear(); setActive(new Set()); setOpen(false); }}
                className="w-full px-2.5 py-1.5 rounded text-[11px] text-fg-3 hover:text-loss hover:bg-surface-hover transition-colors text-left"
              >
                Clear all indicators
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
