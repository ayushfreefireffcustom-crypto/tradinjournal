'use client';

import type { MacroState } from '@/lib/macro-api';
import { deltaPct, formatMacroNumber, formatSignedPct } from '@/lib/macro-format';

export default function MacroCards({ macro }: { macro: MacroState['macro'] }) {
  if (!macro.length) {
    return (
      <div className="tcard p-4 text-sm text-fg-3" data-testid="macro-cards-empty">
        No FRED indicators ingested yet.
      </div>
    );
  }

  // Prefer a readable subset for the dashboard strip; full set stays in state for scanner.
  const priority = [
    'NET_LIQUIDITY', 'CPIAUCSL', 'CPILFESL', 'UNRATE', 'PAYEMS', 'DGS10', 'T10Y2Y',
    'FEDFUNDS', 'DFF', 'VIXCLS', 'BAMLH0A0HYM2', 'DTWEXBGS',
  ];
  const ranked = [...macro].sort((a, b) => {
    const ia = priority.indexOf(a.key);
    const ib = priority.indexOf(b.key);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  }).slice(0, 12);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2" data-testid="macro-cards">
      {ranked.map(m => {
        const d = deltaPct(m.value, m.prev);
        const tone = d == null ? 'text-fg-3' : d > 0 ? 'text-profit' : d < 0 ? 'text-loss' : 'text-fg-3';
        return (
          <div key={m.key} className="tcard p-3" data-testid={`macro-card-${m.key}`}>
            <div className="text-[10px] tracking-[0.14em] text-fg-3 truncate">{m.label}</div>
            <div className="numeric text-lg text-fg mt-1">{formatMacroNumber(m.value)}</div>
            <div className={`numeric text-[11px] mt-0.5 ${tone}`}>{formatSignedPct(d)}</div>
            {m.unit && <div className="text-[10px] text-fg-3 mt-1">{m.unit}</div>}
          </div>
        );
      })}
    </div>
  );
}
