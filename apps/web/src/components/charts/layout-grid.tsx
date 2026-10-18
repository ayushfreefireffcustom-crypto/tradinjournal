'use client';

import { useState } from 'react';
import KlineChart, { type KlineChartHandle } from './kline-chart';
import type { MarketTimeframe } from '@/lib/market-api';
import { IClose } from '@/components/v3/icons';
import { fmtQuote, fmtChg } from './quote';

export interface Pane {
  id: string;
  symbol: string;
  tf: MarketTimeframe;
}

// Renders 1 / 2 / 4 independent klinecharts instances in a responsive grid.
// The active pane is what the shared toolbar (indicators/drawings) targets.
export default function LayoutGrid({ panes, activeId, onActivate, onClose, registerRef }: {
  panes: Pane[];
  activeId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  registerRef: (id: string, handle: KlineChartHandle | null) => void;
}) {
  const multi = panes.length > 1;
  const [quotes, setQuotes] = useState<Record<string, { last: number; ref: number | null }>>({});
  return (
    <div className={`ch-grid n${panes.length}`} data-testid="layout-grid">
      {panes.map(p => {
        const q = quotes[`${p.id}:${p.symbol}:${p.tf}`];
        const chg = q && q.ref ? ((q.last - q.ref) / q.ref) * 100 : null;
        return (
          <div key={p.id} onMouseDown={() => onActivate(p.id)} className={`ch-pane ${multi && p.id === activeId ? 'on' : ''}`} data-testid={`chart-pane-${p.id}`}>
            <div className="ch-pane-hd">
              <b>{p.symbol}</b><span className="tf">{p.tf}</span>
              {q && <span className={`px num ${chg == null ? '' : chg >= 0 ? 'lg' : 'sh'}`}>{fmtQuote(q.last)} <em>{fmtChg(chg)}</em></span>}
              {multi && <button onMouseDown={e => e.stopPropagation()} onClick={() => onClose(p.id)} className="x" aria-label={`Close ${p.symbol} pane`}><IClose size={13} /></button>}
            </div>
            <div className="ch-pane-bd">
              <KlineChart ref={handle => registerRef(p.id, handle)} symbol={p.symbol} tf={p.tf}
                onQuote={v => setQuotes(s => ({ ...s, [`${p.id}:${p.symbol}:${p.tf}`]: v }))} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
