'use client';

import { useEffect, useRef } from 'react';
import { Ticker } from './nav';
import { StartButton } from './ui';

const BROKERS = ['XM', 'Exness', 'Vantage', 'Elefin', 'Xellion', 'IC Markets', 'Pepperstone', 'FBS'];

const Shield = () => <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden><path d="M8 1.5 2.5 3.8v4c0 3.2 2.3 5.6 5.5 6.7 3.2-1.1 5.5-3.5 5.5-6.7v-4L8 1.5Z" stroke="currentColor" strokeWidth="1.4" /><path d="m5.6 8 1.7 1.7 3.2-3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
const Clock = () => <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden><circle cx="8" cy="8" r="6.2" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.6V8l2.2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
const Card = () => <svg viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden><rect x="2" y="4" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M2 7h12" stroke="currentColor" strokeWidth="1.4" /></svg>;

export default function Hero() {
  const stage = useRef<HTMLDivElement>(null);

  // The product shot starts tilted back and flattens as the page scrolls.
  useEffect(() => {
    const el = stage.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const apply = () => { raf = 0; const k = Math.min(1, window.scrollY / 600); el.style.setProperty('--tilt', `${10 - 10 * k}deg`); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <section className="l5-hero" id="top" aria-labelledby="hero-title">
      <div className="l5-hero-light" aria-hidden />
      <Ticker />

      <div className="l5-wrap l5-hero-c">
        <span className="l5-pill"><b>MT5</b>Read-only sync with every MetaTrader 5 broker</span>
        <h1 id="hero-title">The <span className="l5-nw">AI-powered</span><br />trading <span className="l5-s">journal.</span></h1>
        <p className="l5-hero-sub">Connect MetaTrader&nbsp;5 with a read-only login. Every trade is journaled and graded on process, your leaks are ranked in dollars, and an AI coach that knows your trades tells you what to fix.</p>
        <div className="l5-hero-ctas">
          <StartButton testId="hero-start">Start journaling free</StartButton>
          <a href="#product" className="l5-btn l5-btn--beam">See the product</a>
        </div>
        <ul className="l5-hero-meta">
          <li><Shield />Read-only investor password</li>
          <li><Clock />90-second setup</li>
          <li><Card />Free — no card</li>
        </ul>
      </div>

      <div className="l5-stage" ref={stage}>
        <div className="l5-stage-in">
          <div className="l5-frame">
            <picture>
              <source media="(max-width: 640px)" srcSet="/landing/dashboard-v6-mobile.jpg" width={780} height={1688} />
              <img src="/landing/dashboard-v6.jpg" width={2160} height={1350} fetchPriority="high" decoding="async"
                alt="TRADElogs dashboard: a Next up card to review yesterday's trades that broke a rule, net P&L, win rate, profit factor, max drawdown, the equity curve with revenge trades marked, and leaks ranked by dollars lost" />
            </picture>
          </div>
        </div>
        <div className="l5-stage-fade" aria-hidden />
      </div>

      <div className="l5-trust">
        <p>Syncs read-only with any MetaTrader 5 broker</p>
        <div className="l5-mq">
          <ul aria-label="Supported brokers include">
            {[0, 1].map(k => (
              <li key={k} className="l5-mq-set" aria-hidden={k === 1 || undefined}>
                <span>MetaTrader<small>MT5</small></span>
                {BROKERS.map(b => <span key={b}>{b}</span>)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
