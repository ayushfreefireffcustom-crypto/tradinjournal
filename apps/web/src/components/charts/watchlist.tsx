'use client';

import { useEffect, useState } from 'react';
import { Star, Plus, X } from '@phosphor-icons/react';
import { marketApi } from '@/lib/market-api';

// Persisted per-user pinned symbols. Click to load into the active chart.
export default function Watchlist({
  activeSymbol,
  onPick,
}: {
  activeSymbol: string;
  onPick: (symbol: string) => void;
}) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    marketApi
      .watchlist()
      .then(r => { if (alive) setSymbols(r.symbols); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const save = (next: string[]) => {
    setSymbols(next);
    void marketApi.setWatchlist(next).catch(() => {});
  };
  const add = () => { if (activeSymbol && !symbols.includes(activeSymbol)) save([...symbols, activeSymbol]); };
  const remove = (s: string) => save(symbols.filter(x => x !== s));

  return (
    <div className="tcard p-0 flex flex-col min-h-0" data-testid="watchlist">
      <div className="px-3 py-2.5 border-b border-border-soft flex items-center justify-between shrink-0">
        <span className="text-[10px] tracking-[0.2em] text-fg-3 flex items-center gap-1.5">
          <Star size={11} weight="fill" className="text-warning" /> WATCHLIST
        </span>
        <button
          onClick={add}
          title={`Pin ${activeSymbol}`}
          className="p-1 rounded text-fg-3 hover:text-profit transition-colors"
          data-testid="watchlist-add"
        >
          <Plus size={13} weight="bold" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="p-3 flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="shimmer h-7" />)}</div>
        ) : symbols.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-fg-3">
            No pinned symbols.<br />Add the active one with +.
          </div>
        ) : (
          symbols.map(s => (
            <div
              key={s}
              className={`group flex items-center justify-between px-3 py-2 border-b border-border-soft cursor-pointer transition-colors ${
                s === activeSymbol ? 'bg-surface border-l-2 border-l-profit pl-[10px]' : 'hover:bg-surface-hover'
              }`}
              onClick={() => onPick(s)}
              data-testid={`watchlist-item-${s}`}
            >
              <span className="text-[12px] font-semibold text-fg truncate">{s}</span>
              <button
                onClick={e => { e.stopPropagation(); remove(s); }}
                className="p-0.5 rounded text-fg-3 opacity-0 group-hover:opacity-100 hover:text-loss transition-all"
                title="Remove"
              >
                <X size={12} weight="bold" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
