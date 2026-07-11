'use client';

import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Tween a number from its previous value to the next one with an ease-out curve.
// Snaps instantly under reduced-motion or on first mount (no count-up from 0 on
// initial paint would look janky if we started at the real value — we start at
// the real value on mount and only animate subsequent changes).
export function useCountUp(value: number, durationMs = 650): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    if (prefersReducedMotion() || durationMs <= 0) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs]);

  return display;
}
