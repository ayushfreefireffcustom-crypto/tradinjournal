'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { LinkSimple, Brain, ChatCircle, Target } from '@phosphor-icons/react';
import Logo from '@/components/logo';
import Reveal from '@/components/reveal';
import ScreenshotFrame from '@/components/screenshot-frame';
import FloatingCard from '@/components/floating-card';
// (BrowserFrame retired from the landing — live-feed now uses a bespoke frame)
import WatermarkNumber from '@/components/watermark-number';
import { RevealGroup, RevealItem } from '@/components/reveal-group';
import AnimatedNumber from '@/components/animated-number';
import { useInView } from '@/hooks/use-in-view';

// Count-up number that starts when it scrolls into view (0 → value). Reuses the
// AnimatedNumber tween; under reduced-motion it snaps instantly.
function Metric({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  return <span ref={ref} className={className}><AnimatedNumber value={inView ? value : 0} format={format} /></span>;
}

// Shared micro-label style for every stat caption (uniform size/tracking/colour).
// `min-h` reserves two lines so values below always align on a shared baseline
// even when a label wraps (e.g. "MAX DRAWDOWN" on mobile).
const STAT_LABEL = 'text-[9px] tracking-[0.16em] text-fg-3 uppercase leading-[1.15]';

// A label + value pair with consistent hierarchy and spacing. `reserve` keeps
// two-line label height so a row of these stays baseline-aligned.
function Stat({ label, value, valueClass = '', reserve = false }: { label: string; value: React.ReactNode; valueClass?: string; reserve?: boolean }) {
  return (
    <div className="min-w-0">
      <div className={`${STAT_LABEL} ${reserve ? 'min-h-[2.1em]' : ''}`}>{label}</div>
      <div className={`font-display font-bold text-base sm:text-lg mt-1 tracking-tight numeric ${valueClass}`}>{value}</div>
    </div>
  );
}

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

// Continuously-moving equity line — a slow upward random walk that scrolls left,
// so the platform section reads as genuinely live. Static under reduced-motion.
// Deterministic starting series so server and client first paint match (no
// hydration mismatch); the random walk only kicks in after mount.
const EQUITY_SEED = [
  26, 29, 27, 32, 30, 35, 33, 31, 36, 39, 37, 42, 40, 45, 43, 48, 46, 44, 49, 52, 50, 55,
  53, 58, 56, 61, 59, 64, 62, 67, 65, 70, 68, 66, 71, 74, 72, 77, 75, 80, 78, 83, 81, 86,
];

// Smooth Catmull-Rom → cubic-bezier path so the equity line reads as a polished
// curve rather than a jagged polyline.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function LiveEquityChart({ height = 190 }: { height?: number }) {
  const [pts, setPts] = useState<number[]>(EQUITY_SEED);
  // A deterministic, gently-rising function scrolls in from the right. Because
  // the visible window is re-normalised each frame, the absolute value can climb
  // forever while the curve always reads as a calm, premium up-trend with soft
  // waves — never a random-walk rollercoaster.
  const t = useRef(EQUITY_SEED.length);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      setPts(prev => {
        t.current += 1;
        const x = t.current;
        // Continue smoothly from where EQUITY_SEED ends (~86) so there's no
        // step-change as the deterministic curve scrolls in.
        const next = 82 + (x - EQUITY_SEED.length) * 0.9 + Math.sin(x * 0.45) * 4 + Math.sin(x * 0.17) * 2.5;
        return [...prev.slice(1), next];
      });
    }, 1600);
    return () => clearInterval(id);
  }, []);

  const W = 720, H = height, PAD = 8;
  const max = Math.max(...pts), min = Math.min(...pts);
  const span = max - min || 1;
  const xs = (i: number) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const ys = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const coords = pts.map((v, i) => ({ x: xs(i), y: ys(v) }));
  const path = smoothPath(coords);
  const area = `${path} L ${xs(pts.length - 1).toFixed(1)} ${H} L ${xs(0)} ${H} Z`;
  const lastV = pts[pts.length - 1] ?? 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#08C465" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#08C465" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={0} y1={H * p} x2={W} y2={H * p} stroke="#1E1E1E" strokeDasharray="2 4" />
      ))}
      <path d={area} fill="url(#eq-fill)" />
      <path d={path} stroke="#08C465" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={xs(pts.length - 1)} cy={ys(lastV)} r="3.5" fill="#08C465" />
      <circle cx={xs(pts.length - 1)} cy={ys(lastV)} r="7" fill="#08C465" opacity="0.18" />
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
  const cx = 140, cy = 124, R = 82;
  const pt = (i: number, r: number): [number, number] => {
    const ang = -Math.PI / 2 + (i / axes.length) * Math.PI * 2;
    return [cx + Math.cos(ang) * R * r, cy + Math.sin(ang) * R * r];
  };
  const ring = (r: number) => axes.map((_, i) => pt(i, r).join(',')).join(' ');
  const poly = vals.map((v, i) => pt(i, v).join(',')).join(' ');
  return (
    <svg viewBox="0 0 280 248" className="w-full max-w-[300px] mx-auto">
      <defs>
        <radialGradient id="radar-sweep" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#08C465" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#08C465" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map(r => (
        <polygon key={r} points={ring(r)} fill="none" stroke="#1E1E1E" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#1E1E1E" strokeWidth="1" />;
      })}
      {/* Revolving radar sweep */}
      <g>
        <path d={`M ${cx} ${cy} L ${cx} ${cy - R} A ${R} ${R} 0 0 1 ${cx + R * Math.sin(Math.PI / 3)} ${cy - R * Math.cos(Math.PI / 3)} Z`} fill="url(#radar-sweep)">
          <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="7s" repeatCount="indefinite" />
        </path>
      </g>
      <polygon points={poly} fill="rgba(8,196,101,0.16)" stroke="#08C465" strokeWidth="1.5" />
      {vals.map((v, i) => { const [x, y] = pt(i, v); return <circle key={i} cx={x} cy={y} r="2.5" fill="#08C465" />; })}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 1.2);
        return <text key={a} x={x} y={y} fontSize="9.5" fill="#9A9A9A" textAnchor="middle" dominantBaseline="middle" style={{ letterSpacing: '0.06em' }}>{a.toUpperCase()}</text>;
      })}
    </svg>
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
    meta: '~90 seconds',
    icon: LinkSimple,
    visual: (
      <div className="w-full h-full flex flex-col justify-center">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.18em] text-fg-3 uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> Auto-sync successful
          </div>
          <span className="text-[9px] tracking-widest text-fg-3 uppercase">XM Global · #345636702</span>
        </div>
        <div className="font-display font-black text-2xl tracking-tighter mb-2">
          <Metric value={32} format={n => `${Math.round(n)}`} /> trades imported
        </div>
        <div className="h-1.5 bg-border-soft rounded-full overflow-hidden mb-4">
          <div className="h-full rounded-full bg-profit grow-y" style={{ width: '100%', transformOrigin: 'left' }} />
        </div>
        <div className="divide-y divide-border-soft border-t border-border-soft">
          {[
            { s: 'XAUUSD', p: '+$607', up: true }, { s: 'EURUSD', p: '-$225', up: false }, { s: 'NAS100', p: '+$1,193', up: true },
          ].map((r, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-[11px] rise" style={{ ['--i' as string]: i + 1 }}>
              <span className="tracking-wider text-fg-2">{r.s}</span>
              <span className={`numeric ${r.up ? 'text-profit' : 'text-loss'}`}>{r.p}</span>
            </div>
          ))}
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
    meta: 'real-time',
    icon: Brain,
    visual: (
      <div className="w-full h-full flex flex-col justify-center">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.18em] text-fg-3 uppercase mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> Scanning 78 trades
        </div>
        <StepBars items={[
          { l: 'Pattern recognition', v: 92, c: '#08C465' },
          { l: 'Emotional analysis', v: 78, c: '#FE3A31' },
          { l: 'Risk assessment', v: 85, c: '#08C465' },
          { l: 'Strategy scoring', v: 71, c: '#FFFFFF' },
        ]} />
      </div>
    ),
  },
  {
    key: 'edge',
    title: 'Act on your edge',
    body: 'Every Monday, a plain-language review of your real trades — what’s working, what’s leaking, and the one habit to fix.',
    label: 'YOUR EDGE',
    meta: 'every Monday',
    icon: Target,
    visual: (
      <div className="w-full h-full flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">This week&apos;s review</span>
            <span className="text-[10px] tracking-widest text-profit uppercase">On track</span>
          </div>
          <p className="text-[15px] sm:text-[16px] text-fg leading-relaxed">
            Your <span className="text-profit font-semibold">London-session longs</span> are your strongest setup this week — <span className="text-profit font-semibold numeric">+$1,240</span> across 12 trades. Losses cluster <span className="text-loss font-semibold">after 3&nbsp;PM UTC</span> — consider stopping earlier.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-border-soft pt-4">
          {[
            { l: 'Best day', v: '+$1,634', c: 'text-profit' },
            { l: 'Plan followed', v: '94%', c: 'text-profit' },
            { l: 'Tilt events', v: '2', c: 'text-loss' },
          ].map(m => (
            <div key={m.l}>
              <div className="text-[9px] tracking-[0.16em] text-fg-3 uppercase">{m.l}</div>
              <div className={`font-display font-bold text-lg mt-1 numeric ${m.c}`}>{m.v}</div>
            </div>
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

interface TRow { id: number; pair: string; side: 'BUY' | 'SELL'; size: string; dur: string; tag: string; pnl: number; time: string }

const FEED_PAIRS = ['GBPUSD', 'EURUSD', 'NZDUSD', 'AUDUSD', 'USDJPY', 'XAUUSD', 'NAS100', 'US30'];
const FEED_TAGS = ['Breakout', 'Pullback', 'Trend', 'Range', 'London', 'FOMO', 'Reversal', 'Scalp'];
let feedSeq = 9000;
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]!;

function makeTrade(): TRow {
  // Bias toward a winning, positive-trending feed (this is a marketing demo):
  // ~64% winners, and winners run larger than losers so session P&L climbs.
  const up = Math.random() > 0.36;
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const mins = Math.floor(2 + Math.random() * 90);
  return {
    id: feedSeq++,
    pair: pick(FEED_PAIRS),
    side: Math.random() > 0.5 ? 'BUY' : 'SELL',
    size: (0.1 + Math.random() * 0.5).toFixed(2),
    dur: mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m ${Math.floor(Math.random() * 59)}s`,
    tag: pick(FEED_TAGS),
    pnl: up ? (35 + Math.random() * 300) : -(15 + Math.random() * 120),
    time: `${hh}:${mm} UTC`,
  };
}

const fmtPnl = (n: number) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}`;

// Live trade feed — a new trade slides in at the top every few seconds, the
// oldest drops off, and the session P&L keeps climbing. Static list under
// reduced-motion (no new rows injected).
// Deterministic starting equity series for the session sparkline (SSR-safe).
const SESSION_SEED = [40, 44, 42, 48, 52, 50, 57, 61, 59, 66, 70, 68, 74, 79, 83, 88];

// Win-rate donut ring.
function WinDonut({ pct }: { pct: number }) {
  const R = 30, C = 2 * Math.PI * R;
  const off = C * (1 - pct / 100);
  return (
    <svg viewBox="0 0 72 72" className="w-[72px] h-[72px] shrink-0 -rotate-90">
      <circle cx="36" cy="36" r={R} fill="none" stroke="#1E1E1E" strokeWidth="6" />
      <circle
        cx="36" cy="36" r={R} fill="none" stroke="#08C465" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={off}
        style={{ transition: 'stroke-dashoffset .6s var(--ease-premium)' }}
      />
    </svg>
  );
}

// Small session-equity sparkline (smooth line + soft area).
function SessionSpark({ data }: { data: number[] }) {
  const W = 240, H = 58, P = 3;
  const max = Math.max(...data), min = Math.min(...data), span = max - min || 1;
  const pts = data.map((v, i) => ({ x: P + (i / (data.length - 1)) * (W - P * 2), y: H - P - ((v - min) / span) * (H - P * 2) }));
  const path = smoothPath(pts);
  const area = `${path} L ${pts[pts.length - 1]!.x.toFixed(1)} ${H} L ${pts[0]!.x.toFixed(1)} ${H} Z`;
  const lastX = pts[pts.length - 1]!.x, lastY = pts[pts.length - 1]!.y;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[56px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#08C465" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#08C465" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={path} fill="none" stroke="#08C465" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill="#08C465" />
    </svg>
  );
}

// Tiny smooth sparkline for the platform metric mini-cards.
function MiniSpark({ data, color = '#08C465' }: { data: number[]; color?: string }) {
  const W = 100, H = 28, P = 2;
  const max = Math.max(...data), min = Math.min(...data), span = max - min || 1;
  const pts = data.map((v, i) => ({ x: P + (i / (data.length - 1)) * (W - P * 2), y: H - P - ((v - min) / span) * (H - P * 2) }));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-7" preserveAspectRatio="none">
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}

// Tiny bar chart for the platform metric mini-cards. `heightClass` lets a caller
// grow it into a fuller trend block (e.g. the behavioural-score tile).
function MiniBars({ data, color = '#08C465', heightClass = 'h-7', gapClass = 'gap-1' }: { data: number[]; color?: string; heightClass?: string; gapClass?: string }) {
  const max = Math.max(...data) || 1;
  return (
    <div className={`flex items-end ${gapClass} ${heightClass}`}>
      {data.map((v, i) => (
        <span key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(12, (v / max) * 100)}%`, background: color, opacity: 0.35 + (v / max) * 0.55 }} />
      ))}
    </div>
  );
}

// "Live desk" — streaming trade feed on the left, a live session panel on the
// right. All feed/session state lives here so both halves stay in sync. Static
// under reduced-motion (no new trades injected). SSR-safe: seeds are constant;
// randomness only runs inside the effect.
function LiveDesk() {
  const seed: TRow[] = LIVE_ROWS.slice(0, 7).map((r, i) => ({
    id: i, pair: r.pair, side: r.side as 'BUY' | 'SELL', size: r.size, dur: r.dur, tag: r.tag,
    pnl: parseFloat(r.pnl.replace(/[+,]/g, '')), time: r.time,
  }));
  const reduce = useReducedMotion();
  const [rows, setRows] = useState<TRow[]>(seed);
  const [session, setSession] = useState(723.12);
  const [count, setCount] = useState(8);
  const [streak, setStreak] = useState(3);
  const [equity, setEquity] = useState<number[]>(SESSION_SEED);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      const r = makeTrade();
      setRows(prev => [r, ...prev].slice(0, 7));
      setSession(s => s + r.pnl);
      setEquity(e => [...e.slice(1), (e[e.length - 1] ?? 40) + r.pnl / 45]);
      setCount(c => c + 1);
      setStreak(k => (r.pnl >= 0 ? k + 1 : 0));
    }, 2800);
    return () => clearInterval(t);
  }, []);

  const winRate = Math.round((rows.filter(r => r.pnl >= 0).length / rows.length) * 100);

  return (
    <div className="grid lg:grid-cols-5 gap-3 sm:gap-4">
      {/* Session panel — top on mobile, right on desktop */}
      <div className="lg:col-span-2 lg:order-2 relative tcard overflow-hidden p-5 sm:p-6 flex flex-col justify-between gap-6" style={{ boxShadow: 'var(--shadow-md)' }}>
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} aria-hidden />
        <div className="flex items-center justify-between text-[10px] tracking-[0.2em] text-fg-3 uppercase">
          <span>Session</span>
          <span className="flex items-center gap-1.5 text-profit"><span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> Live</span>
        </div>
        <div>
          <div className={STAT_LABEL}>Net P&amp;L today</div>
          <div className={`font-display font-black text-4xl sm:text-[42px] tracking-tighter mt-1.5 numeric ${session >= 0 ? 'text-profit' : 'text-loss'}`}>
            <AnimatedNumber value={session} format={fmtPnl} />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <WinDonut pct={winRate} />
            <span className="absolute inset-0 flex items-center justify-center font-display font-bold text-[13px] numeric">{winRate}%</span>
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className={STAT_LABEL}>Win rate</span>
            <span className="text-[13px] text-fg-2"><span className="text-profit numeric">{rows.filter(r => r.pnl >= 0).length}</span> of {rows.length} winners</span>
            <span className="mt-1 inline-flex items-center gap-1.5 self-start rounded-full border border-profit/30 bg-profit/10 px-2 py-0.5 text-[10px] text-profit whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> {streak} win streak
            </span>
          </div>
        </div>
        <div>
          <div className={`flex items-center justify-between ${STAT_LABEL} mb-2`}>
            <span>Session equity</span>
            <span className="numeric text-fg-2"><AnimatedNumber value={count} format={n => `${Math.round(n)}`} /> trades</span>
          </div>
          <SessionSpark data={equity} />
        </div>
      </div>

      {/* Trade feed — clean activity stream */}
      <div className="lg:col-span-3 lg:order-1 relative tcard overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }} data-testid="live-feed">
        <span className="pointer-events-none absolute inset-x-0 top-0 h-px z-10" style={{ background: 'rgba(255,255,255,0.05)' }} aria-hidden />
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-soft bg-app/70">
          <span className="w-2.5 h-2.5 rounded-full bg-loss/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-profit/70" />
          <span className="ml-auto text-[10px] tracking-[0.2em] text-profit flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> LIVE FEED
          </span>
        </div>
        <div className="h-[420px] overflow-hidden">
          <AnimatePresence initial={false}>
            {rows.map((r, i) => {
              const up = r.pnl >= 0;
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: reduce ? 0 : 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className={`flex items-center gap-3 px-4 py-3.5 border-b border-border-soft transition-colors hover:bg-surface-hover/50 ${i === 0 && !reduce ? 'row-flash' : ''}`}>
                    <span className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-bold ${up ? 'bg-profit/12 text-profit' : 'bg-loss/12 text-loss'}`}>
                      {r.side === 'BUY' ? '▲' : '▼'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-semibold tracking-wide">{r.pair}</span>
                        <span className={`text-[9px] tracking-widest ${up ? 'text-profit' : 'text-loss'}`}>{r.side}</span>
                      </div>
                      <div className="text-[10px] text-fg-3 mt-0.5 truncate">{r.tag} · {r.size} lots · {r.dur}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-[14px] numeric ${up ? 'text-profit' : 'text-loss'}`}>{fmtPnl(r.pnl)}</div>
                      <div className="text-[9px] text-fg-3 numeric mt-0.5">{r.time}</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// Hero product shot with a subtle scroll-linked parallax (drifts ~30px as the
// section moves through the viewport). Replaces the old CSS float. The entrance
// fade/rise is handled by <Reveal>; the parallax is a separate inner layer so
// the two transforms never fight. Static under reduced-motion.
function HeroImage() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [40, -40]);
  return (
    <Reveal delay={160} className="lg:col-span-7 relative" data-testid="hero-terminal">
      {/* On lg+ the shot is larger and bleeds a little past the right edge. */}
      <div ref={ref} className="relative lg:w-[112%] lg:max-w-none">
        <motion.div style={reduce ? undefined : { y }}>
          <ScreenshotFrame
            src="/Dashboard.png"
            alt="TRADElogs dashboard — net P&L, win rate and equity curve"
            width={3420}
            height={2214}
            priority
            sizes="(max-width: 1024px) 96vw, 60vw"
            className="-mx-2 sm:mx-0"
          />
        </motion.div>

        {/* Floating stat cards — hidden on mobile so they never overflow. */}
        <div className="hidden lg:block absolute -top-5 -left-5 z-20">
          <FloatingCard parallax={[-28, 28]}>
            <div className="text-[9px] tracking-[0.18em] text-fg-3 uppercase">Win rate</div>
            <div className="font-display font-black text-2xl tracking-tight text-profit leading-tight numeric">64%</div>
          </FloatingCard>
        </div>
        <div className="hidden lg:block absolute -bottom-5 right-2 z-20">
          <FloatingCard parallax={[22, -22]} className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
            <span className="text-[11px] text-fg-2 tracking-wide">MT5 · <span className="text-profit">connected</span></span>
          </FloatingCard>
        </div>
      </div>
    </Reveal>
  );
}

// Mini-visuals for the differentiator pipeline — small, on-brand product hints.
const PIPELINE = [
  {
    icon: LinkSimple,
    t: 'Auto-imported',
    b: 'Every trade, fee and commission pulled straight from MT5 — nothing typed by hand.',
    tag: 'MT5 · read-only',
    visual: (
      <div className="flex flex-col gap-1.5">
        {([['XAUUSD', '+$607'], ['EURUSD', '-$225'], ['NAS100', '+$1,193']] as const).map(([s, p]) => {
          const up = p.startsWith('+');
          return (
            <div key={s} className="flex items-center justify-between rounded-md border border-border-soft bg-app/50 px-2.5 py-1.5 text-[10px]">
              <span className="tracking-wider text-fg-2 flex items-center gap-1.5">
                <span className={`w-1 h-1 rounded-full ${up ? 'bg-profit' : 'bg-loss'}`} />{s}
              </span>
              <span className={`numeric ${up ? 'text-profit' : 'text-loss'}`}>{p}</span>
            </div>
          );
        })}
      </div>
    ),
  },
  {
    icon: Brain,
    t: 'Behavioural insights',
    b: 'Spot revenge trades, FOMO entries and tilt cycles before they cost you.',
    tag: 'Behaviour engine',
    visual: (
      <div className="flex flex-col gap-2.5 pt-1">
        {[['Discipline', 88, '#08C465'], ['Tilt risk', 34, '#FE3A31'], ['Consistency', 72, '#FFFFFF']].map(([l, v, c]) => (
          <div key={l as string}>
            <div className="flex justify-between text-[9px] tracking-[0.14em] uppercase text-fg-3 mb-1">
              <span>{l}</span><span className="numeric text-fg-2">{v}</span>
            </div>
            <div className="h-1 rounded-full bg-border-soft overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${v}%`, background: c as string }} />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: ChatCircle,
    t: 'Actionable reviews',
    b: 'Every Monday, a plain-language review of your real trades — telling you the one thing to fix this week.',
    tag: 'Weekly game plan',
    visual: (
      <div className="rounded-lg border border-border-soft bg-app/50 p-3">
        <div className="text-[9px] tracking-[0.16em] uppercase text-fg-3 mb-1.5">Monday review</div>
        <p className="text-[11px] text-fg-2 leading-relaxed">
          Your <span className="text-profit">London longs</span> are printing. Losses cluster <span className="text-loss">after 3PM</span> — stop earlier.
        </p>
      </div>
    ),
  },
] as const;

// Connected 3-step pipeline with a green line that draws in on scroll behind the
// cards (desktop), and per-card mini-visuals. Staggered reveal, hover-lift.
function Pipeline() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'start 40%'] });
  const dash = useTransform(scrollYProgress, [0, 1], [1, 0]);
  return (
    <div ref={ref} className="relative mt-10 sm:mt-12">
      {/* Connecting line (desktop only) */}
      <svg className="hidden sm:block absolute left-0 right-0 top-[42px] w-full h-px z-0" preserveAspectRatio="none" viewBox="0 0 100 1">
        <line x1="8" y1="0.5" x2="92" y2="0.5" stroke="#1E1E1E" strokeWidth="1" />
        <motion.line
          x1="8" y1="0.5" x2="92" y2="0.5" stroke="#08C465" strokeWidth="1"
          pathLength={1} strokeDasharray="1"
          style={reduce ? { strokeDashoffset: 0 } : { strokeDashoffset: dash }}
        />
      </svg>
      <RevealGroup className="grid sm:grid-cols-3 gap-3 sm:gap-4 relative z-10">
        {PIPELINE.map((c, i) => (
          <RevealItem key={c.t} className="group relative tcard tcard-hover overflow-hidden p-5 sm:p-6 flex flex-col hover:border-profit/40">
            <span className="absolute top-0 left-0 h-0.5 w-full origin-left scale-x-0 bg-profit/70 transition-transform duration-[var(--dur-select)] group-hover:scale-x-100" />
            <div className="flex items-center justify-between mb-4">
              <span className="w-11 h-11 rounded-lg bg-profit/10 border border-profit/25 flex items-center justify-center text-profit transition-transform duration-[var(--dur-hover)] group-hover:scale-110">
                <c.icon size={22} weight="duotone" />
              </span>
              <span className="font-display font-black text-2xl text-border-strong transition-colors group-hover:text-fg-3">0{i + 1}</span>
            </div>
            <h3 className="font-display font-bold text-[16px] tracking-tight">{c.t}</h3>
            <p className="text-fg-2 text-[12px] leading-relaxed mt-2">{c.b}</p>
            <div className="mt-4 pt-4 border-t border-border-soft flex-1">{c.visual}</div>
            <div className="mt-4 flex items-center gap-1.5 text-[10px] tracking-[0.18em] text-fg-3 uppercase transition-colors group-hover:text-profit">
              {c.tag} <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
            </div>
          </RevealItem>
        ))}
      </RevealGroup>
    </div>
  );
}

// Consistent, stylish section label: a short green accent rule + tracked text.
function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 text-[10px] sm:text-[11px] tracking-[0.3em] text-fg-3 uppercase ${className}`}>
      <span className="w-7 h-px bg-profit/70" />
      {children}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [stepPaused, setStepPaused] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Auto-advance the how-it-works stepper so the section feels alive; pauses
  // while the user is hovering/interacting with it.
  useEffect(() => {
    if (stepPaused) return;
    const t = setInterval(() => setStep(s => (s + 1) % STEPS.length), 3800);
    return () => clearInterval(t);
  }, [stepPaused]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen text-fg overflow-x-hidden" data-testid="landing-page">
      {/* Fixed layered page backdrop (black + soft green top glow + faded grid) */}
      <div className="page-backdrop" aria-hidden />
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

      {/* HERO — copy left, product screenshot right */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-60" />
        <div className="absolute right-[-10%] top-[-120px] w-[820px] h-[820px] max-w-[130vw] glow-radial opacity-60" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-14 sm:pt-20 pb-16 sm:pb-24 grid lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          {/* Left: copy */}
          <div className="lg:col-span-5">
            <Reveal as="h1" className="font-display font-black uppercase tracking-tight text-[40px] sm:text-[56px] md:text-[64px] lg:text-[72px] leading-[1.02] sm:leading-[0.98]">
              Understand your <span className="text-fg-2">trading.</span><br />
              <span className="text-profit">Improve</span> every day.
            </Reveal>
            <Reveal as="p" delay={160} className="text-fg-2 mt-6 max-w-xl text-[13px] sm:text-[15px] leading-relaxed">
              TRADElogs connects to your MetaTrader 5 account and imports every trade for you. It shows you clear, easy-to-read insights about your habits — like impulse trades, chasing the market, and the times of day you tend to lose money.
            </Reveal>
            <Reveal delay={240} className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/dashboard" className="btn btn-primary px-6 py-3 text-[13px] justify-center" data-testid="hero-cta-launch">
                GET STARTED FREE
              </Link>
              <a href="#how" className="btn btn-ghost px-6 py-3 text-[13px] justify-center" data-testid="hero-cta-features">
                SEE HOW IT WORKS
              </a>
            </Reveal>
            {/* Trust stats */}
            <Reveal delay={320} className="mt-10 grid grid-cols-3 max-w-lg border border-border">
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

          {/* Right: dashboard screenshot with a subtle scroll parallax */}
          <HeroImage />
        </div>
      </section>

      {/* MISSION strip */}
      <section className="section-raised section-grain relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-14 sm:py-20 relative">
          <WatermarkNumber className="right-0 -top-8 lg:-top-12">WHY</WatermarkNumber>
          <div className="relative grid lg:grid-cols-12 gap-8 lg:gap-10 items-end">
            <Reveal className="lg:col-span-8">
              <Eyebrow className="mb-4">WHY TRADELOGS</Eyebrow>
              <h2 className="font-display font-black tracking-tighter text-2xl sm:text-3xl md:text-4xl lg:text-5xl leading-[1.05]">
                <span className="text-fg-2">A trading journal that actually helps you </span>
                <span className="text-gradient-brand">learn and improve </span>
                <span className="text-fg-2">— not just take notes.</span>
              </h2>
            </Reveal>
            <Reveal delay={120} className="lg:col-span-4">
              <p className="text-fg-2 text-[12px] sm:text-[13px] leading-relaxed">
                Most journals are just spreadsheets you forget to fill in. TRADElogs reads every fill automatically and turns it into habits you can actually fix.
              </p>
              <div className="mt-5 grid grid-cols-3 gap-3">
                {[
                  { v: 8500, fmt: (n: number) => `${Math.round(n / 1000)}K+`, l: 'Traders' },
                  { v: 90,   fmt: (n: number) => `${Math.round(n)}s`,        l: 'To connect' },
                  { v: 100,  fmt: (n: number) => `${Math.round(n)}%`,        l: 'Auto-logged' },
                ].map(s => (
                  <div key={s.l}>
                    <Metric value={s.v} format={s.fmt} className="font-display font-black text-2xl sm:text-3xl tracking-tight text-fg" />
                    <div className="text-[9px] tracking-[0.16em] text-fg-3 uppercase mt-1">{s.l}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Differentiators — a connected 3-step pipeline: import → understand → improve */}
          <Pipeline />
        </div>
      </section>

      {/* PLATFORM — built for serious traders */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 relative">
          <WatermarkNumber className="left-1/2 -translate-x-1/2 -top-2 sm:-top-6 text-[90px] sm:text-[170px]">PLATFORM</WatermarkNumber>
          <Reveal className="relative text-center max-w-2xl mx-auto">
            <Eyebrow>PLATFORM</Eyebrow>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">
              Built for <span className="text-gradient-brand">serious traders.</span>
            </h2>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-5">
              Everything you need to journal, analyze and improve — powered by insights that actually understand your trading.
            </p>
          </Reveal>

          <div className="relative grid grid-cols-12 gap-3 sm:gap-4 mt-10 sm:mt-12 items-stretch">
            <div className="glow-blob left-0 top-4 w-[55%] h-[70%]" aria-hidden />

            {/* Dominant equity card */}
            <Reveal className="tcard col-span-12 lg:col-span-8 lg:row-span-2 p-5 sm:p-6 flex flex-col" style={{ boxShadow: 'var(--shadow-md)' }}>
              <span className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-[var(--radius-card)]" style={{ background: 'rgba(255,255,255,0.05)' }} aria-hidden />
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-[11px] tracking-[0.25em] text-fg-3">EQUITY CURVE</span>
                <span className="text-[10px] text-profit flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> LIVE</span>
              </div>
              <div className="flex items-end justify-between gap-3 mt-3">
                <p className="text-fg-2 text-[12px] max-w-xs leading-relaxed">A live-updating equity curve that shows your real edge compounding over time.</p>
                <div className="text-right shrink-0">
                  <Metric value={49.7} format={n => `+${n.toFixed(1)}%`} className="font-display font-black text-3xl sm:text-4xl tracking-tighter text-profit" />
                  <div className="text-[9px] tracking-[0.16em] text-fg-3 uppercase mt-0.5">YTD return</div>
                </div>
              </div>
              <div className="mt-5 flex-1 min-h-[200px] rounded-xl border border-border-soft bg-app/40 p-3 flex items-center">
                <LiveEquityChart height={220} />
              </div>
              <div className="grid grid-cols-3 gap-3 border-t border-border-soft mt-4 pt-4">
                <Stat reserve label="Peak equity" value="+$12,418" valueClass="text-profit" />
                <Stat reserve label="Max drawdown" value="-6.2%" valueClass="text-loss" />
                <Stat reserve label="Trades" value="78" />
              </div>
            </Reveal>

            {/* Hero score tile */}
            <Reveal delay={90} className="tcard col-span-12 sm:col-span-6 lg:col-span-4 p-5 sm:p-6 flex flex-col justify-between gap-5 overflow-hidden" style={{ boxShadow: 'var(--shadow-md)' }}>
              <div className="glow-blob -right-6 -top-6 w-[70%] h-[70%] opacity-70" aria-hidden />
              <span className="relative text-[10px] sm:text-[11px] tracking-[0.25em] text-profit">BEHAVIORAL SCORE</span>
              <div className="relative flex items-baseline gap-1.5">
                <Metric value={82} format={n => `${Math.round(n)}`} className="font-display font-black text-6xl sm:text-7xl tracking-tighter text-fg leading-none numeric" />
                <span className="font-display font-bold text-xl text-fg-3">/100</span>
              </div>
              <div className="relative">
                <div className="flex items-center justify-between gap-3 mb-2.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-profit/30 bg-profit/10 px-2.5 py-1 text-[11px] text-profit whitespace-nowrap">▲ +6 this month</span>
                  <span className="text-[9px] tracking-[0.16em] text-fg-3 uppercase">7-month trend</span>
                </div>
                <MiniBars data={[54, 60, 58, 66, 71, 76, 82]} heightClass="h-14 sm:h-16" gapClass="gap-1.5" />
              </div>
            </Reveal>

            {/* Radar tile */}
            <Reveal delay={140} className="tcard col-span-12 sm:col-span-6 lg:col-span-4 p-5 sm:p-6 flex flex-col" style={{ boxShadow: 'var(--shadow-md)' }}>
              <span className="text-[10px] sm:text-[11px] tracking-[0.25em] text-fg-3">TRADER PROFILE</span>
              <div className="flex-1 flex items-center justify-center w-full min-h-[200px] py-2"><RadarScore /></div>
              <div className="grid grid-cols-2 gap-x-4 border-t border-border-soft pt-4">
                <div className="min-w-0">
                  <div className={STAT_LABEL}>Top strength</div>
                  <div className="text-[13px] font-semibold text-profit mt-1 truncate">Discipline · <span className="numeric">90</span></div>
                </div>
                <div className="min-w-0">
                  <div className={STAT_LABEL}>Work on</div>
                  <div className="text-[13px] font-semibold text-loss mt-1 truncate">Timing · <span className="numeric">60</span></div>
                </div>
              </div>
            </Reveal>

            {/* Four metric mini-cards, each with a micro-visual + count-up */}
            {[
              { l: 'Metrics per trade', value: 21, fmt: (n: number) => `${Math.round(n)}+`, c: 'text-fg', vis: <MiniBars data={[8, 12, 10, 15, 13, 18, 21]} color="#08C465" /> },
              { l: 'Long win rate', value: 61, fmt: (n: number) => `${Math.round(n)}%`, c: 'text-profit', vis: <MiniSpark data={[44, 48, 46, 52, 55, 58, 61]} /> },
              { l: 'Profit factor', value: 1.53, fmt: (n: number) => n.toFixed(2), c: 'text-profit', vis: <MiniSpark data={[1.1, 1.2, 1.15, 1.3, 1.38, 1.46, 1.53]} /> },
              { l: 'Avg reward:risk', value: 2.4, fmt: (n: number) => `1:${n.toFixed(1)}`, c: 'text-fg', vis: <MiniBars data={[10, 14, 12, 16, 18, 20, 24]} color="#08C465" /> },
            ].map((m, i) => (
              <Reveal key={m.l} delay={60 + i * 50} className="tcard col-span-6 lg:col-span-3 p-4 sm:p-5 flex flex-col justify-between gap-3 min-h-[140px]" style={{ boxShadow: 'var(--shadow-md)' }}>
                <div className={`${STAT_LABEL} min-h-[2.1em]`}>{m.l}</div>
                <div className={`font-display font-black text-[26px] sm:text-3xl tracking-tight numeric ${m.c}`}>
                  <Metric value={m.value} format={m.fmt} />
                </div>
                <div className="h-7">{m.vis}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — vertical stepper synced to a visual */}
      <section id="how" className="section-raised section-grain relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 relative">
          <WatermarkNumber className="hidden sm:block right-0 -top-4 lg:-top-10">HOW</WatermarkNumber>
          <Reveal className="max-w-2xl relative">
            <Eyebrow>HOW IT WORKS</Eyebrow>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">
              From broker to <span className="text-gradient-brand">edge.</span>
            </h2>
          </Reveal>

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center mt-10 sm:mt-12">
            {/* Left: a stepped journey on a vertical progress rail */}
            <Reveal
              className="relative"
              data-testid="how-stepper"
              onMouseEnter={() => setStepPaused(true)}
              onMouseLeave={() => setStepPaused(false)}
            >
              {STEPS.map((s, i) => {
                const active = step === i;
                const done = step > i;
                const last = i === STEPS.length - 1;
                return (
                  <button
                    key={s.key}
                    onClick={() => setStep(i)}
                    data-testid={`step-${s.key}`}
                    aria-current={active}
                    className="group relative flex gap-4 sm:gap-5 text-left w-full pb-7 last:pb-0"
                  >
                    {/* Rail node + connector */}
                    <div className="relative flex flex-col items-center shrink-0">
                      <span
                        className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-[13px] border transition-all duration-[var(--dur-select)]
                          ${active ? 'bg-profit text-black border-profit shadow-[0_0_0_5px_rgba(8,196,101,0.14)]'
                            : done ? 'bg-profit/15 text-profit border-profit/50'
                            : 'bg-surface text-fg-3 border-border-strong'}`}
                      >
                        {active && <span className="absolute inset-0 rounded-full bg-profit/40 animate-ping" aria-hidden />}
                        <span className="relative">{done ? '✓' : i + 1}</span>
                      </span>
                      {!last && (
                        <span className="relative mt-1.5 w-px flex-1 bg-border-soft overflow-hidden rounded-full">
                          <span
                            className="absolute inset-x-0 top-0 bg-profit rounded-full transition-[height] duration-700 ease-[var(--ease-premium)]"
                            style={{ height: done ? '100%' : '0%' }}
                          />
                        </span>
                      )}
                    </div>

                    {/* Content — always rendered (no expand/collapse → no shift) */}
                    <div className={`flex-1 pb-1 transition-opacity duration-[var(--dur-select)] ${active ? 'opacity-100' : 'opacity-55 group-hover:opacity-80'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className={`font-display font-bold text-[15px] sm:text-lg tracking-tight ${active ? 'text-fg' : 'text-fg-2'}`}>{s.title}</h3>
                        <span className="text-[9px] tracking-[0.18em] text-fg-3 uppercase shrink-0">{s.meta}</span>
                      </div>
                      <p className="text-fg-2 text-[12px] sm:text-[13px] leading-relaxed mt-2 max-w-md">{s.body}</p>
                      {/* Auto-advance track — always present so height never changes */}
                      <div className="mt-3 h-0.5 bg-border-soft/70 rounded-full overflow-hidden">
                        <div
                          key={active && !stepPaused ? `run-${step}` : `static-${i}`}
                          className={`h-full bg-profit/70 rounded-full ${active && !stepPaused && !reduce ? 'step-progress' : ''}`}
                          style={{ width: done ? '100%' : active && (stepPaused || reduce) ? '100%' : '0%' }}
                        />
                      </div>
                    </div>
                  </button>
                );
              })}
            </Reveal>

            {/* Right: one fixed-height stage; exactly one visual mounted at a time */}
            {(() => {
              const current = STEPS[step] ?? STEPS[0];
              return (
                <Reveal delay={80} className="relative w-full">
                  <div className="glow-blob -inset-6 opacity-70" aria-hidden />
                  <div className="relative tcard overflow-hidden h-[360px] sm:h-[380px] p-5 sm:p-7" style={{ boxShadow: 'var(--shadow-md)' }}>
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} aria-hidden />
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={step}
                        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: reduce ? 0 : -10 }}
                        transition={{ duration: reduce ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full flex flex-col"
                        data-testid={`how-visual-${current.key}`}
                      >
                        <div className="flex items-center justify-between mb-5 shrink-0">
                          <span className="text-[10px] tracking-[0.22em] text-fg-3">// {current.label}</span>
                          <span className="text-[10px] text-profit flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> LIVE</span>
                        </div>
                        <div className="flex-1 flex items-stretch min-h-0">{current.visual}</div>
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </Reveal>
              );
            })()}
          </div>
        </div>
      </section>

      {/* WATCH TRADES FLOW IN — live table */}
      <section id="analytics" className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 relative">
          <WatermarkNumber className="left-1/2 -translate-x-1/2 -top-2 sm:-top-6">LIVE</WatermarkNumber>
          <Reveal className="relative text-center max-w-2xl mx-auto">
            <Eyebrow>LIVE EXPERIENCE</Eyebrow>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">
              Watch trades <span className="text-gradient-brand">flow in.</span>
            </h2>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-5">
              Every trade auto-logged, categorized and scored in real time. No manual entry — just connect and trade.
            </p>
          </Reveal>

          <Reveal delay={100} className="relative mt-10 sm:mt-12" data-testid="live-trades">
            <div className="glow-blob left-1/2 -translate-x-1/2 top-4 w-[70%] h-[70%]" aria-hidden />
            <div className="relative"><LiveDesk /></div>
          </Reveal>
        </div>
      </section>

      {/* SEE IT IN ACTION — real product screenshots */}
      <section className="section-raised section-grain relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
          <Reveal className="text-center max-w-2xl mx-auto">
            <Eyebrow>SEE IT IN ACTION</Eyebrow>
            <h2 className="font-display font-black tracking-tighter text-3xl sm:text-4xl lg:text-5xl mt-3">
              The whole picture, <span className="text-gradient-brand">one screen.</span>
            </h2>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-5">
              Real screens from the app — your analytics and trade replay, exactly as you&apos;ll see them.
            </p>
          </Reveal>

          {/* Analytics — copy left, big screenshot right with floating cards */}
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center mt-12 sm:mt-16">
            <Reveal className="lg:col-span-5">
              <Eyebrow>ANALYTICS</Eyebrow>
              <h3 className="font-display font-black text-2xl sm:text-3xl lg:text-4xl tracking-tighter mt-4">Every angle of your edge.</h3>
              <p className="text-fg-2 text-[12px] sm:text-[13px] mt-4 max-w-md leading-relaxed">
                Win rate, profit factor, reward-to-risk, drawdown, best sessions and hold times — all in one clean, sortable view you can actually read.
              </p>
              <ul className="mt-6 flex flex-col gap-2.5 max-w-md">
                {['Break down performance by session, symbol and setup', 'Spot your most and least profitable habits', 'Sort and filter every metric in one click'].map(t => (
                  <li key={t} className="flex items-start gap-2.5 text-[12px] sm:text-[13px] text-fg-2 leading-snug">
                    <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-profit/12 border border-profit/30 flex items-center justify-center text-profit text-[9px]">✓</span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center gap-4 border-t border-border-soft pt-4 text-[11px] tracking-wide text-fg-3">
                <span>Profit factor <span className="text-profit numeric">1.53</span></span>
                <span className="w-px h-3 bg-border" />
                <span>Win rate <span className="text-fg-2 numeric">64%</span></span>
                <span className="w-px h-3 bg-border" />
                <span><span className="text-fg-2 numeric">21+</span> metrics</span>
              </div>
              <a href="#features" className="group inline-flex items-center gap-1.5 mt-6 text-[12px] tracking-wide text-profit">
                Explore analytics
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
              </a>
            </Reveal>
            <Reveal delay={120} className="lg:col-span-7 relative">
              <ScreenshotFrame src="/Analytics.png" alt="TRADElogs analytics screen" width={3420} height={2214} mobileSrc="/MobileAnalytics.png" mobileWidth={2894} mobileHeight={1864} sizes="(max-width: 1024px) 96vw, 58vw" className="-mx-2 sm:mx-0" />
              <div className="hidden lg:block absolute -top-5 -left-5 z-20">
                <FloatingCard parallax={[-26, 26]}>
                  <div className="text-[9px] tracking-[0.18em] text-fg-3 uppercase">Profit factor</div>
                  <div className="font-display font-black text-2xl tracking-tight text-profit leading-tight numeric">1.53</div>
                </FloatingCard>
              </div>
              <div className="hidden lg:block absolute -bottom-5 -right-4 z-20">
                <FloatingCard parallax={[24, -24]}>
                  <div className="text-[9px] tracking-[0.18em] text-fg-3 uppercase">Win rate</div>
                  <div className="font-display font-black text-2xl tracking-tight text-fg leading-tight numeric">29%</div>
                </FloatingCard>
              </div>
            </Reveal>
          </div>

          {/* Chart replay — big screenshot left, copy right */}
          <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center mt-16 sm:mt-24">
            <Reveal delay={120} className="lg:col-span-7 lg:order-2 relative">
              <ScreenshotFrame src="/ChartReplay.png" alt="TRADElogs chart replay screen" width={3420} height={2214} mobileSrc="/MobileCharts.png" mobileWidth={2216} mobileHeight={1464} sizes="(max-width: 1024px) 96vw, 58vw" className="-mx-2 sm:mx-0" />
              <div className="hidden lg:block absolute -top-5 -right-4 z-20">
                <FloatingCard parallax={[-24, 24]} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
                  <span className="text-[11px] text-fg-2 tracking-wide">Bar-by-bar playback</span>
                </FloatingCard>
              </div>
              <div className="hidden lg:block absolute -bottom-5 left-2 z-20">
                <FloatingCard parallax={[22, -22]}>
                  <div className="text-[9px] tracking-[0.18em] text-fg-3 uppercase">Entry → Exit</div>
                  <div className="font-display font-black text-xl tracking-tight text-profit leading-tight numeric">+$1,193</div>
                </FloatingCard>
              </div>
            </Reveal>
            <Reveal className="lg:col-span-5 lg:order-1">
              <Eyebrow>CHART REPLAY</Eyebrow>
              <h3 className="font-display font-black text-2xl sm:text-3xl lg:text-4xl tracking-tighter mt-4">Replay the moment it mattered.</h3>
              <p className="text-fg-2 text-[12px] sm:text-[13px] mt-4 max-w-md leading-relaxed">
                Step back into any trade bar-by-bar. See the hesitation, the early exit, the level you should have respected — then fix it for next time.
              </p>
              <ul className="mt-6 flex flex-col gap-2.5 max-w-md">
                {['Scrub any trade bar-by-bar on any timeframe', 'Entry and exit marked exactly where they fired', 'Add notes and tags to lock in the lesson'].map(t => (
                  <li key={t} className="flex items-start gap-2.5 text-[12px] sm:text-[13px] text-fg-2 leading-snug">
                    <span className="mt-0.5 w-4 h-4 shrink-0 rounded-full bg-profit/12 border border-profit/30 flex items-center justify-center text-profit text-[9px]">✓</span>
                    {t}
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex items-center gap-4 border-t border-border-soft pt-4 text-[11px] tracking-wide text-fg-3">
                <span>Any timeframe</span>
                <span className="w-px h-3 bg-border" />
                <span>Entry / exit marks</span>
                <span className="w-px h-3 bg-border" />
                <span>Notes &amp; tags</span>
              </div>
              <a href="#features" className="group inline-flex items-center gap-1.5 mt-6 text-[12px] tracking-wide text-profit">
                See the replay
                <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
              </a>
            </Reveal>
          </div>
        </div>
      </section>

      {/* AI — that actually knows your trading */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <Reveal className="lg:col-span-6">
            <Eyebrow>INSIGHTS</Eyebrow>
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
      <section id="features" className="section-raised section-grain relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24 relative">
        <WatermarkNumber className="right-0 -top-6 lg:-top-10">TOOLS</WatermarkNumber>
        <Reveal className="relative flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 sm:mb-10">
          <div>
            <Eyebrow>WHAT YOU GET</Eyebrow>
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
        </div>
      </section>

      {/* TESTIMONIAL / PROOF */}
      <section className="relative overflow-hidden">
        <WatermarkNumber className="right-0 top-2 sm:top-4">PROOF</WatermarkNumber>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-20 grid lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          <Reveal className="lg:col-span-7">
            <Eyebrow className="mb-4">TRADER STORY // 2026.01</Eyebrow>
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
      <section id="faq" className="section-raised section-grain relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-24">
        <Reveal>
          <Eyebrow className="mb-3">HELP</Eyebrow>
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
      <footer className="section-raised relative overflow-hidden">
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
