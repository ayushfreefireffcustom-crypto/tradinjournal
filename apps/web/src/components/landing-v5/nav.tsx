'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, StartButton, Wordmark, useSignedIn } from './ui';
import { PARTNERS_ENABLED } from '@/lib/features';

export const NAV_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#behaviour', label: 'Behaviour engine' },
  { href: '#ai', label: 'AI coach' },
  { href: '#security', label: 'Security' },
  { href: '#faq', label: 'FAQ' },
] as const;

// Symbols people journal most — a label strip, not live prices.
const TICKER = [
  ['XAUUSD', 'Metals'], ['EURUSD', 'Forex'], ['NAS100', 'Indices'], ['GBPUSD', 'Forex'], ['BTCUSD', 'Crypto'],
  ['US30', 'Indices'], ['USDJPY', 'Forex'], ['GBPJPY', 'Forex'], ['XAGUSD', 'Metals'], ['ETHUSD', 'Crypto'],
] as const;

export function Announcement() {
  return (
    <div className="l5-ann">
      <span className="l5-ann-tag">NEW</span>
      <span><b>SignalX</b> <span className="l5-ann-long">— AI technical analysis on any symbol, inside your journal.</span></span>
      <a href="#ai">Take a look <ArrowRight /></a>
    </div>
  );
}

export function Ticker() {
  const row = TICKER.map(([s, k]) => <li key={s}><b>{s}</b><span>{k}</span></li>);
  return (
    <div className="l5-tick" aria-hidden>
      <ul>{row}{row}</ul>
    </div>
  );
}

export default function Nav() {
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const onScroll = () => { setStuck(window.scrollY > 60); if (window.scrollY < 400) setActive(null); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll-spy: the section in the band just below the nav is "current".
  useEffect(() => {
    const els = NAV_LINKS.map(l => document.getElementById(l.href.slice(1))).filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
    }, { rootMargin: '-45% 0px -50% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Mobile sheet: Escape closes, page doesn't scroll behind it, closes when widened.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = () => { if (mq.matches) setOpen(false); };
    document.addEventListener('keydown', onKey);
    mq.addEventListener('change', onMq);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); mq.removeEventListener('change', onMq); document.body.style.overflow = prev; };
  }, [open]);

  const signedIn = useSignedIn();

  return (
    <>
      <header className={`l5-nav ${stuck || open ? 'is-stuck' : ''} ${open ? 'is-open' : ''}`}>
        <div className="l5-wrap">
          <a href="#top" aria-label="TRADElogs home" onClick={() => setOpen(false)}><Wordmark /></a>
          <nav aria-label="Primary" className="l5-links">
            {NAV_LINKS.map(l => (
              <a key={l.href} href={l.href} aria-current={active === l.href.slice(1) ? 'true' : undefined}>{l.label}</a>
            ))}
          </nav>
          <div className="l5-nav-r">
            {!signedIn && <a href="/login" className="l5-signin">Sign in</a>}
            <a href={signedIn ? '/dashboard' : '/signup'} className="l5-btn l5-btn--acc l5-btn--sm" data-testid="nav-start">
              <span>{signedIn ? 'Dashboard' : 'Start free'}</span><span className="l5-ar"><ArrowRight /></span>
            </a>
            <button type="button" className="l5-burger" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="l5-sheet" onClick={() => setOpen(o => !o)}>
              <span /><span /><span />
            </button>
          </div>
        </div>
      </header>

      <div id="l5-sheet" className={`l5-sheet ${open ? 'is-open' : ''}`} aria-hidden={!open} inert={!open}>
        {NAV_LINKS.map(l => (
          <a key={l.href} href={l.href} className="l5-sheet-link" onClick={() => setOpen(false)}>{l.label} <ArrowRight /></a>
        ))}
        {PARTNERS_ENABLED && <a href="#partners" className="l5-sheet-link" onClick={() => setOpen(false)}>Partners <ArrowRight /></a>}
        <div className="l5-sheet-ctas">
          <StartButton />
          {!signedIn && <a href="/login" className="l5-btn l5-btn--beam">Sign in</a>}
        </div>
      </div>
    </>
  );
}
