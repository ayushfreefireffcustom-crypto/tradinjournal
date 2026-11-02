'use client';

import { useEffect, useState } from 'react';
import { marketApi, MARKET_SYMBOL_NAMES } from '@/lib/market-api';
import { tickerMark } from '@/lib/desk';
import { IClose } from '@/components/v6/icons';
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
    <section className="x-card mk-side" data-testid="watchlist" aria-labelledby="mk-wl-t">
      <div className="x-ch">
        <h3 id="mk-wl-t">Watchlist</h3>
        {!loading && symbols.length > 0 && <span className="x-sub m">{symbols.length}</span>}
        <div className="x-r">
          <button className="x-btn x-btn--sm" onClick={() => !pinned && save([...symbols, activeSymbol])} disabled={pinned} title={pinned ? `${activeSymbol} is pinned` : `Pin ${activeSymbol}`} data-testid="watchlist-add">
            {pinned ? 'Pinned' : <>Pin <span className="mk-ell">{activeSymbol}</span></>}
          </button>
        </div>
      </div>
      <div className="mk-side-bd">
        {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="x-skel x-skel--in mk-sk-row" />)
          : symbols.length === 0 ? <p className="mk-none">Nothing pinned yet. Open a symbol and press Pin.</p>
          : symbols.map(s => {
            const q = quotes[s];
            const tone = q?.chg == null ? 'x-muted' : q.chg >= 0 ? 'pos' : 'neg';
            return (
              <div key={s} role="button" tabIndex={0} className={`mk-wl ${s === activeSymbol ? 'on' : ''}`} onClick={() => onPick(s)} onKeyDown={e => { if (e.key === 'Enter') onPick(s); }} data-testid={`watchlist-item-${s}`} aria-current={s === activeSymbol || undefined}>
                <span className="x-mk">{tickerMark(s)}</span>
                <span className="mk-wl-n"><b>{s}</b><small>{MARKET_SYMBOL_NAMES[s] ?? ' '}</small></span>
                <span className="mk-wl-px m">{q ? fmtQuote(q.last) : '—'}<small className={tone}>{q ? fmtChg(q.chg) : ' '}</small></span>
                <button className="mk-wl-x" onClick={e => { e.stopPropagation(); save(symbols.filter(x => x !== s)); }} onKeyDown={e => e.stopPropagation()} aria-label={`Unpin ${s}`} title={`Unpin ${s}`}><IClose size={12} /></button>
              </div>
            );
          })}
      </div>
    </section>
  );
}
