'use client';

// Landing sections for the scope added after v5: markets tools, strategies,
// options, and (when NEXT_PUBLIC_TRADING is on) the trading desk and copy
// trading. Same pieces as sections.tsx: Reveal, the l5-card bento, one drawn
// scene per card that plays once when it scrolls in. Every figure is a sample.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Reveal, useInViewOnce } from './ui';
import { TRADING_ENABLED } from '@/lib/features';

const v = (i: number) => ({ '--i': i } as CSSProperties);

function Head({ eyebrow, title, lead, id }: { eyebrow: string; title: ReactNode; lead?: ReactNode; id: string }) {
  return (
    <Reveal className={`l5-head ${lead ? '' : 'l5-head--solo'}`}>
      <div><p className="l5-eyebrow">{eyebrow}</p><h2 className="l5-h2" id={id}>{title}</h2></div>
      {lead && <p className="l5-lead">{lead}</p>}
    </Reveal>
  );
}

/** A card whose scene starts when it scrolls into view (adds .is-in). */
function Scene({ className = '', delay = 0, children }: { className?: string; delay?: number; children: (inView: boolean) => ReactNode }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  return (
    <Reveal as="article" delay={delay} className={`l5-card ${className}`}>
      <div ref={ref} className={`l5-scene ${inView ? 'is-in' : ''}`}>{children(inView)}</div>
    </Reveal>
  );
}

