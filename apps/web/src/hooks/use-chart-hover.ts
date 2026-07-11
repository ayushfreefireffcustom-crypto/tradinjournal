'use client';

import { useCallback, useRef, useState } from 'react';

export interface HoverPos { xFrac: number; yFrac: number }

// Tracks the pointer position (as fractions 0..1 of the container) for chart
// crosshair/tooltips. Charts that use `preserveAspectRatio="none"` SVGs work in
// fractions so the non-uniform scaling doesn't matter. Supports mouse + touch.
export function useChartHover<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<HoverPos | null>(null);

  const update = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ xFrac: (clientX - r.left) / r.width, yFrac: (clientY - r.top) / r.height });
  }, []);

  const hoverProps = {
    onPointerMove: (e: React.PointerEvent) => update(e.clientX, e.clientY),
    onPointerDown: (e: React.PointerEvent) => update(e.clientX, e.clientY),
    onPointerLeave: () => setPos(null),
  };

  return { ref, pos, hoverProps };
}
