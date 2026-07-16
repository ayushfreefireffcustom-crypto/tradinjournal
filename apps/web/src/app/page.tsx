'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Logo from '@/components/logo';
import Reveal from '@/components/reveal';
import BrowserFrame from '@/components/browser-frame';

// ── Tiny presentational primitives ────────────────────────────────────────────

function TickerTape() {
  const tickers = [
    { sym: 'XAUUSD', val: '2,387.42', d: '+0.84%' },
    { sym: 'EURUSD', val: '1.08914', d: '-0.12%' },
    { sym: 'GBPUSD', val: '1.27220', d: '+0.34%' },
    { sym: 'USDJPY', val: '151.882', d: '+0.21%' },
    { sym: 'NAS100', val: '19,217.5', d: '+1.05%' },
    { sym: 'US30',   val: '38,742.1', d: '-0.07%' },
    { sym: 'BTCUSD', val: '67,420',   d: '+2.41%' },
    { sym: 'DXY',    val: '104.18',   d: '-0.18%' },
  ];
  const row = [...tickers, ...tickers, ...tickers];
  return (
    <div className="border-y border-border bg-surface overflow-hidden" data-testid="ticker-tape">
      <div className="marquee-track flex gap-12 py-2 whitespace-nowrap">
        {row.map((t, i) => {
          const up = t.d.startsWith('+');
          return (
            <div key={i} className="flex items-center gap-3 text-[11px]">
              <span className="text-fg-3 tracking-[0.18em]">{t.sym}</span>
              <span className="text-fg numeric">{t.val}</span>
              <span className={up ? 'text-profit numeric' : 'text-loss numeric'}>{t.d}</span>
              <span className="text-border-strong">/</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SyntheticChart({ height = 240 }: { height?: number }) {
  // Static equity line drawn in SVG so it always looks identical.
  const points = [12, 18, 14, 22, 19, 26, 24, 31, 28, 35, 33, 41, 38, 47, 52, 49, 58, 55, 62, 71, 68, 76, 82, 79];
  const W = 720, H = height, PAD = 8;
  const max = Math.max(...points), min = Math.min(...points);
  const span = max - min || 1;
  const xs = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const ys = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xs(i)} ${ys(v)}`).join(' ');
  const area = `${path} L ${xs(points.length - 1)} ${H} L ${xs(0)} ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={0} y1={H * p} x2={W} y2={H * p} stroke="#1E1E1E" strokeDasharray="2 4" />
      ))}
      <path d={area} fill="rgba(8,196,101,0.08)" />
      <path d={path} stroke="#08C465" strokeWidth="1.5" fill="none" pathLength={1} className="draw-in" style={{ ['--draw-dur' as string]: '1400ms' }} />
      <circle cx={xs(points.length - 1)} cy={ys(points[points.length - 1]!)} r="3" fill="#08C465" />
    </svg>
  );
}

function Candlesticks() {
  const candles = [
    [40, 55, 30, 50, 'up'], [50, 60, 45, 48, 'down'], [48, 52, 38, 44, 'down'],
    [44, 58, 42, 56, 'up'], [56, 70, 52, 68, 'up'], [68, 72, 60, 62, 'down'],
    [62, 78, 60, 76, 'up'], [76, 82, 70, 72, 'down'], [72, 88, 68, 86, 'up'],
    [86, 90, 78, 80, 'down'], [80, 100, 78, 96, 'up'], [96, 110, 92, 104, 'up'],
    [104, 108, 88, 92, 'down'], [92, 112, 88, 110, 'up'], [110, 124, 106, 122, 'up'],
  ] as const;
  const W = 480, H = 220, GAP = 8;
  const cw = (W - GAP * (candles.length + 1)) / candles.length;
  const max = 130, min = 24;
  const ys = (v: number) => 20 + (1 - (v - min) / (max - min)) * (H - 40);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={0} y1={H * p} x2={W} y2={H * p} stroke="#1E1E1E" strokeDasharray="2 4" />
      ))}
      {candles.map(([o, h, l, c, dir], i) => {
        const x = GAP + i * (cw + GAP);
        const color = dir === 'up' ? '#08C465' : '#FE3A31';
        const top = ys(Math.max(o, c));
        const bot = ys(Math.min(o, c));
        return (
          <g key={i}>
            <line x1={x + cw / 2} y1={ys(h)} x2={x + cw / 2} y2={ys(l)} stroke={color} strokeWidth="1" />
            <rect x={x} y={top} width={cw} height={Math.max(2, bot - top)} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}

// Behavioural-score radar (green hexagon). Purely decorative, fixed values.
function RadarScore() {
  const axes = ['Discipline', 'Patience', 'Risk', 'Timing', 'Consistency', 'Focus'];
  const vals = [0.9, 0.72, 0.86, 0.6, 0.8, 0.68];
  const cx = 130, cy = 118, R = 84;
  const pt = (i: number, r: number): [number, number] => {
    const ang = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
    return [cx + Math.cos(ang) * R * r, cy + Math.sin(ang) * R * r];
  };
  const ring = (r: number) => axes.map((_, i) => pt(i, r).join(',')).join(' ');
  const poly = vals.map((v, i) => pt(i, v).join(',')).join(' ');
  return (
    <svg viewBox="0 0 260 236" className="w-full max-w-[280px] mx-auto">
      {[0.25, 0.5, 0.75, 1].map(r => (
        <polygon key={r} points={ring(r)} fill="none" stroke="#1E1E1E" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#1E1E1E" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="rgba(8,196,101,0.16)" stroke="#08C465" strokeWidth="1.5" />
      {vals.map((v, i) => { const [x, y] = pt(i, v); return <circle key={i} cx={x} cy={y} r="2.5" fill="#08C465" />; })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.16);
        return <text key={a} x={x} y={y} fontSize="8" fill="#8A8A8A" textAnchor="middle" dominantBaseline="middle" style={{ letterSpacing: '0.08em' }}>{a.toUpperCase()}</text>;
      })}
    </svg>
  );
}

// ── Hero dashboard mockup (parallax-scaled) ──────────────────────────────────

function useParallaxScale() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const update = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      // 0 when the top edge sits at the bottom of the viewport, 1 when it reaches the top.
      const p = Math.min(1, Math.max(0, 1 - rect.top / vh));
      const scale = (0.94 + p * 0.06).toFixed(4);
      el.style.transform = `scale(${scale})`;
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, []);
  return ref;
}

function HeroMockup() {
  const parallax = useParallaxScale();
  const kpis = [
    { l: 'NET P&L',       v: '+$4,142', c: 'text-profit' },
    { l: 'WIN RATE',      v: '64.1%',   c: 'text-fg' },
    { l: 'PROFIT FACTOR', v: '1.90',    c: 'text-fg' },
    { l: 'BEST DAY',      v: '+$1,634', c: 'text-profit' },
  ];
  return (
    <div ref={parallax} className="will-change-transform origin-top" style={{ transform: 'scale(0.94)' }}>
      <BrowserFrame url="tradelogs.com/dashboard" status={<span className="text-profit">● LIVE</span>} testId="hero-mockup">
        <div className="p-3 sm:p-5">
          {/* Header row */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="min-w-0">
              <div className="text-[10px] sm:text-[11px] text-fg-3 tracking-widest truncate">Good morning, trader</div>
              <div className="font-display font-black text-2xl sm:text-4xl tracking-tighter mt-1 text-profit">+$4,142.00</div>
            </div>
            <span className="btn btn-ghost py-1.5 text-[10px] shrink-0 hidden sm:inline-flex">↻ SYNC NOW</span>
          </div>
          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
            {kpis.map(k => (
              <div key={k.l} className="border border-border-soft px-3 py-2.5">
                <div className="text-[9px] tracking-[0.18em] text-fg-3 uppercase">{k.l}</div>
                <div className={`font-display font-black text-lg sm:text-xl mt-1 tracking-tight ${k.c}`}>{k.v}</div>
              </div>
            ))}
          </div>
          {/* Chart + side panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3">
            <div className="lg:col-span-2 border border-border-soft p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] tracking-[0.18em] text-fg-3 uppercase">Equity curve</span>
                <span className="text-[9px] text-profit tracking-widest">▲ +49.7% YTD</span>
              </div>
              <SyntheticChart height={150} />
            </div>
            <div className="border border-border-soft p-3 flex flex-col justify-between">
              <span className="text-[9px] tracking-[0.18em] text-fg-3 uppercase">Trade score</span>
              <div className="font-display font-black text-4xl sm:text-5xl tracking-tighter text-profit">66</div>
              <div className="text-[9px] tracking-widest text-fg-3 uppercase">Improving · top 20%</div>
            </div>
          </div>
        </div>
      </BrowserFrame>
    </div>
  );
}

// ── How-it-works stepper (accordion synced to a right-side visual) ────────────

function StepBars({ items }: { items: { l: string; v: number; c: string }[] }) {
  return (
    <div className="flex flex-col gap-4 w-full">
      {items.map((b, i) => (
        <div key={b.l}>
          <div className="flex items-center justify-between text-[10px] tracking-[0.18em] text-fg-3 uppercase mb-1.5">
            <span>{b.l}</span><span className="numeric text-fg-2">{b.v}%</span>
          </div>
          <div className="h-1.5 bg-border-soft rounded-full overflow-hidden">
            <div className="h-full rounded-full grow-y" style={{ width: `${b.v}%`, background: b.c, transformOrigin: 'left', ['--i' as string]: i }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  {
    key: 'connect',
    title: 'Connect your broker',
    body: 'Link your MT5 account with a read-only login. Trades sync automatically — no manual entry, no CSV uploads.',
    label: 'CONNECTING',
    visual: (
      <div className="w-full">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.18em] text-fg-3 uppercase mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> Auto-sync successful
        </div>
        <div className="font-display font-black text-2xl tracking-tighter mb-3">32 trades imported</div>
        <div className="h-1.5 bg-border-soft rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-profit grow-y" style={{ width: '100%', transformOrigin: 'left' }} />
        </div>
        <div className="text-[10px] text-fg-3 tracking-widest mt-3 uppercase">MT5 · read-only · encrypted</div>
      </div>
    ),
  },
  {
    key: 'analyze',
    title: 'AI analyzes everything',
    body: 'Every trade is scanned for patterns, emotional bias, risk issues and strategy effectiveness — automatically.',
    label: 'ANALYZING',
    visual: (
      <StepBars items={[
        { l: 'Pattern recognition', v: 92, c: '#08C465' },
        { l: 'Emotional analysis', v: 78, c: '#FE3A31' },
        { l: 'Risk assessment', v: 85, c: '#08C465' },
        { l: 'Strategy scoring', v: 71, c: '#FFFFFF' },
      ]} />
    ),
  },
  {
    key: 'edge',
    title: 'Get your edge',
    body: 'Weekly summaries, behavioural scores and plain-English coaching based on your real trades — not generic advice.',
    label: 'YOUR EDGE',
    visual: (
      <div className="w-full">
        <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase mb-2">Weekly summary</div>
        <p className="text-[13px] text-fg-2 leading-relaxed">
          Your <span className="text-profit">London-session longs</span> are your strongest setup this week — <span className="text-profit numeric">+$1,240</span> across 12 trades. Losses cluster <span className="text-loss">after 3 PM UTC</span> — consider stopping earlier.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {['Best: London', 'Watch: revenge', 'Plan followed 94%'].map(t => (
            <span key={t} className="border border-border-soft px-2.5 py-1 text-[10px] tracking-widest text-fg-2 uppercase">{t}</span>
          ))}
        </div>
      </div>
    ),
  },
] as const;

// ── Live trades (rows reveal in sequence) ─────────────────────────────────────

const LIVE_ROWS = [
  { pair: 'GBPUSD', side: 'BUY',  size: '0.33', dur: '18m 22s', tag: 'Breakout', pnl: '+72.54',  up: true,  time: '12:18 UTC' },
  { pair: 'EURUSD', side: 'BUY',  size: '0.34', dur: '9m 33s',  tag: 'Pullback', pnl: '+295.88', up: true,  time: '11:41 UTC' },
  { pair: 'NZDUSD', side: 'BUY',  size: '0.37', dur: '24m 4s',  tag: 'Trend',    pnl: '+77.27',  up: true,  time: '11:05 UTC' },
  { pair: 'AUDUSD', side: 'SELL', size: '0.41', dur: '18m 22s', tag: 'Range',    pnl: '-101.87', up: false, time: '10:44 UTC' },
  { pair: 'AUDUSD', side: 'BUY',  size: '0.28', dur: '2h 05m',  tag: 'London',   pnl: '+68.89',  up: true,  time: '10:12 UTC' },
  { pair: 'AUDUSD', side: 'BUY',  size: '0.29', dur: '10m 44s', tag: 'FOMO',     pnl: '-72.53',  up: false, time: '09:33 UTC' },
  { pair: 'NZDUSD', side: 'SELL', size: '0.23', dur: '1h 24m',  tag: 'Reversal', pnl: '+269.03', up: true,  time: '09:01 UTC' },
  { pair: 'AUDUSD', side: 'SELL', size: '0.23', dur: '38m 18s', tag: 'Range',    pnl: '+93.91',  up: true,  time: '08:22 UTC' },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [tick, setTick] = useState(0);
  const [step, setStep] = useState(1);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-app text-fg overflow-x-hidden" data-testid="landing-page">
      {/* Nav */}
      <header className={`sticky top-0 z-40 backdrop-blur-xl transition-colors duration-[var(--dur-hover)] ${scrolled ? 'border-b border-border bg-app/90' : 'border-b border-transparent bg-app/60'}`} data-testid="landing-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0" data-testid="logo-link">
            <Logo height={28} />
          </Link>
          <nav className="hidden md:flex items-center gap-5 lg:gap-7 text-[12px] text-fg-2">
            <a href="#features" className="hover:text-fg transition-colors">FEATURES</a>
            <a href="#how" className="hover:text-fg transition-colors">HOW IT WORKS</a>
            <a href="#analytics" className="hover:text-fg transition-colors">ANALYTICS</a>
            <a href="#faq" className="hover:text-fg transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/login" className="btn btn-ghost hidden xs:inline-flex" data-testid="nav-signin">SIGN IN</Link>
            <Link href="/dashboard" className="btn btn-primary" data-testid="nav-open-terminal">
              <span className="hidden sm:inline">GET STARTED</span>
              <span className="sm:hidden">START</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </header>

      <TickerTape />

      {/* HERO — centered */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-60" />
        <div className="absolute left-1/2 -translate-x-1/2 top-[-120px] w-[900px] h-[900px] max-w-[140vw] glow-radial opacity-70" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pt-16 sm:pt-24 pb-10 sm:pb-14 text-center">
          <Reveal className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface/60 px-3 py-1.5 text-[10px] sm:text-[11px] tracking-[0.28em] text-fg-3">
            <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> SIMPLE INSIGHTS FOR EVERY TRADER
          </Reveal>
          <Reveal as="h1" delay={80} className="font-display font-black tracking-tighter text-[40px] sm:text-[60px] md:text-[72px] lg:text-[80px] leading-[0.95] mt-6">
            Understand your trading.<br />
            <span className="text-gradient-brand">Improve every day.</span>
          </Reveal>
          <Reveal as="p" delay={160} className="text-fg-2 mt-6 max-w-2xl mx-auto text-[13px] sm:text-[15px] leading-relaxed">
            TRADElogs connects to your MetaTrader 5 account and imports every trade for you. It shows you clear, easy-to-read insights about your habits — like impulse trades, chasing the market, and the times of day you tend to lose money.
          </Reveal>
          <Reveal delay={240} className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/dashboard" className="btn btn-primary px-6 py-3 text-[13px] justify-center" data-testid="hero-cta-launch">
              GET STARTED FREE
            </Link>
            <a href="#how" className="btn btn-ghost px-6 py-3 text-[13px] justify-center" data-testid="hero-cta-features">
              SEE HOW IT WORKS
            </a>
          </Reveal>
          {/* Trust stats */}
          <Reveal delay={320} className="mt-10 grid grid-cols-3 max-w-lg mx-auto border border-border">
            {[
              { l: 'Trades imported', v: '14.2M' },
              { l: 'Avg reward:risk', v: '1:2.4' },
              { l: 'Results improved', v: '+25%' },
            ].map(s => (
              <div key={s.l} className="border-r border-border last:border-r-0 px-3 sm:px-4 py-3">
                <div className="text-[9px] sm:text-[10px] tracking-[0.18em] text-fg-3 uppercase">{s.l}</div>
                <div className="font-display font-black text-xl sm:text-2xl mt-1 tracking-tight">{s.v}</div>
              </div>
            ))}
          </Reveal>
        </div>

        {/* Big dashboard mockup (parallax) */}
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 pb-16 sm:pb-24" data-testid="hero-terminal">
          <Reveal delay={120}>
            <HeroMockup />
            <div className="mt-3 flex items-center justify-between text-[10px] text-fg-3 tracking-[0.2em]">
              <span>// MT5: CONNECTED</span>
              <span>UPDATED JUST NOW · CONFIDENCE {70 + (tick % 4)}%</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* MISSION strip */}
      <section className="border-y border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
          <Reveal>
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-4">[ WHY TRADELOGS ]</p>
            <h2 className="font-display font-black tracking-tighter text-2xl sm:text-3xl md:text-4xl lg:text-5xl max-w-4xl leading-[1.05]">
              <span className="text-fg-2">A TRADING JOURNAL THAT ACTUALLY HELPS YOU </span>
              <span className="text-fg">LEARN AND IMPROVE </span>
              <span className="text-fg-2">— NOT JUST TAKE NOTES.</span>
            </h2>
          </Reveal>
        </div>
      </section>

      {/* PLATFORM — built for serious traders */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
          <Reveal className="text-center max-w-2xl mx-auto">
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3">[ PLATFORM ]</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">
              Built for <span className="text-gradient-brand">serious traders.</span>
            </h2>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-5">
              Everything you need to journal, analyze and improve — powered by insights that actually understand your trading.
            </p>
          </Reveal>

          <div className="grid grid-cols-12 gap-2 sm:gap-3 mt-10 sm:mt-12">
            <Reveal className="tcard col-span-12 lg:col-span-8 p-5 sm:p-6 flex flex-col">
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] tracking-[0.25em] text-fg-3">EQUITY CURVE</span>
                <span className="text-[10px] text-profit">▲ LIVE</span>
              </div>
              <p className="text-fg-2 text-[12px] mt-2 max-w-md">Track your growth with a live-updating equity curve that shows your real edge over time.</p>
              <div className="mt-5 border border-border-soft p-3"><SyntheticChart height={200} /></div>
            </Reveal>

            <Reveal delay={90} className="tcard col-span-12 lg:col-span-4 p-5 sm:p-6 flex flex-col items-center">
              <span className="self-start text-[10px] sm:text-[11px] tracking-[0.25em] text-profit">BEHAVIORAL SCORE</span>
              <div className="flex-1 flex items-center w-full"><RadarScore /></div>
            </Reveal>

            <Reveal delay={60} className="tcard col-span-12 p-5 sm:p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { l: 'Metrics per trade', v: '21+' },
                { l: 'Long win rate',     v: '61%',    c: 'text-profit' },
                { l: 'Best session',      v: 'London', c: 'text-profit' },
                { l: 'Worst hour',        v: 'after 3PM', c: 'text-loss' },
              ].map(s => (
                <div key={s.l}>
                  <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{s.l}</div>
                  <div className={`font-display font-black text-2xl sm:text-3xl mt-1 tracking-tight ${s.c ?? ''}`}>{s.v}</div>
                </div>
              ))}
            </Reveal>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — vertical stepper synced to a visual */}
      <section id="how" className="border-y border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
          <Reveal className="max-w-2xl">
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3">[ HOW IT WORKS ]</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">
              From broker to <span className="text-gradient-brand">edge.</span>
            </h2>
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-10 items-center mt-10 sm:mt-12">
            {/* Accordion */}
            <Reveal className="flex flex-col gap-2" data-testid="how-stepper">
              {STEPS.map((s, i) => {
                const active = step === i;
                return (
                  <button
                    key={s.key}
                    onClick={() => setStep(i)}
                    data-testid={`step-${s.key}`}
                    className={`text-left tcard p-4 sm:p-5 transition-colors duration-[var(--dur-select)] ${active ? 'border-l-2 border-l-profit bg-surface-hover' : 'hover:bg-surface'}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 shrink-0 flex items-center justify-center text-[11px] font-bold border ${active ? 'border-profit text-profit' : 'border-border-strong text-fg-3'}`}>{i + 1}</span>
                      <h3 className="font-display font-bold text-[15px] sm:text-lg tracking-tight">{s.title}</h3>
                    </div>
                    <div className={`grid transition-all duration-[var(--dur-select)] ${active ? 'grid-rows-[1fr] opacity-100 mt-3' : 'grid-rows-[0fr] opacity-0'}`}>
                      <p className="overflow-hidden text-fg-2 text-[12px] sm:text-[13px] leading-relaxed pl-10">{s.body}</p>
                    </div>
                  </button>
                );
              })}
            </Reveal>

            {/* Synced visual */}
            {(() => {
              const current = STEPS[step] ?? STEPS[0];
              return (
                <Reveal delay={80} className="tcard p-5 sm:p-7 min-h-[260px] flex flex-col">
                  <div className="flex items-center justify-between mb-5">
                    <span className="text-[10px] tracking-[0.22em] text-fg-3">// {current.label}</span>
                    <span className="text-[10px] text-profit">● LIVE</span>
                  </div>
                  <div key={step} className="flex-1 flex items-center fade-up" data-testid={`how-visual-${current.key}`}>
                    {current.visual}
                  </div>
                </Reveal>
              );
            })()}
          </div>
        </div>
      </section>

      {/* WATCH TRADES FLOW IN — live table */}
      <section id="analytics" className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
          <Reveal className="text-center max-w-2xl mx-auto">
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3">[ LIVE EXPERIENCE ]</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">
              Watch trades <span className="text-gradient-brand">flow in.</span>
            </h2>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-5">
              Every trade auto-logged, categorized and scored in real time. No manual entry — just connect and trade.
            </p>
          </Reveal>

          <Reveal delay={100} className="mt-10 sm:mt-12">
            <BrowserFrame url="tradelogs.com/trades" status={<span className="text-profit">● LIVE FEED</span>} testId="live-trades">
              {/* Header row */}
              <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 border-b border-border-soft text-[9px] tracking-[0.18em] text-fg-3 uppercase">
                <span className="w-16">Pair</span>
                <span className="w-10">Side</span>
                <span className="w-12">Size</span>
                <span className="w-20">Duration</span>
                <span className="flex-1">Setup</span>
                <span className="w-20 text-right">P&amp;L</span>
                <span className="w-20 text-right">Time</span>
              </div>
              <div className="divide-y divide-border-soft">
                {LIVE_ROWS.map((r, i) => (
                  <Reveal key={i} delay={i * 70} className="flex items-center gap-3 px-4 py-2.5 text-[11px] sm:text-[12px]">
                    <span className="w-16 shrink-0 flex items-center gap-1.5 tracking-wider">
                      <span className={`w-1.5 h-1.5 rounded-full ${r.up ? 'bg-profit' : 'bg-loss'}`} />{r.pair}
                    </span>
                    <span className={`w-10 shrink-0 text-[9px] tracking-widest ${r.side === 'BUY' ? 'text-profit' : 'text-loss'}`}>{r.side}</span>
                    <span className="w-12 shrink-0 numeric text-fg-3 hidden sm:inline">{r.size}</span>
                    <span className="w-20 shrink-0 numeric text-fg-3 hidden sm:inline">{r.dur}</span>
                    <span className="flex-1 min-w-0 hidden sm:block">
                      <span className="border border-border-soft px-2 py-0.5 text-[9px] tracking-widest text-fg-2 uppercase">{r.tag}</span>
                    </span>
                    <span className={`w-20 shrink-0 text-right numeric ${r.up ? 'text-profit' : 'text-loss'}`}>{r.pnl}</span>
                    <span className="w-20 shrink-0 text-right numeric text-fg-3 hidden sm:inline">{r.time}</span>
                  </Reveal>
                ))}
              </div>
              {/* Footer */}
              <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-border-soft text-[10px] tracking-[0.18em] text-fg-3 uppercase">
                <span>Session P&amp;L <span className="text-profit numeric">+723.12</span></span>
                <span>Win rate <span className="text-fg-2 numeric">75%</span> · 8 trades</span>
                <span className="flex items-center gap-1.5 text-profit"><span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> LIVE</span>
              </div>
            </BrowserFrame>
          </Reveal>
        </div>
      </section>

      {/* AI — that actually knows your trading */}
      <section className="border-y border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <Reveal className="lg:col-span-6">
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3">[ INSIGHTS ]</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">
              Insights that actually <span className="text-gradient-brand">know your trading.</span>
            </h2>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-5 max-w-md leading-relaxed">
              Not generic advice. TRADElogs reads every trade you&apos;ve taken and surfaces the leaks — time-of-day patterns, tilt cycles, and the setups that quietly print.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 max-w-md">
              {['Behaviour & tilt detection', 'Plain-English summaries', 'Best-session finder', 'Weekly review'].map(t => (
                <span key={t} className="border border-border-soft px-2.5 py-1 text-[11px] text-fg-2 tracking-wider uppercase">{t}</span>
              ))}
            </div>
          </Reveal>

          <Reveal delay={90} className="lg:col-span-6 tcard p-5 sm:p-6">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] text-fg-3 mb-4">
              <span className="w-6 h-6 rounded-full bg-surface-hover border border-border flex items-center justify-center text-[11px]">◆</span>
              SESSION REVIEW · 4:15 PM
            </div>
            <p className="font-display font-bold text-lg sm:text-xl tracking-tight leading-snug">
              You&apos;re on tilt. Losses are up <span className="text-loss">2.37×</span>.
            </p>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-2 leading-relaxed">
              What I noticed: you size up right after a winner. Set a daily loss limit of $200, and cap size to 1 lot after two losses.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {['Set daily loss limit to $200', 'Lock out after 3 losing trades', 'Cap size to 1 lot on tilt'].map(t => (
                <div key={t} className="flex items-center gap-2 text-[12px] text-fg-2">
                  <span className="text-profit">✓</span> {t}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* FEATURES grid */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
        <Reveal className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3">[ WHAT YOU GET ]</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">Understand every trade.</h2>
          </div>
          <p className="text-fg-2 text-[12px] max-w-sm">Six simple tools to help you review, learn and improve your trading.</p>
        </Reveal>

        <div className="grid grid-cols-12 gap-2 sm:gap-3">
          <Reveal className="tcard col-span-12 lg:col-span-7 p-5 sm:p-6 min-h-[280px] sm:min-h-[320px] flex flex-col" data-testid="feature-mt5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] tracking-[0.25em] text-fg-3">01 // MT5 CONNECTION</span>
              <span className="text-[10px] text-profit">● CONNECTED</span>
            </div>
            <h3 className="font-display font-black text-2xl sm:text-3xl tracking-tighter mt-4">MT5 sync made simple.</h3>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-3 max-w-md">Connect securely with a read-only login. We import every trade, fee and commission for you automatically — no manual work.</p>
            <div className="mt-auto pt-6"><SyntheticChart height={140} /></div>
          </Reveal>

          <Reveal delay={80} className="tcard col-span-12 lg:col-span-5 p-5 sm:p-6 flex flex-col" data-testid="feature-behavior">
            <span className="text-[10px] sm:text-[11px] tracking-[0.25em] text-fg-3">02 // YOUR TRADING SCORE</span>
            <h3 className="font-display font-black text-2xl tracking-tighter mt-4">Your trading score</h3>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-3">See how disciplined you are and where you can do better — like revenge trades, impulse entries and exiting too early.</p>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3">
              {[
                { l: 'Discipline score', v: '88', t: 'profit' },
                { l: 'Revenge trades', v: '2', t: 'warning' },
                { l: 'Impulse trades', v: '11%', t: 'loss' },
                { l: 'Plan followed', v: '94%', t: 'profit' },
              ].map(m => (
                <div key={m.l} className="border border-border-soft px-3 py-3">
                  <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{m.l}</div>
                  <div className={`font-display font-black text-xl sm:text-2xl mt-1 ${m.t === 'profit' ? 'text-profit' : m.t === 'loss' ? 'text-loss' : 'text-warning'}`}>{m.v}</div>
                </div>
              ))}
            </div>
          </Reveal>

          {[
            { n: '03', title: 'Trade replay', body: 'Play back each trade step by step to see exactly what you did.' },
            { n: '04', title: 'Where you earn', body: 'See where you really make money — and where you tend to lose it.' },
            { n: '05', title: 'Best trading times', body: 'Asian, London, New York — find out when you trade your best.' },
            { n: '06', title: 'Trade tagging', body: 'Tag your setups, emotions and strategies to spot what works in seconds.' },
          ].map((c, i) => (
            <Reveal key={c.n} delay={i * 60} className="tcard tcard-hover col-span-12 sm:col-span-6 lg:col-span-3 p-4 sm:p-5 min-h-[160px] sm:min-h-[180px] flex flex-col" data-testid={`feature-${c.n}`}>
              <span className="text-[10px] tracking-[0.25em] text-fg-3">{c.n}</span>
              <h4 className="font-display font-bold text-lg sm:text-xl tracking-tight mt-3">{c.title}</h4>
              <p className="text-fg-2 text-[12px] mt-2">{c.body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* TESTIMONIAL / PROOF */}
      <section className="border-y border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-20 grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <Reveal className="lg:col-span-7">
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-4">[ TRADER STORY // 2026.01 ]</p>
            <p className="font-display font-bold text-xl sm:text-2xl md:text-3xl tracking-tight leading-snug">
              &ldquo;The trading score showed me something I couldn&apos;t see — I was revenge trading every Tuesday after the London session. Fixing that one habit really turned my results around.&rdquo;
            </p>
            <div className="mt-5 sm:mt-6 text-[10px] sm:text-[11px] text-fg-3 tracking-widest">— C. HENRY · FOREX TRADER</div>
          </Reveal>
          <div className="lg:col-span-5 grid grid-cols-2 gap-2 sm:gap-3">
            {[
              { l: 'Avg improvement', v: '+0.62' },
              { l: 'Trades synced daily', v: '500K+' },
              { l: 'Brokers',         v: 'XM · IC · PEP' },
              { l: 'Sync speed',      v: '< 50ms' },
            ].map((s, i) => (
              <Reveal key={s.l} delay={i * 60} className="tcard p-4">
                <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{s.l}</div>
                <div className="font-display font-black text-xl sm:text-2xl mt-1 tracking-tight break-words">{s.v}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
        <Reveal>
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-3">[ HELP ]</p>
          <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mb-8 sm:mb-10">Common questions.</h2>
        </Reveal>
        <div className="border-t border-border">
          {[
            { q: 'How safe is the MT5 connection?', a: 'We only ask for your read-only password. We can never place trades or withdraw money, and your details are kept encrypted and private.' },
            { q: 'What is the Trading Score?',     a: 'A simple score that compares your trades against your plan and points out habits like revenge trading, impulse entries and exiting too early.' },
            { q: 'Can I export my journal data?',      a: 'Yes — you can export your data as CSV or JSON on the Trader plan. Team customers also get API access.' },
            { q: 'Does TRADElogs support MT4?',          a: 'MT5 is supported today. MT4 is coming soon (Q2 2026), once we have everything working just as well as it does for MT5.' },
          ].map(item => (
            <details key={item.q} className="group border-b border-border" data-testid="faq-item">
              <summary className="cursor-pointer list-none flex items-center justify-between py-4 sm:py-5 hover:text-fg text-fg-2 gap-3">
                <span className="text-[13px] sm:text-[14px] tracking-tight">{item.q}</span>
                <span className="text-fg-3 text-xl group-open:rotate-45 transition-transform shrink-0">+</span>
              </summary>
              <p className="pb-5 text-fg-2 text-[12px] sm:text-[13px] leading-relaxed max-w-3xl">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA — glow card */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
        <Reveal className="relative tcard overflow-hidden px-6 py-14 sm:px-10 sm:py-20 text-center">
          <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[700px] h-[700px] max-w-[160%] glow-radial" />
          <div className="relative">
            <h2 className="font-display font-black tracking-tighter text-4xl sm:text-5xl md:text-6xl leading-[0.95]">
              Ready to find your <span className="text-gradient-brand">edge?</span>
            </h2>
            <p className="text-fg-2 text-[12px] sm:text-[13px] max-w-md mx-auto mt-5 sm:mt-6">Connect your MT5 in 90 seconds. See what&apos;s working by tomorrow morning.</p>
            <Link href="/dashboard" className="btn btn-primary px-7 py-3 sm:px-8 sm:py-3.5 mt-7 sm:mt-8 inline-flex" data-testid="footer-cta-launch">
              GET STARTED FREE →
            </Link>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-app">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Logo height={26} />
            <p className="text-fg-3 text-[11px] leading-relaxed mt-4 max-w-[220px]">
              A trading journal for traders who are serious about improving.
            </p>
          </div>
          {[
            { h: 'Product', links: ['Features', 'How it works', 'Analytics', 'FAQ'] },
            { h: 'Legal', links: ['Terms of Service', 'Privacy Policy', 'Data Policy'] },
            { h: 'Support', links: ['Contact', 'Status', 'MT5 Setup'] },
          ].map(col => (
            <div key={col.h}>
              <div className="text-[10px] tracking-[0.22em] text-fg-3 uppercase mb-3">{col.h}</div>
              <ul className="flex flex-col gap-2">
                {col.links.map(l => (
                  <li key={l}><a href="#" className="text-[12px] text-fg-2 hover:text-fg transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-[10px] text-fg-3 tracking-widest">
            <span className="flex items-center gap-2"><span className="w-2 h-2 bg-profit pulse-dot shrink-0" /> TRADELOGS // TRADING JOURNAL // EST 2026</span>
            <span>© 2026 TRADElogs. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
