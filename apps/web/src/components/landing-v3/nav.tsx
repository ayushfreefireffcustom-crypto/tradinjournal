'use client';

import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { ArrowRight, StartButton, Wordmark } from './ui';

export const NAV_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#behaviour', label: 'Behaviour' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
] as const;

export default function Nav() {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const { data: session } = authClient.useSession();

  // Glass bar once the page scrolls; transparent over the hero top.
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll-spy: the section occupying the band just below the nav is "current".
  useEffect(() => {
    const ids = NAV_LINKS.map(l => l.href.slice(1));
    const els = ids.map(id => document.getElementById(id)).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { rootMargin: '-45% 0px -50% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Mobile sheet: Escape closes, body doesn't scroll behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  const signedIn = !!session?.session;

  return (
    <>
      <header className={`lp-nav ${stuck || open ? 'is-stuck' : 'is-top'} ${open ? 'is-open' : ''}`}>
        <div className="lp-wrap">
          <a href="#top" aria-label="TRADElogs home" onClick={() => setOpen(false)}><Wordmark /></a>
          <nav aria-label="Primary">
            <ul className="lp-nav-links">
              {NAV_LINKS.map(l => (
                <li key={l.href}>
                  <a href={l.href} aria-current={active === l.href.slice(1) ? 'true' : undefined}>{l.label}</a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="lp-nav-r">
            {!signedIn && <a href="/login" className="lp-nav-signin">Sign in</a>}
            <a href={signedIn ? '/dashboard' : '/signup'} className="lp-nav-cta" data-testid="nav-start">
              {signedIn ? 'Dashboard' : 'Start free'} <ArrowRight />
            </a>
            <button
              type="button"
              className="lp-burger"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="lp-sheet"
              onClick={() => setOpen(o => !o)}
            >
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      <div id="lp-sheet" className={`lp-sheet ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open}>
        {NAV_LINKS.map(l => (
          <a key={l.href} href={l.href} className="lp-sheet-link" onClick={() => setOpen(false)}>
            {l.label} <ArrowRight />
          </a>
        ))}
        <div className="lp-sheet-ctas">
          <StartButton />
          {!signedIn && <a href="/login" className="lp-btn lp-btn--ghost">Sign in</a>}
        </div>
      </div>
    </>
  );
}
