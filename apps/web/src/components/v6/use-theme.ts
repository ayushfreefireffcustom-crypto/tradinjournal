'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'tl-theme';

/** Dark by default; the choice is remembered per device (storage may be unavailable). */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);
  const toggle = useCallback(() => {
    const next: Theme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* private mode: still switches for this visit */ }
    setTheme(next);
  }, []);
  return [theme, toggle];
}
