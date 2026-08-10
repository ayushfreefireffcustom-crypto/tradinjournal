'use client';

import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export interface CountUpOpts {
  duration?: number;
  decimals?: number;
  enabled?: boolean;
  /** When true, first paint counts from 0 → value (macro hero numbers). Default false preserves dashboard tween-on-change. */
  fromZero?: boolean;
}

/**
 * Tween a number toward `value`.
 * - `useCountUp(n, 650)` — legacy: settle on mount, animate subsequent changes (dashboard stats).
 * - `useCountUp(n, { fromZero: true })` — count up from 0 on mount (macro gauges).
 */
export function useCountUp(
  value: number | null | undefined,
  durationOrOpts: number | CountUpOpts = 650,
): number | null {
  const opts: Required<Pick<CountUpOpts, 'duration' | 'enabled' | 'fromZero'>> & Pick<CountUpOpts, 'decimals'> =
    typeof durationOrOpts === 'number'
      ? { duration: durationOrOpts, enabled: true, fromZero: false }
      : {
          duration: durationOrOpts.duration ?? 900,
          enabled: durationOrOpts.enabled ?? true,
          fromZero: durationOrOpts.fromZero ?? true,
          decimals: durationOrOpts.decimals,
        };

  const { duration, enabled, fromZero, decimals } = opts;
  const [display, setDisplay] = useState<number | null>(() => {
    if (value == null || !Number.isFinite(value)) return null;
    if (!enabled) return value;
    return fromZero ? 0 : value;
  });
  const fromRef = useRef<number | null>(fromZero ? 0 : value ?? null);
  const mounted = useRef(false);
  const rafRef = useRef(0);

  useEffect(() => {
    if (value == null || !Number.isFinite(value)) {
      setDisplay(null);
      fromRef.current = null;
      return;
    }
    if (!enabled) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    // Legacy path: first mount snaps to value (no count-from-zero).
    if (!fromZero && !mounted.current) {
      mounted.current = true;
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    mounted.current = true;

    if (prefersReducedMotion() || duration <= 0) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current == null || fromZero ? (fromRef.current == null ? 0 : fromRef.current) : fromRef.current;
    // On first fromZero run, always start at 0.
    const startVal = fromZero && fromRef.current === 0 && display === 0 ? 0 : from;
    const to = value;
    if (startVal === to && !fromZero) return;

    const t0 = performance.now();
    cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const raw = startVal + (to - startVal) * easeOutCubic(t);
      const next =
        decimals != null
          ? Math.round(raw * 10 ** decimals) / 10 ** decimals
          : raw;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // display intentionally omitted — only re-run on value/opts change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, enabled, fromZero, decimals]);

  return display;
}