// Seeded so the server and the browser draw the same thing (no hydration drift).
function seeded(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const q = (n: number) => Math.round(n * 10) / 10;

/* ══ MARKETS ══════════════════════════════════════════════════════════════ */
const SCREEN = [
  { s: 'BTCUSDT', ch: 3.2, r: 'Strong buy', pts: [18, 14, 15, 9, 8, 3] },
  { s: 'ETHUSDT', ch: 1.8, r: 'Buy', pts: [16, 17, 12, 13, 9, 7] },
  { s: 'XAUUSD', ch: 0.6, r: 'Buy', pts: [14, 12, 13, 10, 11, 8] },
  { s: 'SOLUSDT', ch: -2.4, r: 'Sell', pts: [5, 8, 7, 12, 15, 18] },
  { s: 'EURUSD', ch: 0.1, r: 'Neutral', pts: [12, 10, 13, 11, 12, 11] },
];
const spark = (p: number[]) => p.map((y, i) => `${i ? 'L' : 'M'}${i * 20} ${y}`).join(' ');

function Screener() {
  return (
    <div className="l5-scr" aria-hidden>
      <div className="l5-scr-h"><span>Saved screen · morning scan</span><span>5 of 214</span></div>
      {SCREEN.map((r, i) => (
        <div key={r.s} className="l5-scr-r" style={v(i)}>
          <b>{r.s}</b>
          <svg viewBox="0 0 100 22" preserveAspectRatio="none"><path d={spark(r.pts)} fill="none" stroke={r.ch > 0.3 ? '#2EE58A' : r.ch < -0.3 ? '#FF6A62' : '#71717A'} strokeWidth="1.6" vectorEffect="non-scaling-stroke" /></svg>
          <span className={`l5-num ${r.ch > 0 ? 'l5-up' : r.ch < 0 ? 'l5-dn' : ''}`}>{r.ch > 0 ? '+' : r.ch < 0 ? '−' : ''}{Math.abs(r.ch).toFixed(1)}%</span>
          <span className={`l5-tag ${r.r.includes('Buy') || r.r.includes('buy') ? 'g' : r.r === 'Sell' ? 'r' : ''}`}>{r.r}</span>
        </div>
      ))}
    </div>
  );
}

const TOASTS: [string, string, string][] = [
  ['ETHUSDT · RSI(14) below 30', '1H · just now', 'Telegram'],
  ['XAUUSD crossed 3,960', 'Price alert · 2 min ago', 'Push'],
  ['Weekly review is ready', 'One thing to fix inside', 'Email'],
];
function Alerts() {
  return (
    <div className="l5-toasts" aria-hidden>
      {TOASTS.map(([t, s, src], i) => (
        <div key={t} className="l5-toast" style={v(i)}>
          <i><svg viewBox="0 0 16 16" width="15" height="15" fill="none"><path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1.5H3l1-1.5ZM6.5 14.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></i>
          <div><b>{t}</b><small>{s}</small></div><em>{src}</em>
        </div>
      ))}
    </div>
  );
}

function Ratings({ run }: { run: boolean }) {
  // −90° is strong sell, +90° strong buy; the needle settles in "Buy".
  const zones = ['Strong sell', 'Sell', 'Neutral', 'Buy', 'Strong buy'];
  return (
    <div className="l5-rate" aria-hidden>
      <svg viewBox="0 0 240 140">
        {zones.map((z, i) => {
          const a0 = Math.PI + (i / 5) * Math.PI + 0.03, a1 = Math.PI + ((i + 1) / 5) * Math.PI - 0.03, r = 96;
          const p = (a: number) => `${q(120 + Math.cos(a) * r)} ${q(124 + Math.sin(a) * r)}`;
          const col = ['#FE3A31', '#FF6A62', '#3A3A3A', '#2EE58A', '#08C465'][i];
          return <path key={z} d={`M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}`} fill="none" stroke={col} strokeWidth="12" strokeLinecap="round" opacity={i === 3 ? 1 : 0.45} />;
        })}
        <g className="l5-needle" style={{ transform: `rotate(${run ? 38 : -80}deg)` }}>
          <line x1="120" y1="124" x2="120" y2="44" stroke="#F4F4F5" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="120" cy="124" r="8" fill="#F4F4F5" />
      </svg>
      <p><b className="l5-up">Buy</b><span>BTCUSDT · 4H · 14 of 26 indicators agree</span></p>
    </div>
  );
}

const PAT = (() => {
  const r = seeded(5); const out: { o: number; c: number; h: number; l: number }[] = []; let p = 14;
  // a falling leg, a double bottom, then the break up
  const drift = [-1.6, -1.4, -1.2, -1, -1.3, -.6, .9, 1.1, .6, -.8, -1.1, -.9, -.3, .8, 1.2, 1.4, 1.1, 1.6, 1.2, 1.5, 1, 1.3];
  drift.forEach(d => { const o = p, c = p - d * 8 + (r() - .5) * 3; p = c; out.push({ o, c, h: Math.min(o, c) - r() * 4 - 1, l: Math.max(o, c) + r() * 4 + 1 }); });
  return out;
})();
function PatternChart() {
  const w = 300 / PAT.length;
  const low1 = 5, low2 = 11, neck = 7;
  const cx = (i: number) => q(i * w + w / 2);
  return (
    <svg className="l5-pat" viewBox="0 0 300 150" preserveAspectRatio="none" aria-hidden>
      {PAT.map((c, i) => {
        const up = c.c < c.o;
        return <g key={i} className="l5-candle" style={v(i)}>
          <line x1={cx(i)} x2={cx(i)} y1={q(c.h + 20)} y2={q(c.l + 20)} stroke={up ? '#2EE58A' : '#FF6A62'} strokeWidth="1" />
          <rect x={q(i * w + w * .22)} y={q(Math.min(c.o, c.c) + 20)} width={q(w * .56)} height={q(Math.max(1.5, Math.abs(c.c - c.o)))} rx="1" fill={up ? '#2EE58A' : '#FF6A62'} />
        </g>;
      })}
      <path className="l5-pat-w" d={`M${cx(2)} ${q(PAT[2]!.c + 20)} L${cx(low1)} ${q(PAT[low1]!.l + 24)} L${cx(neck)} ${q(PAT[neck]!.h + 16)} L${cx(low2)} ${q(PAT[low2]!.l + 24)} L${cx(15)} ${q(PAT[neck]!.h + 16)}`} fill="none" stroke="#7DF2B6" strokeWidth="1.6" strokeDasharray="4 4" />
      <line className="l5-pat-w" x1={cx(neck)} x2="300" y1={q(PAT[neck]!.h + 16)} y2={q(PAT[neck]!.h + 16)} stroke="#7DF2B6" strokeOpacity=".5" />
    </svg>
  );
}

function Countdown({ run }: { run: boolean }) {
  const [t, setT] = useState(42 * 60 + 10);
  useEffect(() => {
    if (!run) return;
    const id = setInterval(() => setT(x => (x > 0 ? x - 1 : 42 * 60 + 10)), 1000);
    return () => clearInterval(id);
  }, [run]);
  return <span className="l5-num l5-cd">00:{String(Math.floor(t / 60)).padStart(2, '0')}:{String(t % 60).padStart(2, '0')}</span>;
}

const FUND: [string, number, number][] = [['BTC', 0.010, 3.2], ['ETH', 0.013, 1.9], ['SOL', -0.004, -2.1], ['XRP', 0.006, 0.4], ['DOGE', 0.021, 5.6]];

export function Markets() {
  return (
    <section className="l5-core l5-mk" id="markets" aria-labelledby="mk-title">
      <div className="l5-wrap">
        <Head id="mk-title" eyebrow="Markets toolkit" title={<>Find the setup.<br />Get told when it’s <span className="l5-s">there.</span></>}
          lead="Screener, alerts, ratings, chart patterns, macro and news, in the same app as your journal. The plan and the review finally live together." />
        <div className="l5-bento">
          <Scene className="c7">{() => <>
            <div className="l5-k"><span>Screener</span><b>A</b></div>
            <h3>Scan the market by the numbers you trust.</h3>
            <p>Price, volume, funding, open interest and 36 indicators. Save the screens you run every morning.</p>
            <Screener />
          </>}</Scene>
          <Scene className="c5" delay={70}>{() => <>
            <div className="l5-k"><span>Alerts</span><b>B</b></div>
            <h3>Alerts in plain English.</h3>
            <p>“RSI on ETH 1H fell below 30.” Sent to Telegram, push, email or your inbox.</p>
            <Alerts />
          </>}</Scene>
          <Scene className="c4">{run => <>
            <div className="l5-k"><span>Ratings</span><b>C</b></div>
            <h3>Technical ratings at a glance.</h3>
            <Ratings run={run} />
          </>}</Scene>
          <Scene className="c8" delay={70}>{() => <>
            <div className="l5-k"><span>Charts</span><b>D</b></div>
            <div className="l5-chartrow">
              <div>
                <h3>Patterns found, drawn and explained.</h3>
                <p>Double bottoms, flags and wedges marked on the chart, with what they mean and where they fail.</p>
                <div className="l5-chips"><span>Heikin-Ashi</span><span>Renko</span><span>Kagi</span><span>Point &amp; Figure</span></div>
              </div>
              <div className="l5-patbox"><PatternChart /><span className="l5-pat-l">Double bottom · neckline break</span></div>
            </div>
          </>}</Scene>
          <Scene className="c5">{run => <>
            <div className="l5-k"><span>Calendar &amp; news</span><b>E</b></div>
            <h3>Know what moves today.</h3>
            <ul className="l5-evs" aria-hidden>
              <li className="hi"><span className="l5-num">14:30</span><div><b>US CPI</b><small>High impact · forecast 2.9%</small></div><Countdown run={run} /></li>
              <li><span className="l5-num">16:00</span><div><b>ISM services</b><small>Medium impact</small></div><em>USD</em></li>
              <li><span className="l5-num">19:00</span><div><b>Fed speaker</b><small>Medium impact</small></div><em>USD</em></li>
            </ul>
          </>}</Scene>
          <Scene className="c7" delay={70}>{() => <>
            <div className="l5-k"><span>Derivatives · macro</span><b>F</b></div>
            <h3>Funding, open interest and the big picture.</h3>
            <div className="l5-fund" aria-hidden>
              {FUND.map(([s, f, oi], i) => (
                <div key={s} style={v(i)}><b>{s}</b><span className={`l5-num ${f >= 0 ? 'l5-up' : 'l5-dn'}`}>{f >= 0 ? '+' : '−'}{Math.abs(f).toFixed(3)}%</span>
                  <i style={{ '--w': `${Math.min(100, Math.abs(oi) * 16)}%`, background: oi >= 0 ? 'var(--g)' : 'var(--r)' } as CSSProperties} /><small className="l5-num">OI {oi >= 0 ? '+' : '−'}{Math.abs(oi)}%</small></div>
              ))}
            </div>
            <div className="l5-macro"><span>Dollar <b className="l5-dn">weak</b></span><span>Rates <b>steady</b></span><span>Risk <b className="l5-up">on</b></span><span>Weekly brief <b>every Sunday</b></span></div>
          </>}</Scene>
        </div>
      </div>
    </section>
  );
}

/* ══ STRATEGIES ═══════════════════════════════════════════════════════════ */
const PROMPT = 'Buy oversold dips in an uptrend, risk 1%, stop 1.5 ATR';
const BLOCKS: [string, string, boolean?][] = [['WHEN', 'RSI(14) < 30'], ['AND', 'EMA 50 > EMA 200'], ['THEN', 'Buy · risk 1% of balance', true], ['EXIT', 'Stop 1.5 × ATR · target 3 × ATR']];
const BT = (() => { const r = seeded(23); let x = 0; const p: number[] = []; for (let i = 0; i < 64; i++) { x += (r() - 0.42) * 6; p.push(x); } const lo = Math.min(...p), hi = Math.max(...p); return p.map((y, i) => `${i ? 'L' : 'M'}${q((i / 63) * 400)} ${q(112 - ((y - lo) / (hi - lo)) * 100)}`).join(' '); })();

function Builder() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const [typed, setTyped] = useState(0);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setTyped(PROMPT.length); setStep(3); return; }
    let i = 0; const id = setInterval(() => { i++; setTyped(i); if (i >= PROMPT.length) { clearInterval(id); setStep(1); } }, 34);
    return () => clearInterval(id);
  }, [inView]);
  useEffect(() => {
    if (step === 1) { const t = setTimeout(() => setStep(2), 1500); return () => clearTimeout(t); }
    if (step === 2) { const t = setTimeout(() => setStep(3), 2200); return () => clearTimeout(t); }
  }, [step]);
  return (
    <div ref={ref} className={`l5-build ${step >= 1 ? 's1' : ''} ${step >= 2 ? 's2' : ''} ${step >= 3 ? 's3' : ''}`} aria-label="Example: a strategy built from one sentence, then backtested">
      <div className="l5-prompt"><i aria-hidden>→</i><span>{PROMPT.slice(0, typed)}{typed < PROMPT.length && <span className="l5-caret" />}</span></div>
      <div className="l5-blocks">{BLOCKS.map(([k, t, go], i) => <div key={k} className={`l5-blk ${go ? 'go' : ''}`} style={v(i)}><b>{k}</b>{t}</div>)}</div>
      <div className="l5-bt">
        <div className="l5-bt-h"><span>Backtest · BTC 4H · 2 years · sample</span><span className={step >= 2 ? 'l5-up' : ''}>{step >= 2 ? 'Done' : 'Running…'}</span></div>
        <svg viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden>
          <defs><linearGradient id="l5btg" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#08C465" stopOpacity=".3" /><stop offset="1" stopColor="#08C465" stopOpacity="0" /></linearGradient></defs>
          <path className="l5-bt-a" d={`${BT} L400 120 L0 120Z`} fill="url(#l5btg)" />
          <path className="l5-bt-l" d={BT} fill="none" stroke="#2EE58A" strokeWidth="2" vectorEffect="non-scaling-stroke" pathLength={1} />
        </svg>
        <div className="l5-bt-m"><div><small>Trades</small><b className="l5-num">142</b></div><div><small>Win rate</small><b className="l5-num">54%</b></div><div><small>Max drawdown</small><b className="l5-num l5-dn">8.1%</b></div></div>
      </div>
      <div className="l5-deploy"><span>Looks good? Run it on paper first.</span><span className="l5-btn l5-btn--acc l5-btn--sm l5-press" aria-hidden>Deploy on paper</span></div>
    </div>
  );
}

