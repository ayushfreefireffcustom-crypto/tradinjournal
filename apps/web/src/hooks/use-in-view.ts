'use client';

import { useEffect, useRef, useState } from 'react';

// Returns [ref, inView] — inView flips to true once the element first enters the
// viewport (then stays true). Used to trigger chart draw-in on scroll. If
// IntersectionObserver is unavailable, defaults to true (animate immediately).
export function useInView<T extends HTMLElement = HTMLDivElement>(rootMargin = '0px 0px -10% 0px'): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }

    const obs = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) { setInView(true); obs.disconnect(); break; }
        }
      },
      { rootMargin, threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [rootMargin]);

  return [ref, inView];
}
