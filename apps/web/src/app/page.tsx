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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [tab, setTab] = useState<'replay' | 'analytics' | 'journal'>('replay');
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
            <a href="#pricing" className="hover:text-fg transition-colors">PRICING</a>
            <a href="#faq" className="hover:text-fg transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/login" className="btn btn-ghost hidden xs:inline-flex" data-testid="nav-signin">SIGN IN</Link>
            <Link href="/dashboard" className="btn btn-primary" data-testid="nav-open-terminal">
              <span className="hidden sm:inline">OPEN TERMINAL</span>
              <span className="sm:hidden">LAUNCH</span>
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
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-5 sm:mb-6">[ TJX // BEHAVIORAL ANALYTICS LAYER ]</p>
            <h1 className="font-display font-black tracking-tighter text-[40px] sm:text-[56px] md:text-[68px] lg:text-[78px] leading-[0.95]">
              QUANTIFY <br />
              YOUR <span className="text-fg-2">EDGE.</span> <br />
              <span className="text-profit">EXECUTE</span> <br />
              YOUR PLAN.
            </h1>
            <p className="text-fg-2 mt-6 sm:mt-8 max-w-xl text-[12px] sm:text-[13px] leading-relaxed">
              TRADElogs hooks directly into MetaTrader 5, reconstructs every position, and tells you
              the brutal truth about your trading psychology — revenge entries, FOMO chases, and
              the exact session where you bleed pips.
            </p>
            <div className="mt-7 sm:mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/dashboard" className="btn btn-primary px-6 py-3 text-[13px] justify-center" data-testid="hero-cta-launch">
                LAUNCH TERMINAL
              </Link>
              <a href="#features" className="btn btn-ghost px-6 py-3 text-[13px] justify-center" data-testid="hero-cta-features">
                VIEW SPEC SHEET
              </a>
            </div>

            {/* Mini stats strip */}
            <div className="mt-10 sm:mt-12 grid grid-cols-3 max-w-md border border-border">
              {[
                { l: 'Trades synced', v: '14.2M' },
                { l: 'Median R:R', v: '1:2.4' },
                { l: 'Edge uplift', v: '+25%' },
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
                <span className="text-[10px] tracking-[0.2em] text-fg-3">TJX // SESSION_01</span>
                <span className="text-[10px] text-profit">● LIVE</span>
              </div>

              <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] sm:text-[11px] text-fg-3 tracking-widest truncate">XAUUSD · LONG · 0.45 lots</div>
                  <div className="font-display font-black text-2xl sm:text-3xl tracking-tighter mt-1">+$1,240<span className="text-profit text-sm sm:text-base font-mono ml-2">+3.2R</span></div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-fg-3 tracking-widest">CONF · {70 + (tick % 4)}%</div>
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
              <span>// MT5 BRIDGE: ONLINE</span>
              <span>LATENCY 38ms</span>
            </div>
          </div>
        </div>
      </section>

      {/* MISSION strip */}
      <section className="border-y border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
          <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-4">[ THE MISSION ]</p>
          <h2 className="font-display font-black tracking-tighter text-2xl sm:text-3xl md:text-4xl lg:text-5xl max-w-4xl leading-[1.05]">
            <span className="text-fg-2">A TRADING JOURNAL THAT BEHAVES </span>
            <span className="text-fg">LIKE A BLOOMBERG TERMINAL </span>
            <span className="text-fg-2">— NOT A NOTES APP.</span>
          </h2>
        </div>
      </section>

      {/* FEATURES BENTO */}
      <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3">[ 02 // CAPABILITY MATRIX ]</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">EVERY TRADE, DISSECTED.</h2>
          </div>
          <p className="text-fg-2 text-[12px] max-w-sm">Six instruments. Built for execution discipline, not vanity dashboards.</p>
        </div>

        <div className="grid grid-cols-12 gap-2 sm:gap-3">
          {/* Big card */}
          <div className="tcard col-span-12 lg:col-span-7 p-5 sm:p-6 min-h-[280px] sm:min-h-[320px] flex flex-col" data-testid="feature-mt5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[11px] tracking-[0.25em] text-fg-3">01 // MT5 BRIDGE</span>
              <span className="text-[10px] text-profit">● ONLINE</span>
            </div>
            <h3 className="font-display font-black text-2xl sm:text-3xl tracking-tighter mt-4">DIRECT MT5 SYNC. ZERO EXPORT.</h3>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-3 max-w-md">Read-only investor credentials. Every ticket, fill, swap and commission is reconstructed into structured positions — automatically.</p>
            <div className="mt-auto pt-6"><SyntheticChart height={140} /></div>
          </div>

          <div className="tcard col-span-12 lg:col-span-5 p-5 sm:p-6 flex flex-col" data-testid="feature-behavior">
            <span className="text-[10px] sm:text-[11px] tracking-[0.25em] text-fg-3">02 // PSYCH ENGINE</span>
            <h3 className="font-display font-black text-2xl tracking-tighter mt-4">BEHAVIORAL SCORE</h3>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-3">Flags revenge clusters, FOMO entries, and premature exits against your stated plan.</p>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:gap-3">
              {[
                { l: 'Discipline', v: '88', t: 'profit' },
                { l: 'Revenge events', v: '2', t: 'warning' },
                { l: 'FOMO entries', v: '11%', t: 'loss' },
                { l: 'Plan adherence', v: '94%', t: 'profit' },
              ].map(m => (
                <div key={m.l} className="border border-border-soft px-3 py-3">
                  <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{m.l}</div>
                  <div className={`font-display font-black text-xl sm:text-2xl mt-1 ${m.t === 'profit' ? 'text-profit' : m.t === 'loss' ? 'text-loss' : 'text-warning'}`}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>

          {[
            { n: '03', title: 'CANDLE REPLAY', body: 'Re-live every fill candle-by-candle to forensically audit decisions.' },
            { n: '04', title: 'R-MULTIPLE DIST', body: 'See where you really make money — and where your edge actually breaks.' },
            { n: '05', title: 'SESSION HEATMAP', body: 'Asian, London, NY — pinpoint when your psychology cracks.' },
            { n: '06', title: 'TRADE TAGGING', body: 'Tag setups, emotions & playbooks. Find your statistical edge in seconds.' },
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
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3">[ 03 // EDGE DISCOVERY ]</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">PERFORMANCE, IN RAW NUMBERS.</h2>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-5 max-w-md">
              No vanity dashboards. Profit factor, expectancy, drawdown, R-multiples, and session breakdowns — exactly what a prop firm risk desk would demand.
            </p>
            <div className="mt-7 sm:mt-8 flex flex-wrap gap-2 max-w-md">
              {['Profit factor', 'Sharpe', 'Sortino', 'Expectancy', 'Max DD', 'Avg R:R', 'Hold time'].map(t => (
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
              <span className="text-[9px] sm:text-[10px] text-fg-3 tracking-widest shrink-0">78 TRADES</span>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              {[
                { l: 'NET P&L',        v: '+$12,418', c: 'text-profit' },
                { l: 'WIN RATE',       v: '64.1%',     c: '' },
                { l: 'PROFIT FACTOR',  v: '2.82',      c: '' },
              ].map(m => (
                <div key={m.l} className="border border-border-soft px-3 py-3">
                  <div className="text-[9px] sm:text-[10px] tracking-[0.18em] text-fg-3 uppercase">{m.l}</div>
                  <div className={`font-display font-black text-xl sm:text-2xl mt-1 tracking-tight ${m.c}`}>{m.v}</div>
                </div>
              ))}
            </div>
            <div className="border border-border-soft p-3"><SyntheticChart height={170} /></div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3">[ 04 // PROTOCOL TIERS ]</p>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">PRICING.</h2>
          </div>
          <p className="text-fg-2 text-[12px] max-w-sm">No seats. No upsells. Just journaling that pays for itself in one disciplined month.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-2 sm:gap-3">
          {[
            { name: 'CADET',  price: '$0',  per: 'forever',     desc: 'Manual journal & basic stats.',     features: ['1 MT5 account', 'Basic P&L stats', 'Manual tagging', 'Equity curve'], cta: 'START FREE', highlight: false },
            { name: 'TRADER', price: '$19', per: 'per month',   desc: 'The professional standard.',         features: ['Unlimited MT5 accounts', 'Behavioural AI', 'Candle replay', 'R-multiple analytics', 'CSV / API export'], cta: 'UPGRADE',     highlight: true },
            { name: 'DESK',   price: '$49', per: 'per month',   desc: 'For prop firms & teams.',            features: ['Everything in Trader', 'Team workspaces', 'Risk-desk reports', 'Priority MT5 bridge', 'Dedicated support'], cta: 'CONTACT SALES', highlight: false },
          ].map(p => (
            <div key={p.name} className={`tcard p-5 sm:p-6 flex flex-col ${p.highlight ? 'border-fg' : ''}`} data-testid={`pricing-${p.name.toLowerCase()}`}>
              {p.highlight && <span className="absolute -top-px right-3 bg-fg text-app text-[10px] tracking-widest px-2 py-1">MOST USED</span>}
              <div className="text-[10px] sm:text-[11px] tracking-[0.25em] text-fg-3">{p.name}</div>
              <div className="font-display font-black text-4xl sm:text-5xl tracking-tighter mt-4">{p.price}<span className="text-fg-3 text-[12px] font-mono ml-2">/ {p.per}</span></div>
              <p className="text-fg-2 text-[12px] mt-3">{p.desc}</p>
              <ul className="mt-6 space-y-2 text-[12px] text-fg-2">
                {p.features.map(f => (
                  <li key={f} className="flex items-start gap-2"><span className="text-profit">→</span> {f}</li>
                ))}
              </ul>
              <Link href="/dashboard" className={`mt-8 btn ${p.highlight ? 'btn-primary' : 'btn-ghost'} justify-center w-full py-2.5`}>{p.cta}</Link>
            </div>
          ))}
        </div>
      </section>

      {/* TESTIMONIAL / PROOF */}
      <section className="border-y border-border bg-surface/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-20 grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <div className="lg:col-span-7">
            <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-4">[ FIELD REPORT // 2026.01 ]</p>
            <p className="font-display font-bold text-xl sm:text-2xl md:text-3xl tracking-tight leading-snug">
              &ldquo;The behavioural score caught what I couldn&apos;t see — I was revenge trading every Tuesday after London. Cleaning that one habit moved my profit factor from 1.4 to 2.6.&rdquo;
            </p>
            <div className="mt-5 sm:mt-6 text-[10px] sm:text-[11px] text-fg-3 tracking-widest">— C. HENRY · PRO FX TRADER · FTMO 200K</div>
          </div>
          <div className="lg:col-span-5 grid grid-cols-2 gap-2 sm:gap-3">
            {[
              { l: 'Avg PF uplift',   v: '+0.62' },
              { l: 'Daily syncs',     v: '500K+' },
              { l: 'Brokers',         v: 'XM · IC · PEP' },
              { l: 'Latency',         v: '< 50ms' },
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
        <p className="text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 mb-3">[ 05 // OPS LOG ]</p>
        <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mb-8 sm:mb-10">FREQUENT QUESTIONS.</h2>
        <div className="border-t border-border">
          {[
            { q: 'How secure is the MT5 connection?', a: 'We only ever ask for the investor (read-only) password. We can place no trades, withdraw nothing, and credentials are encrypted at rest with per-user keys.' },
            { q: 'What is the Behavioural Score?',     a: 'A proprietary metric that compares your fills against your stated plan and flags emotional patterns: revenge clusters, FOMO entries, and premature exits.' },
            { q: 'Can I export my journal data?',      a: 'Yes — CSV and JSON exports are available on the Trader tier. Desk customers get a typed API.' },
            { q: 'Does TRADElogs support MT4?',          a: 'MT5 is supported today. MT4 is on the roadmap (Q2 2026) once MT5 coverage reaches parity with desk-grade audit tooling.' },
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
            STOP <span className="text-fg-2">GUESSING.</span> <br /> START <span className="text-profit">JOURNALLING.</span>
          </h2>
          <p className="text-fg-2 text-[12px] sm:text-[13px] max-w-md mx-auto mt-5 sm:mt-6">Hook your MT5 in 90 seconds. See your real edge by tomorrow morning.</p>
          <Link href="/dashboard" className="btn btn-primary px-7 py-3 sm:px-8 sm:py-3.5 mt-7 sm:mt-8 inline-flex" data-testid="footer-cta-launch">
            LAUNCH TERMINAL →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-app">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 sm:py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3 text-[10px] sm:text-[11px] text-fg-3 tracking-widest">
            <span className="w-2 h-2 bg-profit pulse-dot shrink-0" />
            <span>TRADELOGS // PRECISION JOURNAL // EST 2026</span>
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