export function Strategies() {
  const steps: [string, string][] = [
    ['Describe it', 'In one sentence, or drag the rules in yourself.'],
    ['Backtest it', 'Years of candles, fees included, with a report you can export.'],
    ['Run it on paper', 'Live prices and simulated fills, for as long as you like.'],
    ...(TRADING_ENABLED ? [['Go live, if you want', 'Stop-loss and take-profit sit on the exchange.'] as [string, string]] : []),
  ];
  const [on, setOn] = useState(0);
  useEffect(() => { const id = setInterval(() => setOn(x => (x + 1) % steps.length), 2400); return () => clearInterval(id); }, [steps.length]);
  return (
    <section className="l5-strat" id="strategies" aria-labelledby="st-title">
      <div className="l5-wrap l5-two">
        <Reveal>
          <p className="l5-eyebrow">Strategies</p>
          <h2 className="l5-h2" id="st-title">Test the idea<br />before it <span className="l5-s">costs you.</span></h2>
          <p className="l5-lead">Describe a strategy in plain words. TRADElogs turns it into rules, backtests it on years of candles and runs it on paper before {TRADING_ENABLED ? 'anything trades for real' : 'you risk a single trade on it'}.</p>
          <ol className="l5-ststeps">
            {steps.map(([b, s], i) => <li key={b} className={i === on ? 'on' : ''}><span className="l5-num">{String(i + 1).padStart(2, '0')}</span><div><b>{b}</b><small>{s}</small></div></li>)}
          </ol>
        </Reveal>
        <Reveal delay={100}><div className="l5-chat l5-buildcard"><Builder /></div></Reveal>
      </div>
    </section>
  );
}

