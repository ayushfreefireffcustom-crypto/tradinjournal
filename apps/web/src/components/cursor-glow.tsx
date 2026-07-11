'use client';

import { useEffect, useRef } from 'react';

// A subtle soft white glow that trails the cursor with a little easing.
// Desktop / fine-pointer only, and disabled under reduced-motion.
export default function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const el = ref.current;
    if (!el) return;

    let x = 0, y = 0, raf = 0, dirty = false, seen = false;

    // Follow the pointer exactly (no easing → no lag). We only defer the DOM
    // write to the next frame to avoid layout thrash on rapid pointermove.
    const flush = () => {
      raf = 0;
      if (!dirty) return;
      dirty = false;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    };
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      dirty = true;
      if (!seen) { seen = true; el.style.opacity = '1'; }
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const leave = () => { el.style.opacity = '0'; };
    const enter = () => { if (seen) el.style.opacity = '1'; };

    window.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerleave', leave);
    document.addEventListener('pointerenter', enter);

    return () => {
      window.removeEventListener('pointermove', move);
      document.removeEventListener('pointerleave', leave);
      document.removeEventListener('pointerenter', enter);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} aria-hidden className="cursor-glow" />;
}
