'use client';

import { useEffect, useState } from 'react';
import Logo from '@/components/logo';

// A small "living" left panel used by the auth pages. It shows a stripped-down
// equity feed, a testimonial slot, and trust badges so the auth screens feel
// like part of a live terminal rather than a landing splash.

function MiniEquity() {
  const [seed, setSeed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeed(s => (s + 1) % 32), 2400);
    return () => clearInterval(t);
  }, []);

  const base = [22, 25, 24, 30, 28, 34, 32, 39, 37, 44, 42, 49, 47, 55, 60, 57, 66, 63, 71, 79, 76, 84];
  const points = base.map((v, i) => v + (Math.sin((i + seed) / 3) * 2));
  const W = 460, H = 130;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const xs = (i: number) => 8 + (i / (points.length - 1)) * (W - 16);
  const ys = (v: number) => H - 6 - ((v - min) / span) * (H - 26);
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(v)}`).join(' ');
  const area = `${path} L ${xs(points.length - 1)} ${H} L ${xs(0)} ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 140 }}>
      <defs>
        <linearGradient id="mini-eq" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"  stopColor="#08C465" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#08C465" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={0} x2={W} y1={H * p} y2={H * p} stroke="#1E1E1E" strokeDasharray="2 4" />
      ))}
      <path d={area} fill="url(#mini-eq)" />
      <path d={path} stroke="#08C465" strokeWidth="1.5" fill="none" />
      <circle cx={xs(points.length - 1)} cy={ys(points[points.length - 1]!)} r="3.5" fill="#08C465" />
      <circle cx={xs(points.length - 1)} cy={ys(points[points.length - 1]!)} r="8" fill="#08C465" opacity="0.2" />
    </svg>
  );
}

function AuthTicker() {
  const rows = [
    { sym: 'XAUUSD', v: '2,387.42', d: '+0.84%' },
    { sym: 'NAS100', v: '19,217.5', d: '+1.05%' },
    { sym: 'EURUSD', v: '1.08914',  d: '-0.12%' },
    { sym: 'BTCUSD', v: '67,420',   d: '+2.41%' },
    { sym: 'USDJPY', v: '151.882',  d: '+0.21%' },
    { sym: 'US30',   v: '38,742',   d: '-0.07%' },
  ];
  const doubled = [...rows, ...rows];
  return (
    <div className="border-y border-border bg-app overflow-hidden">
      <div className="marquee-track flex gap-8 py-2 whitespace-nowrap">
        {doubled.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className="text-fg-3 tracking-[0.18em]">{r.sym}</span>
            <span className="text-fg numeric">{r.v}</span>
            <span className={r.d.startsWith('+') ? 'text-profit numeric' : 'text-loss numeric'}>{r.d}</span>
            <span className="text-border-strong">/</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuthAside({ variant }: { variant: 'signin' | 'signup' }) {
  const stats = variant === 'signin'
    ? [
        { l: 'Traders online', v: '2,148' },
        { l: 'Median R:R',     v: '1:2.4' },
        { l: 'Bridge latency', v: '38ms' },
      ]
    : [
        { l: 'Free tier',       v: '$0' },
        { l: 'Setup time',      v: '90s' },
        { l: 'MT5 accounts',    v: '1' },
      ];

  return (
    <aside className="hidden lg:flex flex-col border-r border-border relative overflow-hidden min-h-screen" data-testid={`auth-aside-${variant}`}>
      {/* Grid + gradient wash */}
      <div className="absolute inset-0 bg-grid bg-grid-fade opacity-30" />
      <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full opacity-30 blur-3xl" style={{ background: 'radial-gradient(circle, rgba(0,197,102,0.35) 0%, transparent 70%)' }} />

      {/* Top status bar */}
      <div className="relative z-10 border-b border-border h-12 flex items-center justify-between px-6 text-[10px] tracking-[0.22em] text-fg-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-profit pulse-dot" />
          MT5 BRIDGE · ONLINE
        </div>
        <span>SESSION · LONDON</span>
        <span className="numeric">v2.6.1</span>
      </div>

      {/* Ticker */}
      <AuthTicker />

      {/* Hero body */}
      <div className="relative z-10 flex-1 flex flex-col justify-center px-8 xl:px-12 py-12">
        <div className="w-full max-w-xl mx-auto">
          <div className="flex items-center gap-2.5 mb-8">
            <Logo height={30} />
            <span className="ml-auto text-[10px] tracking-[0.22em] text-fg-3">// PRECISION JOURNAL</span>
          </div>

          <p className="text-[10px] tracking-[0.3em] text-fg-3 mb-3">
            [ {variant === 'signin' ? 'WELCOME BACK' : 'GET STARTED'} ]
          </p>
          <h2 className="font-display font-black tracking-tighter text-4xl xl:text-5xl leading-[1.02]">
            {variant === 'signin' ? (
              <>TRADE <br /> WITH <span className="text-profit">CLARITY.</span></>
            ) : (
              <>START <br /> FOR <span className="text-profit">FREE.</span></>
            )}
          </h2>
          <p className="text-fg-2 text-[12px] xl:text-[13px] mt-5 max-w-md leading-relaxed">
            {variant === 'signin'
              ? 'All your trades imported from MT5, with clear insights ready and waiting. Sign in to pick up right where you left off.'
              : 'Connect your MT5 in 90 seconds and see your insights by tomorrow morning. Read-only login, fully encrypted, and we never touch your trades.'}
          </p>

          {/* Mini equity terminal */}
          <div className="mt-8 tcard p-4 bg-app/70 backdrop-blur-sm max-w-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] tracking-[0.22em] text-fg-3">EQUITY_FEED</span>
                <span className="text-[10px] text-profit">● LIVE</span>
              </div>
              <div className="text-right">
                <div className="font-display font-black text-lg tracking-tighter">+$12,418</div>
                <div className="text-[9px] tracking-widest text-profit numeric">▲ +49.7% YTD</div>
              </div>
            </div>
            <MiniEquity />
          </div>

          {/* Stats strip */}
          <div className="mt-6 grid grid-cols-3 max-w-md border border-border">
            {stats.map(s => (
              <div key={s.l} className="border-r border-border last:border-r-0 px-4 py-3">
                <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{s.l}</div>
                <div className="font-display font-black text-2xl mt-1 tracking-tight">{s.v}</div>
              </div>
            ))}
          </div>

          {/* Trust badges */}
          <div className="mt-8 flex flex-wrap gap-2 max-w-lg">
            {[
              { icon: '◈', l: 'READ-ONLY MT5' },
              { icon: '◇', l: 'AES-256 AT REST' },
              { icon: '◆', l: 'SOC2 II' },
              { icon: '◉', l: '99.98% UPTIME' },
            ].map(b => (
              <span key={b.l} className="flex items-center gap-2 border border-border-soft px-2.5 py-1.5 text-[10px] tracking-[0.18em] text-fg-2">
                <span className="text-profit">{b.icon}</span>
                {b.l}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Footer strip */}
      <div className="relative z-10 border-t border-border h-11 flex items-center justify-between px-6 text-[10px] tracking-[0.22em] text-fg-3">
        <span>EST · 2026</span>
        <span className="flex items-center gap-4">
          <a href="#" className="hover:text-fg">PRIVACY</a>
          <a href="#" className="hover:text-fg">TERMS</a>
          <a href="#" className="hover:text-fg">STATUS</a>
        </span>
      </div>
    </aside>
  );
}
