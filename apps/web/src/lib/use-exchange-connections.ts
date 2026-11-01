'use client';

// Exchange connections for the account switcher (B5.5). Cached for a minute
// across pages so the header doesn't refetch on every navigation. Returns []
// when trading is off or the request fails: the switcher then just shows MT5.
import { useEffect, useState } from 'react';
import { exchangesApi, type ExchangeConnection } from './copy-api';
import { TRADING_ENABLED } from './features';

const FRESH_MS = 60_000;
let cache: { at: number; rows: ExchangeConnection[] } | null = null;
let inflight: Promise<ExchangeConnection[]> | null = null;

export function useExchangeConnections(): ExchangeConnection[] {
  const [rows, setRows] = useState<ExchangeConnection[]>(() => cache?.rows ?? []);
  useEffect(() => {
    if (!TRADING_ENABLED) return;
    if (cache && Date.now() - cache.at < FRESH_MS) { setRows(cache.rows); return; }
    let alive = true;
    inflight ??= exchangesApi.list()
      .then(r => { cache = { at: Date.now(), rows: r }; return r; })
      .catch(() => cache?.rows ?? [])
      .finally(() => { inflight = null; });
    void inflight.then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, []);
  return rows;
}

/** Drop the cache after connecting or removing an exchange key. */
export function invalidateExchangeConnections(): void {
  cache = null;
}
