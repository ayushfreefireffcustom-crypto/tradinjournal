'use client';

import Logo from '@/components/logo';
import { ChartLineUp, ChartPieSlice, Target, ShieldCheck, CloudCheck, Lock } from '@phosphor-icons/react';

// The marketing left-panel for the auth screens. A calm, premium composition:
// logo, a big brand headline, a short value line, three feature rows, a
// testimonial, and a trust-badge footer — over a faded candlestick-chart
// backdrop with a soft green glow. Purely presentational and static (SSR-safe,
// reduced-motion-safe: no animation loops).

const PROFIT = '#08C465';
const LOSS = '#FE3A31';

// Ascending candlestick chart used as atmosphere behind the copy. A deliberately
// bullish "up and to the right" series (mostly green, a couple of natural
// pullbacks) with a glowing area fill under the trend line, refined rounded
// candles, and a soft price marker at the leading edge. Masked so it dissolves
// toward the text. Pure SVG — SSR-safe; the one-shot line draw-in is gated behind
// prefers-reduced-motion.
function BackdropChart() {
  // Close prices tell the story; opens chain to the previous close so the candles
  // read as one continuous chart rather than disconnected bars.
  const closes = [38, 44, 42, 50, 57, 54, 62, 70, 66, 74, 82, 88, 84, 93, 102, 110];
  const opens = [34, ...closes.slice(0, -1)];
  const wick = 5;
  const n = closes.length;

  const W = 560, H = 380, PAD = 28, GAP = 9;
  const cw = (W - PAD * 2 - GAP * (n - 1)) / n;
  const lo = 24, hi = 118;
  const ys = (v: number) => PAD + (1 - (v - lo) / (hi - lo)) * (H - PAD * 2);
  const cx = (i: number) => PAD + i * (cw + GAP) + cw / 2;

  const pts = closes.map((c, i) => [cx(i), ys(c)] as const);
  const first = pts[0]!;
  const last = pts[n - 1]!;
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const baseY = H - PAD + 10;
  const area = `${line} L ${last[0].toFixed(1)} ${baseY} L ${first[0].toFixed(1)} ${baseY} Z`;
  const gridVals = [92, 66, 40];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="auth-chart absolute right-0 top-1/2 -translate-y-1/2 w-[600px] max-w-[74%] h-auto pointer-events-none select-none"
      style={{
        WebkitMaskImage: 'radial-gradient(130% 105% at 82% 50%, #000 26%, transparent 80%)',
        maskImage: 'radial-gradient(130% 105% at 82% 50%, #000 26%, transparent 80%)',
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id="auth-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={PROFIT} stopOpacity="0.26" />
          <stop offset="55%" stopColor={PROFIT} stopOpacity="0.07" />
          <stop offset="100%" stopColor={PROFIT} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="auth-line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={PROFIT} stopOpacity="0.35" />
          <stop offset="100%" stopColor={PROFIT} stopOpacity="0.95" />
        </linearGradient>
        <filter id="auth-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* Baseline gridlines — barely-there structure */}
      {gridVals.map(v => (
        <line key={v} x1={PAD} y1={ys(v)} x2={W - PAD} y2={ys(v)} stroke="var(--color-border)" strokeWidth="1" opacity="0.4" />
      ))}

      {/* Glow fill under the trend */}
      <path d={area} fill="url(#auth-area)" opacity="0.9" />

      {/* Candles */}
      {closes.map((c, i) => {
        const o = opens[i]!;
        const up = c >= o;
        const col = up ? PROFIT : LOSS;
        const x = PAD + i * (cw + GAP);
        const top = ys(Math.max(o, c));
        const bot = ys(Math.min(o, c));
        return (
          <g key={i} opacity={up ? 0.62 : 0.52}>
            <line x1={x + cw / 2} y1={ys(Math.max(o, c) + wick)} x2={x + cw / 2} y2={ys(Math.min(o, c) - wick)} stroke={col} strokeWidth="1.1" strokeLinecap="round" />
            <rect x={x} y={top} width={cw} height={Math.max(2.5, bot - top)} rx="1.5" fill={col} />
          </g>
        );
      })}

      {/* Trend line, gradient stroke, one-shot draw-in */}
      <path
        className="auth-chart-line"
        d={line}
        fill="none"
        stroke="url(#auth-line)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Leading-edge price marker with a soft halo */}
      <circle cx={last[0]} cy={last[1]} r="9" fill={PROFIT} opacity="0.25" filter="url(#auth-glow)" />
      <circle cx={last[0]} cy={last[1]} r="3.4" fill={PROFIT} />
      <circle cx={last[0]} cy={last[1]} r="3.4" fill="none" stroke={PROFIT} strokeOpacity="0.5" strokeWidth="4" opacity="0.35" />
    </svg>
  );
}

const FEATURES = [
  { icon: ChartLineUp,   t: 'Track every trade',   b: 'Auto-imported from MT5 — never miss a fill.' },
  { icon: ChartPieSlice, t: 'Powerful analytics',  b: 'Understand your edge with deep insights.' },
  { icon: Target,        t: 'Build better habits', b: 'Spot the patterns and improve consistently.' },
];

export default function AuthAside({ variant }: { variant: 'signin' | 'signup' }) {
  const quote = variant === 'signin'
    ? { text: 'TRADElogs changed the way I see my trading. The insights are genuinely game-changing.', who: 'Rishab P., Full-time Trader' }
    : { text: 'Set up in minutes, and the weekly reviews keep me honest. Wish I had this years ago.', who: 'C. Henry, Forex Trader' };

  return (
    <aside
      className="hidden lg:flex flex-col relative overflow-hidden min-h-screen border-r border-border px-10 xl:px-14 py-10 xl:py-12"
      data-testid={`auth-aside-${variant}`}
    >
      {/* Atmosphere */}
      <div className="absolute inset-0 bg-grid bg-grid-fade opacity-25" aria-hidden />
      <div
        className="absolute -top-32 -right-24 w-[440px] h-[440px] rounded-full blur-3xl opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(8,196,101,0.30) 0%, transparent 70%)' }}
        aria-hidden
      />
      <BackdropChart />

      {/* Logo */}
      <div className="relative z-10">
        <Logo height={30} />
      </div>

      {/* Center copy */}
      <div className="relative z-10 flex-1 flex flex-col justify-center max-w-lg">
        <h2 className="font-display font-black tracking-tighter text-4xl xl:text-[52px] leading-[1.03]">
          Trade smarter.<br />
          Improve <span className="text-profit">every day.</span>
        </h2>
        <p className="text-fg-2 text-[13px] xl:text-[14px] mt-5 max-w-md leading-relaxed">
          Your all-in-one trading journal — connect MT5 and analyze, track and elevate your
          performance with real clarity.
        </p>

        {/* Feature rows */}
        <ul className="mt-9 flex flex-col gap-6">
          {FEATURES.map(f => (
            <li key={f.t} className="flex items-start gap-4">
              <span className="shrink-0 w-11 h-11 rounded-xl bg-profit/10 border border-profit/25 flex items-center justify-center text-profit">
                <f.icon size={20} weight="duotone" />
              </span>
              <div className="min-w-0 pt-0.5">
                <div className="font-display font-bold text-[15px] tracking-tight">{f.t}</div>
                <div className="text-fg-3 text-[12.5px] mt-0.5 leading-snug">{f.b}</div>
              </div>
            </li>
          ))}
        </ul>

        {/* Testimonial */}
        <figure className="mt-10 max-w-md rounded-2xl border border-border-soft bg-app/50 backdrop-blur-sm p-5">
          <div className="flex gap-3">
            <span className="font-display font-black text-2xl text-profit leading-none select-none">&ldquo;</span>
            <div className="min-w-0">
              <blockquote className="text-[13.5px] text-fg-2 leading-relaxed">{quote.text}</blockquote>
              <figcaption className="text-[12px] text-profit mt-2.5">— {quote.who}</figcaption>
            </div>
          </div>
        </figure>
      </div>

      {/* Trust badges */}
      <div className="relative z-10 flex flex-wrap items-center gap-x-7 gap-y-3 text-[11.5px] text-fg-2 pt-2">
        <span className="flex items-center gap-2"><ShieldCheck size={16} weight="duotone" className="text-profit" /> Bank-level encryption</span>
        <span className="flex items-center gap-2"><CloudCheck size={16} weight="duotone" className="text-profit" /> 99.98% uptime</span>
        <span className="flex items-center gap-2"><Lock size={16} weight="duotone" className="text-profit" /> Your data is private</span>
      </div>
    </aside>
  );
}
