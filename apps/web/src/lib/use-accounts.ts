'use client';

// Shared broker-account loader + selection that PERSISTS across page navigations.
//
// Previously every page kept its own `useState(selected)` and re-defaulted to
// accounts[0] on mount, so selecting the 2nd account and navigating to another
// section snapped back to the 1st. This hook centralizes the list fetch and
// stores the chosen account id in localStorage, so the selection survives route
// changes and reloads. Pass `initialIdOverride` (e.g. a `?account=` id) to force
// a specific account on first load (it is then persisted like any selection).

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api, type BrokerAccount } from '@/lib/api';

const STORAGE_KEY = 'tradelogs.selectedAccountId';

function readStored(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function writeStored(id: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// Persist a selection made outside the hook (e.g. a `?account=` deep-link on the
// trade-detail page) so later navigation to the main sections keeps that account.
export function persistSelectedAccountId(id: string | null) {
  writeStored(id);
}

// Every page mounts its own AppShell + useAccounts, so without a shared copy each
// sidebar click re-fetched the list and showed skeletons first. Pages now render
// from this copy instantly and refresh it in the background once it's stale.
const FRESH_MS = 60_000;
let cache: { accs: BrokerAccount[]; at: number } | null = null;
let inflight: Promise<BrokerAccount[]> | null = null;

function fetchAccounts(): Promise<BrokerAccount[]> {
  inflight ??= api.accounts.list()
    .then(accs => { cache = { accs, at: Date.now() }; return accs; })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Drop the shared list (sign-out / user switch). */
export function clearAccountsCache() {
  cache = null;
}

export function useAccounts(initialIdOverride?: string | null) {
  const [accounts, setAccountsState] = useState<BrokerAccount[]>(() => cache?.accs ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (!cache) return null; // first load: resolved in the effect so SSR and hydration match
    const wanted = initialIdOverride ?? readStored();
    return cache.accs.find(a => a.id === wanted)?.id ?? cache.accs[0]?.id ?? null;
  });
  const [loading, setLoading] = useState(() => !cache);
  // Only a list that actually loaded may send someone to /brokers — a 401 or a
  // network blip must not bounce a signed-out (or offline) user there.
  const [loaded, setLoaded] = useState(() => !!cache);
  const router = useRouter();
  const pathname = usePathname();

  // The journal requires at least one connected broker: zero-broker users are kept
  // on /brokers (the only place they can fix that) until they connect one. The
  // partner portal and admin pages work without a broker — many partners don't trade.
  useEffect(() => {
    const brokerFree = pathname === '/brokers' || pathname.startsWith('/partner') || pathname.startsWith('/admin');
    if (loaded && !loading && accounts.length === 0 && !brokerFree) {
      router.replace('/brokers');
    }
  }, [loaded, loading, accounts.length, pathname, router]);

  // Initial load — read the persisted selection inside the effect (never during
  // render) so server and client first paint match.
  useEffect(() => {
    let alive = true;
    if (cache && Date.now() - cache.at < FRESH_MS) {
      if (initialIdOverride && cache.accs.some(a => a.id === initialIdOverride)) writeStored(initialIdOverride);
      return;
    }
    (async () => {
      try {
        const accs = await fetchAccounts();
        if (!alive) return;
        setAccountsState(accs);
        setLoaded(true);
        const wanted = initialIdOverride ?? readStored();
        const resolved = accs.find(a => a.id === wanted)?.id ?? accs[0]?.id ?? null;
        setSelectedId(resolved);
        writeStored(resolved);
      } catch {
        // leave empty; callers render their own no-accounts state
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // Run once on mount; initialIdOverride is only meaningful for first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = accounts.find(a => a.id === selectedId) ?? accounts[0] ?? null;

  const select = useCallback((acc: BrokerAccount) => {
    setSelectedId(acc.id);
    writeStored(acc.id);
  }, []);

  // Mutate the list while keeping the persisted selection valid — if the current
  // selection disappears (e.g. a broker was deleted), fall back to the first.
  const setAccounts = useCallback(
    (updater: BrokerAccount[] | ((prev: BrokerAccount[]) => BrokerAccount[])) => {
      setAccountsState(prev => {
        const next = typeof updater === 'function'
          ? (updater as (p: BrokerAccount[]) => BrokerAccount[])(prev)
          : updater;
        setSelectedId(curr => {
          const stillThere = curr != null && next.some(a => a.id === curr);
          const resolved = stillThere ? curr : (next[0]?.id ?? null);
          writeStored(resolved);
          return resolved;
        });
        cache = { accs: next, at: Date.now() };
        return next;
      });
    },
    [],
  );

  return { accounts, selected, select, setAccounts, loading };
}
