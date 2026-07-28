'use client';

// The set of canonical symbols a user actually trades on the selected account,
// derived from stats.bySymbol. Feeds the news "YOUR MARKET" matching.
//
// `ready` tells the feed the stats have resolved, so it can decide between the
// "featured lead" (no symbols) and "on your radar" (has symbols) layouts WITHOUT
// flashing the lead first and swapping it out mid-render.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { canonicalize } from '@/lib/symbol-match';

export interface TradedSymbols {
  symbols: Set<string>;
  ready: boolean;
}

export function useTradedSymbols(accountId: string | null | undefined): TradedSymbols {
  const [symbols, setSymbols] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!accountId) { setSymbols(new Set()); setReady(true); return; }
    let cancelled = false;
    setReady(false);
    api.trades
      .stats(accountId)
      .then(stats => {
        if (cancelled) return;
        // Canonicalize so broker names (GOLD, SPX500) match the keys the news
        // matcher emits (XAUUSD, US500).
        setSymbols(new Set(stats.bySymbol.map(s => canonicalize(s.symbol)).filter(Boolean)));
      })
      .catch(() => { if (!cancelled) setSymbols(new Set()); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [accountId]);

  return { symbols, ready };
}
