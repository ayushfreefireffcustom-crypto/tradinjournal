'use client';

import { X } from '@phosphor-icons/react';
import KlineChart, { type KlineChartHandle } from './kline-chart';
import type { MarketTimeframe } from '@/lib/market-api';

export interface Pane {
  id: string;
  symbol: string;
  tf: MarketTimeframe;
}

// Renders 1 / 2 / 4 independent klinecharts instances in a responsive grid.
// The active pane is what the shared toolbar (indicators/drawings) targets.
export default function LayoutGrid({
  panes,
  activeId,
  onActivate,
  onClose,
  registerRef,
}: {
  panes: Pane[];
  activeId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  registerRef: (id: string, handle: KlineChartHandle | null) => void;
}) {
  const multi = panes.length > 1;
  const grid = panes.length >= 3 ? 'grid-cols-2 grid-rows-2' : panes.length === 2 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-1 grid-rows-1';

  return (
    <div className={`grid ${grid} gap-2 h-full`} data-testid="layout-grid">
      {panes.map(p => (
        <div
          key={p.id}
          onClick={() => onActivate(p.id)}
          className={`tcard p-0 flex flex-col min-h-0 overflow-hidden ${multi && p.id === activeId ? 'ring-1 ring-profit/40' : ''}`}
          data-testid={`chart-pane-${p.id}`}
        >
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-soft shrink-0">
            <span className="text-[12px] font-semibold text-fg truncate">
              {p.symbol} <span className="text-fg-3 text-[10px] numeric">· {p.tf}</span>
            </span>
            {multi && (
              <button
                onClick={e => { e.stopPropagation(); onClose(p.id); }}
                className="p-0.5 rounded text-fg-3 hover:text-loss transition-colors"
                title="Close pane"
              >
                <X size={12} weight="bold" />
              </button>
            )}
          </div>
          <div className="flex-1 min-h-[200px] sm:min-h-[280px] h-full relative">
            <KlineChart ref={handle => registerRef(p.id, handle)} symbol={p.symbol} tf={p.tf} />
          </div>
        </div>
      ))}
    </div>
  );
}
