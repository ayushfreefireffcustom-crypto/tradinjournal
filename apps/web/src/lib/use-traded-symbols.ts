'use client';

// The set of canonical symbols a user actually trades on the selected account,
// derived from stats.bySymbol. Feeds the news "YOUR MARKET" matching. Empty set
// while loading or when the account has no trades → the feature stays dormant.
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { normalizeSymbol } from '@/lib/symbol-match';

export function useTradedSymbols(accountId: string | null | undefined): Set<string> {
  const [symbols, setSymbols] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!accountId) { setSymbols(new Set()); return; }
    let cancelled = false;
    api.trades
      .stats(accountId)
      .then(stats => {
        if (cancelled) return;
        setSymbols(new Set(stats.bySymbol.map(s => normalizeSymbol(s.symbol)).filter(Boolean)));
      })
      .catch(() => { if (!cancelled) setSymbols(new Set()); });
    return () => { cancelled = true; };
  }, [accountId]);

  return symbols;
}
