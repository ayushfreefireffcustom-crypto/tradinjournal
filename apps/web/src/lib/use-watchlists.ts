'use client';

// The signed-in user's named watchlists (QW.12), shared by every component on
// the page: the charts side panel and each ☆ button read the same store, so
// starring a symbol shows up in the panel straight away. Loaded once per page;
// symbol edits are optimistic and roll back if the API refuses them. The list
// last opened is remembered per device.
import { useEffect, useSyncExternalStore } from 'react';
import { marketApi, type WatchlistList } from '@/lib/market-api';

export interface WatchlistState { lists: WatchlistList[] | null; activeId: string | null; error: string | null }

const ACTIVE_KEY = 'tl.watchlist.active';
let state: WatchlistState = { lists: null, activeId: null, error: null };
let loading: Promise<void> | null = null;
const subs = new Set<() => void>();
const edits = new Map<string, number>();
const queue = new Map<string, Promise<void>>();
const SERVER: WatchlistState = { lists: null, activeId: null, error: null };

function set(next: Partial<WatchlistState>) {
  state = { ...state, ...next };
  subs.forEach((f) => f());
}
const readActive = () => { try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; } };
const writeActive = (id: string) => { try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* private mode */ } };

/** The active list's id: the remembered one if it still exists, else the first. */
export function pickActive(lists: readonly WatchlistList[], wanted: string | null): string | null {
  return lists.find((l) => l.id === wanted)?.id ?? lists[0]?.id ?? null;
}

function load(force = false): Promise<void> {
  if (loading && !force) return loading;
  loading = marketApi.watchlists()
    .then(({ lists }) => set({ lists, activeId: pickActive(lists, state.activeId ?? readActive()), error: null }))
    .catch((e: Error) => { set({ lists: state.lists ?? [], error: e.message }); loading = null; });
  return loading;
}

const replace = (list: WatchlistList) => (state.lists ?? []).map((l) => (l.id === list.id ? list : l));

export const watchlists = {
  select(id: string) { set({ activeId: id }); writeActive(id); },
  async create(name: string, symbols?: string[]): Promise<WatchlistList> {
    const list = await marketApi.createWatchlist(name, symbols);
    set({ lists: [...(state.lists ?? []), list], error: null });
    watchlists.select(list.id);
    return list;
  },
  async rename(id: string, name: string): Promise<void> {
    set({ lists: replace(await marketApi.updateWatchlist(id, { name })), error: null });
  },
  async remove(id: string): Promise<void> {
    await marketApi.deleteWatchlist(id);
    const lists = (state.lists ?? []).filter((l) => l.id !== id);
    set({ lists, activeId: pickActive(lists, state.activeId === id ? null : state.activeId), error: null });
  },
  /** Replace a list's symbols. Shows the change at once; puts it back if the API refuses. */
  async setSymbols(id: string, symbols: string[]): Promise<void> {
    const cur = state.lists?.find((l) => l.id === id);
    if (!cur) return;
    const prev = cur.symbols;
    const seq = (edits.get(id) ?? 0) + 1;
    edits.set(id, seq);
    set({ lists: replace({ ...cur, symbols }), error: null });
    // Edits go out one after another per list, so the server ends on the newest.
    const run = (queue.get(id) ?? Promise.resolve()).then(() => marketApi.updateWatchlist(id, { symbols }));
    queue.set(id, run.then(() => undefined, () => undefined));
    try {
      const saved = await run;
      if (edits.get(id) === seq) set({ lists: replace(saved) }); // a newer edit is already showing
    } catch (e) {
      const now = state.lists?.find((l) => l.id === id);
      if (now && edits.get(id) === seq) set({ lists: replace({ ...now, symbols: prev }) });
      set({ error: (e as Error).message });
      throw e;
    }
  },
  /** Add the symbol to the list, or take it out if it's already there. */
  toggle(id: string, symbol: string): Promise<void> {
    const cur = state.lists?.find((l) => l.id === id);
    if (!cur) return Promise.resolve();
    return watchlists.setSymbols(id, cur.symbols.includes(symbol) ? cur.symbols.filter((s) => s !== symbol) : [...cur.symbols, symbol]);
  },
  clearError() { set({ error: null }); },
  reload: () => load(true),
};

export function useWatchlists(): WatchlistState {
  const snap = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state, () => SERVER);
  useEffect(() => { void load(); }, []);
  return snap;
}
