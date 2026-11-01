'use client';

import { useState } from 'react';
import KlineChart, { type KlineChartHandle } from './kline-chart';
import PriceChart from './price-chart';
import type { ChartType, SizeSetting } from '@/lib/chart-types';
import { DEFAULT_SIZE } from '@/lib/chart-types';
import type { MarketTimeframe } from '@/lib/market-api';
import { IClose } from '@/components/v3/icons';
import { fmtQuote, fmtChg } from './quote';

export interface Pane {
  id: string;
  symbol: string;
  tf: MarketTimeframe;
  /** Candles by default; Renko, Kagi and P&F carry their size. */
  chartType?: ChartType;
  size?: SizeSetting;
  reversal?: number;
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
    <div className={`mk-cgrid n${panes.length}`} data-testid="layout-grid">
      {panes.map(p => {
        const q = quotes[`${p.id}:${p.symbol}:${p.tf}`];
        const chg = q && q.ref ? ((q.last - q.ref) / q.ref) * 100 : null;
        const on = multi && p.id === activeId;
        return (
          <div key={p.id} onMouseDown={() => onActivate(p.id)} className={`x-card mk-pane ${on ? 'on' : ''}`} data-testid={`chart-pane-${p.id}`}>
            <div className="mk-pane-hd">
              <b>{p.symbol}</b>
              <span className="x-tag mk-pane-tf">{p.tf}</span>
              {p.chartType && p.chartType !== 'candles' && <span className="x-tag mk-pane-tf" data-testid={`pane-type-${p.id}`}>{p.chartType === 'heikin' ? 'HA' : p.chartType === 'pnf' ? 'P&F' : p.chartType === 'renko' ? 'Renko' : 'Kagi'}</span>}
              {q ? (
                <span className="mk-pane-px m">
                  {fmtQuote(q.last)} <em className={chg == null ? 'x-muted' : chg >= 0 ? 'pos' : 'neg'}>{fmtChg(chg)}</em>
                </span>
              ) : <span className="mk-pane-px m x-dim">—</span>}
              {on && <span className="x-dot mk-pane-on" title="Active pane: the toolbar edits this chart" />}
              {multi && (
                <button onMouseDown={e => e.stopPropagation()} onClick={() => onClose(p.id)} className="x-btn x-btn--ghost x-btn--icon x-btn--sm mk-pane-x" aria-label={`Close ${p.symbol} pane`}>
                  <IClose size={13} />
                </button>
              )}
            </div>
            <div className="mk-pane-bd">
              {p.chartType === 'renko' || p.chartType === 'kagi' || p.chartType === 'pnf' ? (
                <PriceChart symbol={p.symbol} tf={p.tf} type={p.chartType} size={p.size ?? DEFAULT_SIZE[p.chartType]} reversal={p.reversal}
                  onQuote={v => setQuotes(s => ({ ...s, [`${p.id}:${p.symbol}:${p.tf}`]: v }))} />
              ) : (
                <KlineChart ref={handle => registerRef(p.id, handle)} symbol={p.symbol} tf={p.tf} heikin={p.chartType === 'heikin'}
                  onQuote={v => setQuotes(s => ({ ...s, [`${p.id}:${p.symbol}:${p.tf}`]: v }))} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
