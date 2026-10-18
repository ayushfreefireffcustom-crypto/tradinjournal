'use client';

import { useEffect, useState } from 'react';
import { marketApi, MARKET_SYMBOL_NAMES } from '@/lib/market-api';
import { IClose } from '@/components/v3/icons';
import { useQuotes, fmtQuote, fmtChg } from './quote';

// Persisted per-user pinned symbols. Click to load into the active chart.
export default function Watchlist({ activeSymbol, onPick }: { activeSymbol: string; onPick: (symbol: string) => void }) {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const quotes = useQuotes(symbols);

  useEffect(() => {
    let alive = true;
    marketApi.watchlist().then(r => { if (alive) setSymbols(r.symbols); }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const save = (next: string[]) => { setSymbols(next); void marketApi.setWatchlist(next).catch(() => {}); };
  const pinned = symbols.includes(activeSymbol);

  return (
    <section className="v3-card ch-side" data-testid="watchlist" aria-labelledby="ch-wl-t">
      <div className="ch-side-hd">
        <h3 id="ch-wl-t"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9z" /></svg> Watchlist</h3>
        <button className="v3-link" onClick={() => !pinned && save([...symbols, activeSymbol])} disabled={pinned} title={pinned ? `${activeSymbol} is pinned` : `Pin ${activeSymbol}`} data-testid="watchlist-add">{pinned ? 'Pinned' : '+ Add'}</button>
      </div>
      <div className="ch-side-bd">
        {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="skel d-sk" style={{ height: 46, margin: '4px 0' }} />)
          : symbols.length === 0 ? <p className="ch-none">Nothing pinned yet. Open a symbol and press + Add.</p>
          : symbols.map(s => {
            const q = quotes[s];
            const tone = q?.chg == null ? '' : q.chg >= 0 ? 'lg' : 'sh';
            return (
              <div key={s} role="button" tabIndex={0} className={`ch-wl ${s === activeSymbol ? 'on' : ''}`} onClick={() => onPick(s)} onKeyDown={e => { if (e.key === 'Enter') onPick(s); }} data-testid={`watchlist-item-${s}`}>
                <span><b>{s}</b><small>{MARKET_SYMBOL_NAMES[s] ?? ' '}</small></span>
                <span className={`r num ${tone}`}>{q ? fmtQuote(q.last) : '—'}<small className={tone}>{q ? fmtChg(q.chg) : ''}</small></span>
                <button className="x" onClick={e => { e.stopPropagation(); save(symbols.filter(x => x !== s)); }} aria-label={`Unpin ${s}`}><IClose size={12} /></button>
              </div>
            );
          })}
      </div>
    </section>
  );
}
