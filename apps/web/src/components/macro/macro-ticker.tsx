'use client';

import type { MacroState } from '@/lib/macro-api';
import { formatMacroNumber, formatSignedPct } from '@/lib/macro-format';

export default function MacroTicker({ markets }: { markets: MacroState['markets'] }) {
  if (!markets.length) {
    return (
      <div
        className="border-b border-border-soft px-4 py-2 text-[11px] text-fg-3 tracking-wide"
        data-testid="macro-ticker-empty"
      >
        No live quotes yet — waiting for first ingest.
      </div>
    );
  }

  return (
    <div
      className="border-b border-border-soft overflow-x-auto"
      data-testid="macro-ticker"
    >
      <div className="flex items-stretch min-w-max">
        {markets.map(m => {
          const up = (m.changePct ?? 0) > 0;
          const down = (m.changePct ?? 0) < 0;
          const tone = up ? 'text-profit' : down ? 'text-loss' : 'text-fg-3';
          return (
            <div
              key={m.symbol}
              className="flex items-center gap-2 px-4 py-2 border-r border-border-soft last:border-r-0"
              data-testid={`macro-ticker-${m.symbol}`}
            >
              <span className="text-[10px] tracking-[0.18em] text-fg-3">{m.symbol}</span>
              <span className="numeric text-sm text-fg">{formatMacroNumber(m.price)}</span>
              <span className={`numeric text-[11px] ${tone}`}>{formatSignedPct(m.changePct ?? null)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
