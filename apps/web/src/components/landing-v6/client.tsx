'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSignedIn } from '@/components/landing-v5/ui';
import { useTerminalEntry } from '@/components/terminal-entry';
import { Ic } from './icons';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Art is drawn on a fixed canvas (e.g. 560×400) and scaled to its container,
 * so every drawing keeps its exact composition at any width.
 * `crop`: below this container width, scale against `crop` instead of `w`
 * (the hero keeps its centre object large on phones and lets the edges fall off).
 */
export function Stage({ w, h, crop, maxScale = 1.25, fill = false, children }: {
  w: number; h: number; crop?: number; maxScale?: number; fill?: boolean; children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ s: number; left: number; top: number; height?: number } | null>(null);

  useIsoLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      const s = crop && cw < crop ? cw / crop : Math.min(maxScale, cw / w);
      // `fill`: the box is pinned to its panel (CSS), so centre the drawing in it.
      if (fill) setFit({ s, left: (cw - w * s) / 2, top: (el.clientHeight - h * s) / 2 });
      else setFit({ s, left: (cw - w * s) / 2, top: 0, height: h * s });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h, crop, maxScale, fill]);

  return (
    <div ref={box} className={`stage-box ${fill ? 'is-fill' : ''}`} style={{ height: fill ? undefined : fit?.height ?? h, visibility: fit ? 'visible' : 'hidden' }}>
      <div className="stage" style={{ width: w, height: h, left: fit?.left ?? 0, top: fit?.top ?? 0, transform: `scale(${fit?.s ?? 1})` }}>
        {children}
      </div>
    </div>
  );
}

/** Primary CTA: signed-out → /signup; signed-in → the app (through the access gate). */
export function StartCta({ children = 'Start journaling free', size = 'lg', testId }: { children?: ReactNode; size?: 'lg' | 'sm'; testId?: string }) {
  const signedIn = useSignedIn();
  const { enterTerminal, checking, InactiveModal } = useTerminalEntry();
  const cls = size === 'sm' ? 'btn btn-white btn-sm' : 'btn btn-green';
  const label = checking ? 'Opening…' : signedIn ? 'Open dashboard' : size === 'sm' ? 'Start free' : children;
  const arrow = size === 'lg' ? <Ic name="arrow" stroke={2.2} /> : null;
  if (!signedIn) return <a className={cls} href="/signup" data-testid={testId}>{label}{arrow}</a>;
  return (
    <>
      <button type="button" className={cls} onClick={() => void enterTerminal('/dashboard')} disabled={checking} aria-busy={checking} data-testid={testId}>
        {label}{arrow}
      </button>
      {InactiveModal}
    </>
  );
}

export function SignInLink() {
  const signedIn = useSignedIn();
  if (signedIn) return null;
  return <a className="ghost" href="/login">Sign in</a>;
}

/** Nav links with scroll-spy: the section in the band under the nav is current. */
export function NavLinks({ links }: { links: readonly { href: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = links.map(l => document.getElementById(l.href.slice(1))).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { rootMargin: '-45% 0px -50% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [links]);
  return (
    <nav className="nav-links" aria-label="Primary">
      {links.map(l => (
        <a key={l.href} href={l.href} aria-current={active === l.href.slice(1) ? 'true' : undefined}>{l.label}</a>
      ))}
    </nav>
  );
}

/** FAQ: buttons with aria-expanded; the first answer starts open. */
export function Faq({ items }: { items: readonly { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div>
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q} className={`qa ${isOpen ? 'open' : ''}`}>
            <h3>
              <button type="button" aria-expanded={isOpen} aria-controls={`lp6-faq-${i}`} id={`lp6-faq-q-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                <span className="pm" aria-hidden />{it.q}
              </button>
            </h3>
            <div className="a" id={`lp6-faq-${i}`} role="region" aria-labelledby={`lp6-faq-q-${i}`} hidden={!isOpen}>{it.a}</div>
          </div>
        );
      })}
    </div>
  );
}
