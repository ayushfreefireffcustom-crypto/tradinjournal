'use client';

import { useEffect, useRef, useState } from 'react';
import { ISearch } from '@/components/v3/icons';
import { marketApi, type MarketSymbol } from '@/lib/market-api';

const CLASS_LABEL: Record<string, string> = { crypto: 'Crypto', forex: 'Forex', stock: 'Stock', commodity: 'Commodity', broker: 'Broker' };
const sourceFor = (s: string) => (/USDT$|BUSD$|USDC$/.test(s) ? 'Binance' : 'Market');

// Combobox: shows the active symbol at rest; typing searches, ↑/↓/Enter picks.
export default function SymbolSearch({ value, onSelect }: { value: string; onSelect: (symbol: string) => void }) {
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [results, setResults] = useState<MarketSymbol[]>([]);
  const [loading, setLoading] = useState(false);
  const [hi, setHi] = useState(0);
  const reqId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) { setResults([]); return; }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(() => {
      marketApi.search(needle)
        .then(r => { if (id === reqId.current) { setResults(r.symbols); setHi(0); } })
        .catch(() => { if (id === reqId.current) setResults([]); })
        .finally(() => { if (id === reqId.current) setLoading(false); });
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (symbol: string) => { onSelect(symbol); setQ(''); setResults([]); inputRef.current?.blur(); };
  const open = focus && q.trim().length > 0;

  return (
    <div className={`ch-search ${focus ? 'on' : ''}`} data-testid="symbol-search">
      <ISearch size={17} />
      <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 120)}
        placeholder={focus ? 'Search BTCUSDT, AAPL, EURUSD…' : ''} data-testid="symbol-search-input" aria-label={`Symbol: ${value}. Type to search`}
        role="combobox" aria-expanded={open} aria-controls="ch-results"
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(results.length - 1, h + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)); }
          if (e.key === 'Enter') { const r = results[hi]; if (r) pick(r.symbol); else if (q.trim()) pick(q.trim().toUpperCase()); }
          if (e.key === 'Escape') { setQ(''); inputRef.current?.blur(); }
        }} />
      {!focus && !q && <span className="ch-cur" aria-hidden><b>{value}</b><small>{sourceFor(value)}</small></span>}
      {open && (
        <div className="ch-pop ch-results" id="ch-results" role="listbox">
          {loading && !results.length ? <div className="ch-none">Searching…</div>
            : !results.length ? <div className="ch-none">No matches — press Enter to try “{q.trim().toUpperCase()}”</div>
            : results.map((r, i) => (
              <button key={`${r.provider}:${r.symbol}`} role="option" aria-selected={i === hi} className={i === hi ? 'hi' : ''} onMouseEnter={() => setHi(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(r.symbol)}>
                <span>{r.symbol}<small>{r.name}</small></span><em>{CLASS_LABEL[r.assetClass] ?? r.assetClass}</em>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
