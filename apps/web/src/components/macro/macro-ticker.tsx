'use client';

import type { MacroState } from '@/lib/macro-api';
import { formatMacroNumber, formatSignedPct } from '@/lib/macro-format';

export default function MacroTicker({ markets }: { markets: MacroState['markets'] }) {
  return (
    <div className="shrink-0 flex items-stretch border-b border-border-soft bg-surface/30" data-testid="macro-ticker">
      <div className="flex items-center gap-1.5 px-3 border-r border-border-soft shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
        <span className="text-[10px] tracking-[0.2em] text-fg-3">LIVE</span>
      </div>
      {!markets.length ? (
        <div className="px-4 py-2 text-[11px] text-fg-3 tracking-wide" data-testid="macro-ticker-empty">
          Waiting for first ingest…
        </div>
      ) : (
        <div className="flex items-stretch overflow-x-auto no-scrollbar">
          {markets.map(m => {
            const up = (m.changePct ?? 0) > 0;
            const down = (m.changePct ?? 0) < 0;
            const tone = up ? 'text-profit' : down ? 'text-loss' : 'text-fg-3';
            return (
              <div
                key={m.symbol}
                className="flex items-center gap-2 px-4 py-2 border-r border-border-soft last:border-r-0 shrink-0"
                data-testid={`macro-ticker-${m.symbol}`}
              >
                <span className="text-[10px] tracking-[0.18em] text-fg-2">{m.symbol}</span>
                <span className="numeric text-[13px] text-fg">{formatMacroNumber(m.price)}</span>
                <span className={`numeric text-[11px] ${tone}`}>
                  {m.changePct == null ? '—' : formatSignedPct(m.changePct)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
