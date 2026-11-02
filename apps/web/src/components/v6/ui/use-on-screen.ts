'use client';

// Keeps an anchored popover on screen (A7): after it opens, if it hangs off the
// left or right edge, anchor it to the other side of its trigger instead. Pure
// `popSide` is tested; the hook adds `x-pop--start` / `x-pop--end`.
import { useLayoutEffect, useRef } from 'react';

const GAP = 8;

/** Which edge to anchor to, or null to keep the stylesheet's choice. */
export function popSide(rect: { left: number; right: number }, viewport: number): 'start' | 'end' | null {
  if (rect.left < GAP) return 'start';
  if (rect.right > viewport - GAP) return 'end';
  return null;
}

export function useOnScreen<T extends HTMLElement = HTMLDivElement>(open: boolean) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    el.classList.remove('x-pop--start', 'x-pop--end');
    const side = popSide(el.getBoundingClientRect(), document.documentElement.clientWidth);
    if (side) el.classList.add(`x-pop--${side}`);
  }, [open]);
  return ref;
}
