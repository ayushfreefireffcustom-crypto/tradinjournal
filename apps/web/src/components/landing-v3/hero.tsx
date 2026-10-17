'use client';

import { useEffect, useRef } from 'react';
import { ArrowDown, StartButton } from './ui';

const BROKERS = ['XM', 'Elefin', 'Xellion', 'Exness', 'Vantage'];

export default function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const shotRef = useRef<HTMLDivElement>(null);

  // The product shot leans ±1.5° toward the pointer — fine pointers only.
  useEffect(() => {
    const hero = heroRef.current, shot = shotRef.current;
    if (!hero || !shot) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0, x = 0, y = 0;
    const apply = () => { raf = 0; shot.style.setProperty('--rx', `${x * 1.5}deg`); shot.style.setProperty('--ry', `${-y * 1.5}deg`); };
    const move = (e: PointerEvent) => {
      const r = hero.getBoundingClientRect();
      x = (e.clientX - r.left) / r.width - 0.5;
      y = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const leave = () => { x = 0; y = 0; if (!raf) raf = requestAnimationFrame(apply); };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    return () => { hero.removeEventListener('pointermove', move); hero.removeEventListener('pointerleave', leave); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <section ref={heroRef} className="lp-hero lp-dark" id="top" aria-labelledby="hero-title">
      <div className="lp-hero-dots" aria-hidden />
      <div className="lp-hero-glow" aria-hidden />
      <div className="lp-hero-floor" aria-hidden />
      <div className="lp-hero-floorline" aria-hidden />

      <div className="lp-wrap">
        <div className="lp-hero-copy">
          <h1 id="hero-title">Your trades know.<br /><em>Now</em> you will too.</h1>
          <p className="lp-hero-sub">
            Connect MetaTrader&nbsp;5 with a read-only login. Every fill is journaled, every habit measured, and every Monday you get one thing to fix.
          </p>
          <div className="lp-hero-ctas">
            <StartButton testId="hero-start" />
            <a href="#how" className="lp-btn lp-btn--ghost">See how it works <ArrowDown /></a>
          </div>
        </div>
      </div>

      <div className="lp-shot-stage">
        <div ref={shotRef} className="lp-shot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/dashboard.jpg"
            width={1720}
            height={1075}
            alt="TRADElogs dashboard showing net P&L, equity curve, win rate, profit factor and this week's review"
            fetchPriority="high"
            decoding="async"
          />
        </div>
      </div>

      <div className="lp-phone-shot">
        <div className="lp-phone">
          <span className="lp-phone-island" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/dashboard-mobile.jpg" width={810} height={1753} alt="TRADElogs mobile dashboard" loading="lazy" decoding="async" />
        </div>
      </div>

      <div className="lp-trust">
        <div className="lp-wrap">
          <p>Syncs read-only with every MT5 broker</p>
          <ul aria-label="Supported brokers include">
            <li>MetaTrader<small>MT5</small></li>
            {BROKERS.map(b => <li key={b}>{b}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
