'use client';

import Logo from '@/components/logo';
import { ChartLineUp, ChartPieSlice, Target, ShieldCheck, CloudCheck, Lock } from '@phosphor-icons/react';

// The marketing left-panel for the auth screens. A calm, premium composition:
// logo, a big brand headline, a short value line, three feature rows, a
// testimonial, and a trust-badge footer — over a faded candlestick-chart
// backdrop with a soft green glow. Purely presentational and static (SSR-safe,
// reduced-motion-safe: no animation loops).

// Faint ascending candlestick chart + trend line, used as atmosphere behind the
// copy. Green, low-opacity, masked so it fades toward the text.
function BackdropChart() {
  const candles: [number, number, number, number, 'up' | 'down'][] = [
    [40, 55, 34, 50, 'up'], [50, 58, 45, 47, 'down'], [47, 54, 40, 52, 'up'],
    [52, 66, 49, 63, 'up'], [63, 70, 58, 60, 'down'], [60, 76, 57, 73, 'up'],
    [73, 80, 68, 70, 'down'], [70, 88, 67, 85, 'up'], [85, 94, 80, 82, 'down'],
    [82, 104, 79, 100, 'up'], [100, 112, 95, 108, 'up'], [108, 116, 92, 96, 'down'],
    [96, 122, 92, 118, 'up'],
  ];
  const W = 520, H = 360, GAP = 10;
  const cw = (W - GAP * (candles.length + 1)) / candles.length;
  const lo = 30, hi = 128;
  const ys = (v: number) => 24 + (1 - (v - lo) / (hi - lo)) * (H - 48);
  const cx = (i: number) => GAP + i * (cw + GAP) + cw / 2;
  const line = candles.map((c, i) => `${i === 0 ? 'M' : 'L'} ${cx(i).toFixed(1)} ${ys(c[3]).toFixed(1)}`).join(' ');
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="absolute right-0 top-1/2 -translate-y-1/2 w-[560px] max-w-[70%] h-auto pointer-events-none select-none"
      style={{
        WebkitMaskImage: 'radial-gradient(120% 100% at 80% 50%, #000 30%, transparent 78%)',
        maskImage: 'radial-gradient(120% 100% at 80% 50%, #000 30%, transparent 78%)',
        opacity: 0.5,
      }}
      aria-hidden
    >
      <path d={line} fill="none" stroke="#08C465" strokeWidth="1.5" opacity="0.55" strokeLinecap="round" strokeLinejoin="round" />
      {candles.map(([o, h, l, c, dir], i) => {
        const x = GAP + i * (cw + GAP);
        const col = dir === 'up' ? '#08C465' : '#FE3A31';
        const top = ys(Math.max(o, c));
        const bot = ys(Math.min(o, c));
        return (
          <g key={i} opacity="0.5">
            <line x1={x + cw / 2} y1={ys(h)} x2={x + cw / 2} y2={ys(l)} stroke={col} strokeWidth="1" />
            <rect x={x} y={top} width={cw} height={Math.max(2, bot - top)} fill={col} />
          </g>
        );
      })}
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
