'use client';

import { useEffect, useRef, useState } from 'react';
import { ICheck } from '@/components/v3/icons';

// klinecharts built-in indicators. Main-pane overlays and sub-pane oscillators.
const INDICATORS: { name: string; label: string }[] = [
  { name: 'MA', label: 'Moving average' }, { name: 'EMA', label: 'Exponential MA' }, { name: 'BOLL', label: 'Bollinger bands' },
  { name: 'SAR', label: 'Parabolic SAR' }, { name: 'VOL', label: 'Volume' }, { name: 'MACD', label: 'MACD' },
  { name: 'RSI', label: 'RSI' }, { name: 'KDJ', label: 'KDJ' },
];

export default function IndicatorMenu({ onAdd, onClear }: { onAdd: (name: string) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return (
    <div className="ch-menu" ref={ref} data-testid="indicator-menu">
      <button className="ch-pill" aria-expanded={open} onClick={() => setOpen(o => !o)}><i className="fx">ƒx</i> Indicators{active.size > 0 && <span className="ch-count num">{active.size}</span>}</button>
      {open && (
        <div className="ch-pop" role="menu">
          {INDICATORS.map(ind => (
            <button key={ind.name} role="menuitemcheckbox" aria-checked={active.has(ind.name)} disabled={active.has(ind.name)}
              onClick={() => { onAdd(ind.name); setActive(p => new Set(p).add(ind.name)); }}>
              <span>{ind.label}<small>{ind.name}</small></span>{active.has(ind.name) && <ICheck size={15} />}
            </button>
          ))}
          <div className="sep" />
          <button className="clr" disabled={!active.size} onClick={() => { onClear(); setActive(new Set()); setOpen(false); }}>Clear all indicators</button>
        </div>
      )}
    </div>
  );
}
