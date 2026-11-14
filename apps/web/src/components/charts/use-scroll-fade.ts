'use client';

// Marks a horizontally scrolling row with data-fl / data-fr while there is more
// to see on the left / right, so CSS can fade that edge instead of cutting a chip.
// Returns a callback ref, so it works for rows that mount late (behind the shell's loader).
import { useCallback, useRef } from 'react';

export function useScrollFade<T extends HTMLElement>() {
  const stop = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    stop.current?.();
    stop.current = null;
    if (!el) return;
    const set = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.toggleAttribute('data-fl', max > 1 && el.scrollLeft > 1);
      el.toggleAttribute('data-fr', max > 1 && el.scrollLeft < max - 1);
    };
    set();
    el.addEventListener('scroll', set, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    for (const c of Array.from(el.children)) ro?.observe(c);
    stop.current = () => { el.removeEventListener('scroll', set); ro?.disconnect(); };
  }, []);
}