/* ══ OPTIONS + TRADING DESK ═══════════════════════════════════════════════ */
// 0.1 BTC bull call spread: long the 102k call, short the 110k call, $218 debit.
const K1 = 102000, K2 = 110000, DEBIT = 218, LO = 96000, HI = 116000;
const pay = (s: number) => (Math.max(0, s - K1) - Math.max(0, s - K2)) * 0.1 - DEBIT;
const MAXG = (K2 - K1) * 0.1 - DEBIT;
const px = (s: number) => ((s - LO) / (HI - LO)) * 400;
const py = (val: number) => 100 - (val / MAXG) * 82;

function Payoff() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const [s, setS] = useState(104180);
  const raf = useRef(0);
  useEffect(() => {
    if (!inView || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now();
    const f = (t: number) => { const k = (Math.sin((t - t0) / 1800) + 1) / 2; setS(LO + 1500 + k * (HI - LO - 3000)); raf.current = requestAnimationFrame(f); };
    raf.current = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf.current);
  }, [inView]);
  const pts: string[] = []; for (let x = LO; x <= HI; x += 250) pts.push(`${q(px(x))} ${q(py(pay(x)))}`);
  const d = `M${pts.join(' L')}`; const val = pay(s);
  return (
    <div ref={ref} className={`l5-payoff ${inView ? 'is-in' : ''}`}>
      <svg viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden>
        <line x1="0" x2="400" y1={py(0)} y2={py(0)} stroke="#262626" />
        <path d={`${d} L400 ${py(0)} L0 ${py(0)}Z`} fill="rgba(8,196,101,.08)" />
        <path className="l5-po-l" d={d} fill="none" stroke="#2EE58A" strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        <line x1={q(px(s))} x2={q(px(s))} y1="0" y2="200" stroke="#EDEDEF" strokeDasharray="3 4" opacity=".55" />
        <circle cx={q(px(s))} cy={q(py(val))} r="6" fill="#EDEDEF" />
      </svg>
      <span className="l5-po-t g">Max gain +${MAXG}</span><span className="l5-po-t r">Max loss −${DEBIT}</span>
      <div className="l5-po-read">
        <div><small>BTC price</small><b className="l5-num">{Math.round(s).toLocaleString('en-US')}</b></div>
        <div><small>P&amp;L</small><b className={`l5-num ${val >= 0 ? 'l5-up' : 'l5-dn'}`}>{val >= 0 ? '+' : '−'}${Math.abs(Math.round(val))}</b></div>
        <div><small>Break-even</small><b className="l5-num">104,180</b></div>
      </div>
    </div>
  );
}

