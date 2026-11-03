'use client';

// Which features the admin has locked to partner-package holders, and which of them
// this user may open. Mirrors apps/api/src/modules/partners/ib/perks.ts. Nothing is
// locked by default, so this is one small request per session.
import { useEffect, useState } from 'react';
import { PARTNERS_ENABLED } from '@/lib/features';
import { ibApi } from '@/lib/ib-api';

export const PERK_PAGES: { key: string; label: string; pages: string[] }[] = [
  { key: 'signalx', label: 'SignalX', pages: ['/trader'] },
  { key: 'strategies', label: 'Strategy builder', pages: ['/strategies'] },
  { key: 'signals', label: 'Signals', pages: ['/signals'] },
  { key: 'screener', label: 'Screener', pages: ['/screener'] },
  { key: 'options', label: 'Options desk', pages: ['/options'] },
  { key: 'derivatives', label: 'Derivatives', pages: ['/derivatives'] },
  { key: 'macro', label: 'Macro', pages: ['/macro'] },
  { key: 'coach', label: 'AI coach', pages: ['/coach'] },
  { key: 'alerts', label: 'Alerts', pages: ['/alerts'] },
];

type Perks = { locked: string[]; mine: string[] };
let cache: { v: Perks; at: number } | null = null;
let inflight: Promise<Perks> | null = null;
const TTL = 60_000;

export function invalidatePerks(): void { cache = null; }

/** The perk guarding `pathname`, or null. */
export function perkFor(pathname: string) {
  return PERK_PAGES.find(p => p.pages.some(x => pathname === x || pathname.startsWith(`${x}/`))) ?? null;
}

export function usePerks(enabled: boolean): Perks | null {
  const [v, setV] = useState<Perks | null>(cache && Date.now() - cache.at < TTL ? cache.v : null);
  useEffect(() => {
    if (!PARTNERS_ENABLED || !enabled) return;
    if (cache && Date.now() - cache.at < TTL) { setV(cache.v); return; }
    inflight ??= ibApi.perks().then(r => { cache = { v: r, at: Date.now() }; return r; }).finally(() => { inflight = null; });
    // A failed check never locks anyone out.
    inflight.then(setV).catch(() => setV({ locked: [], mine: [] }));
  }, [enabled]);
  return PARTNERS_ENABLED ? v : { locked: [], mine: [] };
}
