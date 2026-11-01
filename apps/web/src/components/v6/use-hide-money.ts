'use client';

// Hide balances (QW.2): blurs money figures for screen sharing or a café, on
// every page. Remembered on this device (storage may be unavailable) and
// applied before paint by the script in app/layout.tsx, like the theme.
import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'tl-hide-money';
/** Fired on window when any toggle changes it, so every eye button stays in step. */
const EVENT = 'tl-hide-money-change';
const read = () => document.documentElement.dataset.hideMoney === '1';
const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); return () => window.removeEventListener(EVENT, cb); };

export function useHideMoney(): [boolean, () => void] {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    const next = !read();
    if (next) document.documentElement.dataset.hideMoney = '1';
    else delete document.documentElement.dataset.hideMoney;
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* private mode: still applies for this visit */ }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [hidden, toggle];
}