const CHAIN: [number, string, string, string, string][] = [
  [100000, '6,420', '1,210', '48.2%', '0.71'], [102000, '5,090', '1,880', '47.6%', '0.62'], [104000, '3,960', '2,750', '47.1%', '0.52'], [106000, '2,980', '3,770', '47.4%', '0.43'], [108000, '2,190', '4,980', '48.0%', '0.34'],
];
function Chain() {
  return (
    <div className="l5-chain" aria-hidden>
      <div className="l5-chain-r h"><span>Call</span><span>Strike</span><span>Put</span><span>IV</span><span>Δ</span></div>
      {CHAIN.map(([k, c, p, iv, d], i) => (
        <div key={k} className={`l5-chain-r ${k === 104000 ? 'atm' : ''}`} style={v(i)}><span className="l5-num l5-up">{c}</span><b className="l5-num">{k.toLocaleString('en-US')}</b><span className="l5-num l5-dn">{p}</span><span className="l5-num">{iv}</span><span className="l5-num">{d}</span></div>
      ))}
    </div>
  );
}

function Ticket() {
  return (
    <div className="l5-desk" aria-hidden>
      <div className="l5-tk">
        <div className="l5-tk-sd"><span className="l">Long</span><span className="s">Short</span></div>
        <div className="l5-fld"><span>Size</span><b className="l5-num">0.050 BTC</b></div>
        <div className="l5-fld"><span>Take-profit</span><b className="l5-num l5-up">111,720</b></div>
        <div className="l5-fld"><span>Stop · trailing</span><b className="l5-num l5-dn">107,900</b></div>
      </div>
      <div className="l5-receipt">
        <b>Order filled</b><small>Delta Exchange India · sample</small>
        <p><span>BTCUSD long</span><span className="l5-num">0.050</span></p>
        <p><span>Avg price</span><span className="l5-num">108,214.0</span></p>
        <p><span>Take-profit</span><span className="l5-num">111,720.0</span></p>
        <p><span>Stop (trail)</span><span className="l5-num">107,900.0</span></p>
        <em>✓ Protected on the exchange</em>
      </div>
    </div>
  );
}

