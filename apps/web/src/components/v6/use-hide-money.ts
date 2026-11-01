'use client';

// Hide balances (QW.2): blurs money figures for screen sharing or a café, on
// every page. Remembered on this device (storage may be unavailable) and
// applied before paint by the script in app/layout.tsx, like the theme.
import { useCallback, useEffect, useState } from 'react';

const KEY = 'tl-hide-money';

export function useHideMoney(): [boolean, () => void] {
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setHidden(document.documentElement.dataset.hideMoney === '1'); }, []);
  const toggle = useCallback(() => {
    const next = document.documentElement.dataset.hideMoney !== '1';
    if (next) document.documentElement.dataset.hideMoney = '1';
    else delete document.documentElement.dataset.hideMoney;
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* private mode: still applies for this visit */ }
    setHidden(next);
  }, []);
  return [hidden, toggle];
}
