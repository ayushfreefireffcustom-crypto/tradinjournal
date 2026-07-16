'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Logo from '@/components/logo';

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
  // Static line chart drawn in SVG so it always looks identical
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
      <path d={area} fill="rgba(255,255,255,0.06)" />
      <path d={path} stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
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

// ── Feature-preview bodies (swapped by the tab strip) ─────────────────────────

function AnalyticsPreview() {
  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        {[
          { l: 'TOTAL PROFIT',   v: '+$12,418', c: 'text-profit' },
          { l: 'WIN RATE',       v: '64.1%',     c: '' },
          { l: 'PROFIT VS LOSS', v: '2.82',      c: '' },
        ].map(m => (
          <div key={m.l} className="border border-border-soft px-3 py-3">
            <div className="text-[9px] sm:text-[10px] tracking-[0.18em] text-fg-3 uppercase">{m.l}</div>
            <div className={`font-display font-black text-xl sm:text-2xl mt-1 tracking-tight ${m.c}`}>{m.v}</div>
          </div>
        ))}
      </div>
      <div className="border border-border-soft p-3"><SyntheticChart height={170} /></div>
    </>
  );
}

function ReplayPreview() {
  return (
    <>
      <div className="border border-border-soft p-3 h-[186px]"><Candlesticks /></div>
      {/* Faux scrubber */}
      <div className="mt-3 flex items-center gap-3">
        <span className="w-6 h-6 rounded-full bg-fg text-app flex items-center justify-center text-[10px] shrink-0">▶</span>
        <div className="relative flex-1 h-1 bg-border-soft rounded-full">
          <div className="absolute inset-y-0 left-0 w-2/3 bg-profit rounded-full" />
          <div className="absolute top-1/2 left-2/3 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-fg border-2 border-app" />
        </div>
        <span className="text-[10px] text-fg-3 tracking-widest shrink-0 numeric">1.5×</span>
      </div>
      <div className="text-[10px] text-fg-3 tracking-widest mt-2 uppercase">Bar-by-bar playback · synced with your fills</div>
    </>
  );
}

function JournalPreview() {
  const rows = [
    { d: '06/19', s: 'XAUUSD', p: '+$607',   up: true,  tag: 'Breakout' },
    { d: '06/18', s: 'EURUSD', p: '-$225',   up: false, tag: 'FOMO' },
    { d: '06/17', s: 'NAS100', p: '+$1,193', up: true,  tag: 'Pullback' },
    { d: '06/17', s: 'GBPUSD', p: '+$151',   up: true,  tag: 'Trend' },
    { d: '06/16', s: 'US30',   p: '-$300',   up: false, tag: 'Revenge' },
  ];
  return (
    <div className="border border-border-soft divide-y divide-border-soft">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5 text-[11px] sm:text-[12px]">
          <span className="text-fg-3 numeric w-10 shrink-0">{r.d}</span>
          <span className="tracking-wider w-16 shrink-0">{r.s}</span>
          <span className={`numeric w-16 shrink-0 ${r.up ? 'text-profit' : 'text-loss'}`}>{r.p}</span>
          <span className="ml-auto border border-border-soft px-2 py-0.5 text-[9px] sm:text-[10px] tracking-widest text-fg-2 uppercase">{r.tag}</span>
        </div>
      ))}
    </div>
  );
}