function Webhook() {
  const rows: [string, string, string][] = [['TradingView alert', '“BTC 15m breakout” fired', 'g'], ['Webhook received', 'Signature checked · IP allowed', ''], ['Order placed', 'BTCUSD long 0.05 · TP 111,720 · SL 107,900', 'g']];
  return (
    <ol className="l5-hook" aria-hidden>
      {rows.map(([b, s, c], i) => <li key={b} className={c} style={v(i)}><i>{i + 1}</i><div><b>{b}</b><small>{s}</small></div></li>)}
    </ol>
  );
}

export function Options() {
  return (
    <section className="l5-beh l5-opt" id="options" aria-labelledby="op-title">
      <div className="l5-wrap">
        <Head id="op-title" eyebrow={TRADING_ENABLED ? 'Options · trading desk' : 'Options'} title={<>See the payoff<br /><span className="l5-s">before</span> you trade.</>}
          lead={TRADING_ENABLED
            ? 'An option chain with greeks, 20 ready-made strategies and a replay to expiry. Then a trading desk for Delta Exchange India where every order carries its stop.'
            : 'An option chain with greeks, 20 ready-made strategies, a payoff chart you can read in a second and a replay of how a position would have played out to expiry.'} />
        <div className="l5-bento">
          <Reveal className="l5-card c7"><h3 className="l5-ct">Payoff, live. <span>Drag the price, watch the P&amp;L.</span></h3><Payoff /></Reveal>
          <Reveal className="l5-card c5" delay={70}><h3 className="l5-ct">Option chain. <span>Marks, IV and delta per strike.</span></h3><Chain /><div className="l5-chips l5-tpl"><span className="on">Bull call spread</span><span>Iron condor</span><span>Straddle</span><span>+17 more</span></div></Reveal>
          {TRADING_ENABLED && <>
            <Scene className="c5">{() => <><h3 className="l5-ct">An order ticket that thinks about risk first. <span>Take-profit, stop and trailing stop on every order.</span></h3><Ticket /></>}</Scene>
            <Scene className="c7" delay={70}>{() => <><h3 className="l5-ct">Your TradingView alerts, as orders. <span>Every request logged, with personal API keys for your own tools.</span></h3><Webhook /></>}</Scene>
          </>}
        </div>
      </div>
    </section>
  );
}

