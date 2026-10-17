'use client';

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';
import { useTerminalEntry } from '@/components/terminal-entry';

// ── Icons (1.7 stroke, round caps — one family across the page) ────────────
type IconProps = { className?: string };
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const ArrowRight = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const ArrowDown = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden className={className} {...base}><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);
export const CheckIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 16 16" aria-hidden className={className} {...base} strokeWidth={2.2}><path d="M3.5 8.5l3 3 6-7" /></svg>
);
export const GridIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden {...base} strokeWidth={1.7}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>
);
export const ReplayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden {...base} strokeWidth={1.7}><path d="M4 5v14h16" /><path d="M8 14l3-4 3 2 5-6" /></svg>
);
export const ChatIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden {...base} strokeWidth={1.7}><path d="M4 5h16v11H9l-5 4z" /></svg>
);

// ── Wordmark ───────────────────────────────────────────────────────────────
export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`lp-wm ${className}`}>TRADE<span>logs</span></span>;
}

// ── Reveal: fades/rises children in once when they enter the viewport ─────
export function Reveal({
  as: Tag = 'div', className = '', delay = 0, children, ...rest
}: { as?: ElementType; className?: string; delay?: number; children: ReactNode } & Record<string, unknown>) {
  const ref = useInViewOnce<HTMLElement>();
  return (
    <Tag ref={ref.ref} className={`lp-rv ${ref.inView ? 'is-in' : ''} ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties} {...rest}>
      {children}
    </Tag>
  );
}

/** Element enters viewport → inView stays true. Used for reveals and chart draw-ins. */
export function useInViewOnce<T extends Element>(rootMargin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setInView(true); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setInView(true); io.disconnect(); }
    }, { rootMargin, threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return { ref, inView };
}

/** Counts 0 → value once `run` flips true (ease-out, ~1.1s). Snaps under reduced motion. */
export function useCountUp(value: number, run: boolean, duration = 1100) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, value, duration]);
  return n;
}

// ── Primary CTA: signed-out → /signup, signed-in → app (with access gate) ─
export function StartButton({
  variant = 'acc', children = 'Start free', className = '', testId,
}: { variant?: 'acc' | 'white'; children?: ReactNode; className?: string; testId?: string }) {
  const { data: session } = authClient.useSession();
  const { enterTerminal, checking, InactiveModal } = useTerminalEntry();
  const cls = `lp-btn lp-btn--${variant} ${className}`;
  const inner = (
    <>
      <span>{checking ? 'Opening…' : session?.session ? 'Open dashboard' : children}</span>
      <span className="lp-ar"><ArrowRight /></span>
    </>
  );
  if (!session?.session) {
    return <a href="/signup" className={cls} data-testid={testId}>{inner}</a>;
  }
  return (
    <>
      <button type="button" className={cls} onClick={() => void enterTerminal('/dashboard')} disabled={checking} aria-busy={checking} data-testid={testId}>
        {inner}
      </button>
      {InactiveModal}
    </>
  );
}