const PREVIEW_META = {
  replay:    { label: 'EURUSD · M5', body: ReplayPreview },
  analytics: { label: '78 TRADES',   body: AnalyticsPreview },
  journal:   { label: 'AUTO-TAGGED', body: JournalPreview },
} as const;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [tab, setTab] = useState<'replay' | 'analytics' | 'journal'>('analytics');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-app text-fg" data-testid="landing-page">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-app/80 backdrop-blur-xl" data-testid="landing-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 shrink-0" data-testid="logo-link">
            <Logo height={28} />
          </Link>
          <nav className="hidden md:flex items-center gap-5 lg:gap-7 text-[12px] text-fg-2">
            <a href="#features" className="hover:text-fg transition-colors">FEATURES</a>
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

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-14 sm:pt-20 pb-16 sm:pb-24 grid lg:grid-cols-12 gap-10 items-end">
          <div className="lg:col-span-7 fade-up">
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-5 sm:mb-6">[ SIMPLE INSIGHTS FOR EVERY TRADER ]</p>
            <h1 className="font-display font-black tracking-tighter text-[40px] sm:text-[56px] md:text-[68px] lg:text-[78px] leading-[0.95]">
              UNDERSTAND <br />
              YOUR <span className="text-fg-2">TRADING.</span> <br />
              <span className="text-profit">IMPROVE</span> <br />
              EVERY DAY.
            </h1>
            <p className="text-fg-2 mt-6 sm:mt-8 max-w-xl text-[12px] sm:text-[13px] leading-relaxed">
              TRADElogs connects to your MetaTrader 5 account and imports every trade for you.
              It shows you clear, easy-to-read insights about your habits — like impulse trades,
              chasing the market, and the times of day you tend to lose money.
            </p>
            <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/dashboard" className="btn btn-primary px-6 py-3 text-[13px] justify-center" data-testid="hero-cta-launch">
                GET STARTED FREE
              </Link>
              <a href="#features" className="btn btn-ghost px-6 py-3 text-[13px] justify-center" data-testid="hero-cta-features">
                SEE HOW IT WORKS
              </a>
            </div>

            {/* Mini stats strip */}
            <div className="mt-10 sm:mt-12 grid grid-cols-3 max-w-md border border-border">
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
            </div>
          </div>

          {/* Terminal preview */}
          <div className="lg:col-span-5 fade-up" data-testid="hero-terminal">
            <div className="tcard p-0 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-app">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-loss/80" />
                  <span className="w-2 h-2 rounded-full bg-warning/80" />
                  <span className="w-2 h-2 rounded-full bg-profit/80" />
                </div>
                <span className="text-[10px] tracking-[0.2em] text-fg-3">TRADELOGS // LIVE SESSION</span>
                <span className="text-[10px] text-profit">● LIVE</span>
              </div>

              <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] sm:text-[11px] text-fg-3 tracking-widest truncate">XAUUSD · LONG · 0.45 lots</div>
                  <div className="font-display font-black text-2xl sm:text-3xl tracking-tighter mt-1">+$1,240<span className="text-profit text-sm sm:text-base font-mono ml-2">+3.2R</span></div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-fg-3 tracking-widest">CONFIDENCE · {70 + (tick % 4)}%</div>
                  <div className="text-profit text-[10px] sm:text-[11px] mt-1">DISCIPLINED</div>
                </div>
              </div>

              <div className="h-[220px] bg-app"><Candlesticks /></div>

              <div className="grid grid-cols-3 border-t border-border-soft">
                {[
                  { l: 'ENTRY', v: '2,372.41' },
                  { l: 'EXIT',  v: '2,387.42' },
                  { l: 'HELD',  v: '2h 14m' },
                ].map(c => (
                  <div key={c.l} className="px-3 py-2 border-r border-border-soft last:border-r-0">
                    <div className="text-[9px] tracking-widest text-fg-3">{c.l}</div>
                    <div className="text-[12px] mt-0.5 numeric">{c.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-fg-3 tracking-[0.2em]">
              <span>// MT5: CONNECTED</span>
              <span>UPDATED JUST NOW</span>
            </div>
          </div>
        </div>
      </section>

      {/* MISSION strip */}
      <section className="border-y border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-4">[ WHY TRADELOGS ]</p>
          <h2 className="font-display font-black tracking-tighter text-2xl sm:text-3xl md:text-4xl lg:text-5xl max-w-4xl leading-[1.05]">
            <span className="text-fg-2">A TRADING JOURNAL THAT ACTUALLY HELPS YOU </span>
            <span className="text-fg">LEARN AND IMPROVE </span>
            <span className="text-fg-2">— NOT JUST TAKE NOTES.</span>
          </h2>
        </div>
      </section>

      {/* FEATURES BENTO */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3">[ 02 // WHAT YOU GET ]</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">UNDERSTAND EVERY TRADE.</h2>
          </div>
          <p className="text-fg-2 text-[12px] max-w-sm">Six simple tools to help you review, learn and improve your trading.</p>
        </div>

        <div className="grid grid-cols-12 gap-2 sm:gap-3">
          {/* Big card */}
          <div className="tcard col-span-12 lg:col-span-7 p-5 sm:p-6 min-h-[280px] sm:min-h-[320px] flex flex-col" data-testid="feature-mt5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] tracking-[0.25em] text-fg-3">01 // MT5 CONNECTION</span>
              <span className="text-[10px] text-profit">● CONNECTED</span>
            </div>
            <h3 className="font-display font-black text-2xl sm:text-3xl tracking-tighter mt-4">MT5 SYNC MADE SIMPLE.</h3>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-3 max-w-md">Connect securely with a read-only login. We import every trade, fee and commission for you automatically — no manual work.</p>
            <div className="mt-auto pt-6"><SyntheticChart height={140} /></div>
          </div>

          <div className="tcard col-span-12 lg:col-span-5 p-5 sm:p-6 flex flex-col" data-testid="feature-behavior">
            <span className="text-[10px] sm:text-[11px] tracking-[0.25em] text-fg-3">02 // YOUR TRADING SCORE</span>
            <h3 className="font-display font-black text-2xl tracking-tighter mt-4">YOUR TRADING SCORE</h3>
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
          </div>

          {[
            { n: '03', title: 'TRADE REPLAY', body: 'Play back each trade step by step to see exactly what you did.' },
            { n: '04', title: 'WHERE YOU EARN', body: 'See where you really make money — and where you tend to lose it.' },
            { n: '05', title: 'BEST TRADING TIMES', body: 'Asian, London, New York — find out when you trade your best.' },
            { n: '06', title: 'TRADE TAGGING', body: 'Tag your setups, emotions and strategies to spot what works in seconds.' },
          ].map(c => (
            <div key={c.n} className="tcard tcard-hover col-span-12 sm:col-span-6 lg:col-span-3 p-4 sm:p-5 min-h-[160px] sm:min-h-[180px] flex flex-col" data-testid={`feature-${c.n}`}>
              <span className="text-[10px] tracking-[0.25em] text-fg-3">{c.n}</span>
              <h4 className="font-display font-bold text-lg sm:text-xl tracking-tight mt-3">{c.title}</h4>
              <p className="text-fg-2 text-[12px] mt-2">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ANALYTICS PREVIEW */}
      <section id="analytics" className="border-t border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <div className="lg:col-span-5">
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3">[ 03 // YOUR NUMBERS ]</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">ALL YOUR STATS IN ONE PLACE.</h2>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-5 max-w-md">
              Clear, easy-to-read numbers — your profit, win rate, biggest drawdown, reward vs risk, and how you trade at different times of day.
            </p>
            <div className="mt-7 sm:mt-8 flex flex-wrap gap-2 max-w-md">
              {['Profit vs loss', 'Win rate', 'Avg win', 'Avg loss', 'Biggest drop', 'Reward:risk', 'Hold time'].map(t => (
                <span key={t} className="border border-border-soft px-2.5 py-1 text-[11px] text-fg-2 tracking-wider uppercase">{t}</span>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 tcard p-4 sm:p-5" data-testid="analytics-preview">
            <div className="flex items-center justify-between border-b border-border-soft pb-3 mb-4 gap-2">
              <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1">
                {(['replay', 'analytics', 'journal'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    data-testid={`preview-tab-${t}`}
                    className={`shrink-0 px-3 py-1.5 text-[11px] tracking-[0.2em] uppercase border ${
                      tab === t ? 'border-border-strong text-fg bg-surface-hover' : 'border-transparent text-fg-3 hover:text-fg'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <span className="text-[9px] sm:text-[10px] text-fg-3 tracking-widest shrink-0">{PREVIEW_META[tab].label}</span>
            </div>
            <div key={tab} className="fade-up" data-testid={`preview-body-${tab}`}>
              {(() => { const Body = PREVIEW_META[tab].body; return <Body />; })()}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIAL / PROOF */}
      <section className="border-y border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-20 grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <div className="lg:col-span-7">
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-4">[ TRADER STORY // 2026.01 ]</p>
            <p className="font-display font-bold text-xl sm:text-2xl md:text-3xl tracking-tight leading-snug">
              &ldquo;The trading score showed me something I couldn&apos;t see — I was revenge trading every Tuesday after the London session. Fixing that one habit really turned my results around.&rdquo;
            </p>
            <div className="mt-5 sm:mt-6 text-[10px] sm:text-[11px] text-fg-3 tracking-widest">— C. HENRY · FOREX TRADER</div>
          </div>
          <div className="lg:col-span-5 grid grid-cols-2 gap-2 sm:gap-3">
            {[
              { l: 'Avg improvement', v: '+0.62' },
              { l: 'Trades synced daily', v: '500K+' },
              { l: 'Brokers',         v: 'XM · IC · PEP' },
              { l: 'Sync speed',      v: '< 50ms' },
            ].map(s => (
              <div key={s.l} className="tcard p-4">
                <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{s.l}</div>
                <div className="font-display font-black text-xl sm:text-2xl mt-1 tracking-tight break-words">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
        <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-3">[ 04 // HELP ]</p>
        <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mb-8 sm:mb-10">COMMON QUESTIONS.</h2>
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

      {/* CTA */}
      <section className="border-t border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 text-center">
          <h2 className="font-display font-black tracking-tighter text-4xl sm:text-5xl md:text-6xl lg:text-7xl leading-[0.95]">
            STOP <span className="text-fg-2">GUESSING.</span> <br /> START <span className="text-profit">IMPROVING.</span>
          </h2>
          <p className="text-fg-2 text-[12px] sm:text-[13px] max-w-md mx-auto mt-5 sm:mt-6">Connect your MT5 in 90 seconds. See what&apos;s working by tomorrow morning.</p>
          <Link href="/dashboard" className="btn btn-primary px-7 py-3 sm:px-8 sm:py-3.5 mt-7 sm:mt-8 inline-flex" data-testid="footer-cta-launch">
            GET STARTED FREE →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-app">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3 text-[10px] sm:text-[11px] text-fg-3 tracking-widest">
            <span className="w-2 h-2 bg-profit pulse-dot shrink-0" />
            <span>TRADELOGS // TRADING JOURNAL // EST 2026</span>
          </div>
          <div className="flex flex-wrap gap-4 sm:gap-6 text-[10px] sm:text-[11px] text-fg-3 tracking-widest">
            <a href="#" className="hover:text-fg">PRIVACY</a>
            <a href="#" className="hover:text-fg">TERMS</a>
            <a href="#" className="hover:text-fg">STATUS</a>
            <a href="#" className="hover:text-fg">CONTACT</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
