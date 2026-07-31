'use client';

import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { marketApi, type MarketSymbol } from '@/lib/market-api';

const ASSET_COLOR: Record<string, string> = {
  crypto: 'text-warning',
  forex: 'text-profit',
  stock: 'text-fg-2',
  commodity: 'text-warning',
  broker: 'text-profit',
};

export default function SymbolSearch({ onSelect }: { onSelect: (symbol: string) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<MarketSymbol[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 1) {
      setResults([]);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(() => {
      marketApi
        .search(needle)
        .then(r => { if (id === reqId.current) setResults(r.symbols); })
        .catch(() => { if (id === reqId.current) setResults([]); })
        .finally(() => { if (id === reqId.current) setLoading(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (symbol: string) => {
    onSelect(symbol);
    setQ('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div className="relative w-full max-w-xs" data-testid="symbol-search">
      <MagnifyingGlass size={13} weight="bold" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-3" />
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search symbol… (BTCUSDT, AAPL, EURUSD)"
        data-testid="symbol-search-input"
        className="w-full pl-7 pr-2 py-1.5 text-[11px] rounded bg-surface border border-border-soft text-fg placeholder:text-fg-3 focus:outline-none focus:border-border-strong"
      />
      {open && (q.trim().length > 0) && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded-[var(--radius-card)] border border-border-strong bg-surface shadow-xl">
            {loading && results.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-fg-3">Searching…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-fg-3">No matches</div>
            ) : (
              results.map(r => (
                <button
                  key={`${r.provider}:${r.symbol}`}
                  onClick={() => pick(r.symbol)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-fg truncate">{r.symbol}</div>
                    <div className="text-[10px] text-fg-3 truncate">{r.name}</div>
                  </div>
                  <span className={`shrink-0 text-[9px] tracking-[0.12em] uppercase ${ASSET_COLOR[r.assetClass] ?? 'text-fg-3'}`}>
                    {r.assetClass}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