/* ══ COPY TRADING (only when trading is on) ═══════════════════════════════ */
export function Copy() {
  if (!TRADING_ENABLED) return null;
  return (
    <section className="l5-copy" id="copy" aria-labelledby="cp-title">
      <div className="l5-wrap l5-two">
        <Reveal className="l5-copy-art">
          <svg viewBox="0 0 600 560" preserveAspectRatio="xMidYMid slice" aria-hidden>
            <path className="l5-flow" d="M235 262 C 330 262, 360 150, 470 140" /><path className="l5-flow" d="M235 262 C 330 262, 380 280, 480 285" style={{ animationDelay: '-.4s' }} /><path className="l5-flow" d="M235 262 C 330 262, 360 390, 470 420" style={{ animationDelay: '-.8s' }} />
          </svg>
          <span className="l5-cl" style={{ left: '8%', top: '62%' }}><b>Leader K</b>Opened BTCUSD long</span>
          <span className="l5-cl" style={{ right: '5%', top: '16%' }}><b className="l5-up">Copied · 0.6 s</b>0.020 BTC</span>
          <span className="l5-cl" style={{ right: '3%', top: '46%' }}><b className="l5-up">Copied · 0.6 s</b>0.008 BTC</span>
          <span className="l5-cl" style={{ right: '6%', top: '74%' }}><b className="l5-up">Copied · 0.7 s</b>0.031 BTC</span>
        </Reveal>
        <Reveal delay={100}>
          <p className="l5-eyebrow">Copy trading · beta</p>
          <h2 className="l5-h2" id="cp-title">Follow traders<br />you can <span className="l5-s">check.</span></h2>
          <p className="l5-lead">Every leader’s full record is public. Copies are sized to your balance, and you set the daily loss limit.</p>
          <ul className="l5-sec-list l5-cp-list">
            <li><b>0.65 s</b><span>to copy one trade to 100 followers, in our tests.</span></li>
            <li><b>Top 3</b><span>shows how much of a leader’s profit came from three trades.</span></li>
            <li><b>Your limit</b><span>a daily loss limit that stops copying for the day.</span></li>
            <li><b>One tap</b><span>to stop copying. Open trades stay yours.</span></li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
