'use client';

// Last price + change vs ~24h earlier for a handful of symbols (watchlist rows).
// One light candles call per symbol; refreshes every 60s while mounted.
import { useEffect, useState } from 'react';
import { marketApi } from '@/lib/market-api';

export interface Quote { last: number; chg: number | null }

export function useQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const key = symbols.join(',');
  useEffect(() => {
    let alive = true;
    const load = () => symbols.forEach(sym => {
      marketApi.candles({ symbol: sym, tf: '1h', limit: 30 }).then(({ candles }) => {
        const last = candles[candles.length - 1];
        if (!alive || !last) return;
        const ref = [...candles].reverse().find(c => c.openTime <= last.openTime - 86_400_000);
        setQuotes(q => ({ ...q, [sym]: { last: last.close, chg: ref ? ((last.close - ref.close) / ref.close) * 100 : null } }));
      }).catch(() => {});
    });
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return quotes;
}

/** Magnitude-aware price string (crypto/indices grouped, FX 4–5dp). */
export function fmtQuote(v: number) {
  const a = Math.abs(v);
  const d = a >= 10000 ? 1 : a >= 1000 ? 1 : a >= 100 ? 2 : a >= 10 ? 3 : 4;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export const fmtChg = (c: number | null) => (c == null ? '—' : `${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(2)}%`);
