'use client';

// Data helpers shared by the app pages (A7.5): load-with-reload, a visible-tab
// poll, and a short relative time. Moved out of copy/parts so a page using
// them doesn't pull in the copy-trading styles.
import { useCallback, useEffect, useRef, useState } from 'react';

/** Load data once and on demand; keeps the last good value while reloading. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const run = useCallback(async () => {
    const n = ++seq.current;
    setLoading(true);
    try {
      const v = await fn();
      if (n === seq.current) { setData(v); setError(null); }
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      if (n === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

/** Re-run `fn` every `ms` while the tab is visible. */
export function usePoll(fn: () => void, ms: number, on = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') ref.current(); }, ms);
    return () => clearInterval(t);
  }, [ms, on]);
}

/** "3 min ago" for recent stamps, a date for older ones. */
export function ago(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
