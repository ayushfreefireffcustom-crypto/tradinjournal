'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'tl-theme';
/** Fired on window when any toggle changes the theme, so every button showing it updates. */
const EVENT = 'tl-theme-change';
const read = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };

/** Dark by default; the choice is remembered per device (storage may be unavailable). */
export function useTheme(): [Theme, () => void] {
  // The server renders dark; the client reads the theme the pre-paint script set.
  const theme = useSyncExternalStore(subscribe, read, () => 'dark' as const);
  const toggle = useCallback(() => {
    const next: Theme = read() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* private mode: still switches for this visit */ }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [theme, toggle];
}
