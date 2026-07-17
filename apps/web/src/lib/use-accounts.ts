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

export function useAccounts(initialIdOverride?: string | null) {
  const [accounts, setAccountsState] = useState<BrokerAccount[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // The app requires at least one connected broker: zero-broker users are kept
  // on /brokers (the only place they can fix that) until they connect one.
  useEffect(() => {
    if (!loading && accounts.length === 0 && pathname !== '/brokers') {
      router.replace('/brokers');
    }
  }, [loading, accounts.length, pathname, router]);

  // Initial load — read the persisted selection inside the effect (never during
  // render) so server and client first paint match.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const accs = await api.accounts.list();
        if (!alive) return;
        setAccountsState(accs);
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
        return next;
      });
    },
    [],
  );

  return { accounts, selected, select, setAccounts, loading };
}
