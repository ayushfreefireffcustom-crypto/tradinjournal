'use client';

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, CheckIcon, Reveal, StartButton, Wordmark, useCountUp, useInViewOnce } from './ui';
import { CandleField, OrbCanvas } from './effects';
import { candles, ENTRY_INDEX, EXIT_INDEX, HEAT_DAYS, heat, heatColor, heatDollars, REPLAY_H, REPLAY_W, tilt, traits } from './data';

const v = (i: number) => ({ '--i': i } as CSSProperties);
const Tick = () => <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden><path d="m2.5 6.2 2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" /></svg>;

function Head({ eyebrow, title, lead, id }: { eyebrow: string; title: ReactNode; lead?: ReactNode; id: string }) {
  return (
    <Reveal className={`l5-head ${lead ? '' : 'l5-head--solo'}`}>
      <div><p className="l5-eyebrow">{eyebrow}</p><h2 className="l5-h2" id={id}>{title}</h2></div>
      {lead && <p className="l5-lead">{lead}</p>}
    </Reveal>
  );
}

/* ══ FACTS ═══════════════════════════════════════════════════════════════ */
export function Facts() {
  const items: [ReactNode, string][] = [
    [<>90<span className="l5-s">s</span></>, 'From investor password to a full journal'],
    [<>40<span className="l5-s">+</span></>, 'Metrics calculated on every trade'],
    ['0', 'Rows of manual entry. Ever.'],
    [<>1<span className="l5-s">×</span></>, 'Thing to fix, every Monday'],
  ];
  return (
    <section className="l5-facts" aria-label="TRADElogs at a glance">
      <ul className="l5-wrap">
        {items.map(([b, s], i) => <Reveal as="li" key={i} delay={i * 60}><b>{b}</b><span>{s}</span></Reveal>)}
      </ul>
    </section>
  );
}

/* ══ CORE ════════════════════════════════════════════════════════════════ */
const STREAM = [
  ['XAUUSD', 'LONG', '14:02', 312.4], ['NAS100', 'SHORT', '13:41', -86.1], ['EURUSD', 'LONG', '12:18', 54.2], ['GBPJPY', 'SHORT', '11:56', 121.75],
  ['US30', 'LONG', '10:30', -40], ['XAUUSD', 'LONG', '09:12', 208.9], ['BTCUSD', 'SHORT', '08:47', 95.3], ['USDJPY', 'LONG', '08:05', -18.6],
] as const;
const METRICS: [string, string?, boolean?][] = [
  ['Expectancy', '+$41', true], ['Profit factor', '1.9'], ['Avg R', '1.4'], ['Win rate', '58%', true], ['Hold time'], ['MAE / MFE'], ['Session'],
  ['Max drawdown'], ['Best hour', '08:00', true], ['Streaks'], ['Commission drag'], ['Day of week'],
];

function Spot({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <Reveal as="article" delay={delay} className={`l5-card ${className}`}
      onPointerMove={(e: React.PointerEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`); e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`); }}>
      <span className="l5-spot" aria-hidden />
      {children}
    </Reveal>
  );
}

export function Core() {
  const rows = STREAM.map(([s, d, t, p], i) => (
    <div key={i} className={`l5-srow ${i === 0 ? 'is-new' : ''}`}>
      <b>{s}</b><span className={`l5-side ${d === 'LONG' ? 'l' : 's'}`}>{d}</span><span className="l5-mono l5-dim">{t}</span>
      <span className={`l5-mono ${p >= 0 ? 'l5-up' : 'l5-dn'}`}>{p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(2)}</span>
    </div>
  ));
  return (
    <section className="l5-core" id="product" aria-labelledby="core-title">
      <div className="l5-wrap">
        <Head id="core-title" eyebrow="The journal" title={<>Built like a ledger.<br />Reads like a <span className="l5-s">coach.</span></>}
          lead="No CSVs, no spreadsheets, no copy-paste. TRADElogs keeps itself up to date and turns raw fills into decisions." />
        <div className="l5-bento">
          <Spot className="c7">
            <div className="l5-k"><span>Import</span><b>A</b></div>
            <h3>Every fill, journaled the moment it closes.</h3>
            <p>Fees, swaps and partial closes — reconstructed into clean positions.</p>
            <div className="l5-stream" aria-hidden><div className="l5-stream-in">{rows}{rows}</div></div>
          </Spot>
          <Spot className="c5" delay={70}>
            <div className="l5-k"><span>Measure</span><b>B</b></div>
            <h3>40+ metrics on every trade.</h3>
            <p>The numbers serious traders actually check.</p>
            <div className="l5-metrics">{METRICS.map(([l, n, on]) => <span key={l} className={on ? 'on' : ''}>{l}{n && <b>{n}</b>}</span>)}</div>
          </Spot>
          <Spot className="c4">
            <div className="l5-k"><span>Connect</span><b>C</b></div>
            <h3>Set up in 90 seconds.</h3>
            <div className="l5-timer">
              <svg viewBox="0 0 96 96" width="96" height="96" aria-hidden><circle cx="48" cy="48" r="42" fill="none" stroke="#1E1E1E" strokeWidth="3" /><circle cx="48" cy="48" r="42" fill="none" stroke="url(#l5gt)" strokeWidth="3" strokeLinecap="round" strokeDasharray="263.9" strokeDashoffset="66" transform="rotate(-90 48 48)" /><defs><linearGradient id="l5gt"><stop stopColor="#7DF2B6" /><stop offset="1" stopColor="#08C465" /></linearGradient></defs></svg>
              <div><b>1:08</b><span>History backfilled</span></div>
            </div>
            <div className="l5-chips"><span><Tick />Login</span><span><Tick />Investor password</span><span><Tick />Server</span></div>
          </Spot>
          <Spot className="c8" delay={70}>
            <div className="l5-k"><span>Explain</span><b>D</b></div>
            <div className="l5-explain">
              <div>
                <p className="l5-quote">“Tuesdays bleed. <span>Size down</span> after 15:00 — your edge lives in the London open.”</p>
                <p className="l5-quote-src"><i aria-hidden />Plain-English insight, written from your own fills</p>
              </div>
              <svg viewBox="0 0 300 150" aria-hidden className="l5-eq">
                <defs><linearGradient id="l5eq" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#08C465" stopOpacity=".42" /><stop offset="1" stopColor="#08C465" stopOpacity="0" /></linearGradient></defs>
                <path d="M0 120 C30 112 40 118 60 100 S95 86 110 92 140 70 160 64 190 74 205 58 240 36 260 40 285 22 300 18 V150 H0Z" fill="url(#l5eq)" />
                <path d="M0 120 C30 112 40 118 60 100 S95 86 110 92 140 70 160 64 190 74 205 58 240 36 260 40 285 22 300 18" fill="none" stroke="#5CF0A6" strokeWidth="2" />
                <circle cx="296" cy="19" r="4" fill="#fff" />
              </svg>
            </div>
          </Spot>
        </div>
      </div>
    </section>
  );
}

/* ══ BEHAVIOUR ═══════════════════════════════════════════════════════════ */
function ReplayChart() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const W = REPLAY_W, H = REPLAY_H, w = W / candles.length;
  const mn = Math.min(...candles.map(c => c.l)), mx = Math.max(...candles.map(c => c.h));
  const y = (val: number) => H - 24 - ((val - mn) / (mx - mn)) * (H - 50);
  const ex = ENTRY_INDEX * w + w / 2, xx = EXIT_INDEX * w + w / 2;
  const ey = y(candles[ENTRY_INDEX]!.c), xy = y(candles[EXIT_INDEX]!.c);
  return (
    <div ref={ref} className={`l5-replay ${inView ? 'is-in' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Candlestick chart of a long trade: entry at 1.0842, exit for +$256.00">
        <defs><linearGradient id="l5band" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#08C465" stopOpacity=".16" /><stop offset="1" stopColor="#08C465" stopOpacity=".02" /></linearGradient></defs>
        {[0, 1, 2, 3, 4].map(i => <line key={i} x1={0} x2={W} y1={20 + i * 62} y2={20 + i * 62} stroke="#161616" vectorEffect="non-scaling-stroke" />)}
        <rect className="l5-band" x={ex} y={Math.min(ey, xy)} width={xx - ex} height={Math.abs(ey - xy)} fill="url(#l5band)" />
        {candles.map((k, i) => {
          const x = i * w + w / 2, col = k.c >= k.o ? '#08C465' : '#FE3A31';
          return (
            <g key={i} className="l5-candle" style={v(i)}>
              <line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} stroke={col} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              <rect x={x - w * 0.32} y={y(Math.max(k.o, k.c))} width={w * 0.64} height={Math.max(2, Math.abs(y(k.o) - y(k.c)))} rx={1.5} fill={col} />
            </g>
          );
        })}
        <g className="l5-tlines">
          <line x1={ex} x2={W} y1={ey} y2={ey} stroke="#fff" strokeOpacity=".55" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          <line x1={xx} x2={W} y1={xy} y2={xy} stroke="#2EE58A" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      <div className="l5-pins">
        <span className="l5-pin e" style={{ left: `${(ex / W) * 100}%`, top: `${(ey / H) * 100}%` }}><i /><em>Entry 1.0842</em></span>
        <span className="l5-pin x" style={{ left: `${(xx / W) * 100}%`, top: `${(xy / H) * 100}%` }}><i /><em>Exit · +$256.00</em></span>
      </div>
    </div>
  );
}

const RULES = Array.from({ length: 22 }, (_, i) => ![5, 13, 17, 19].includes(i));
function ScoreCard() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const n = useCountUp(82, inView);
  const C = 2 * Math.PI * 72, arc = C * 0.75;
  return (
    <div ref={ref} className={`l5-score ${inView ? 'is-in' : ''}`}>
      <div className="l5-score-top">
        <div className="l5-gauge">
          <svg viewBox="0 0 170 170" aria-hidden><defs><linearGradient id="l5gg" x1="0" x2="1" y1="1" y2="0"><stop stopColor="#06A253" /><stop offset="1" stopColor="#7DF2B6" /></linearGradient></defs>
            <circle cx="85" cy="85" r="72" fill="none" stroke="#1C1C1C" strokeWidth="12" strokeDasharray={`${arc} ${C}`} strokeLinecap="round" transform="rotate(135 85 85)" />
            <circle className="v" cx="85" cy="85" r="72" fill="none" stroke="url(#l5gg)" strokeWidth="12" strokeDasharray={`${inView ? arc * 0.82 : 0} ${C}`} strokeLinecap="round" transform="rotate(135 85 85)" /></svg>
          <b aria-label="82 out of 100"><span className="l5-num">{n}</span><small>of 100 · ▲ 6</small></b>
        </div>
        <ul className="l5-traits">
          {traits.map((t, i) => (
            <li key={t.label}>{t.label}
              <span className="l5-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.value} aria-label={t.label}>
                <i style={{ width: `${t.value}%`, ...('warn' in t ? { background: 'linear-gradient(90deg,#C98A00,#F2B53A)' } : {}), ...v(i) }} />
              </span>
              <b className="l5-mono">{t.value}</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="l5-rules">
        <div className="l5-rules-h"><span>Rules kept this week</span><b className="l5-mono">18 / 22</b></div>
        <div className="l5-dots" aria-hidden>{RULES.map((ok, i) => <i key={i} className={ok ? '' : 'x'} style={v(i)} />)}</div>
        <div className="l5-rchips"><span>Max 3 trades/day</span><span>Stop after 2 losses</span><span className="w">No trades after 15:00</span></div>
      </div>
    </div>
  );
}

function TiltCard() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  return (
    <div ref={ref} className={`l5-tilt ${inView ? 'is-in' : ''}`} role="img" aria-label="Trade sequence: wins and losses, ending with four rapid losing trades flagged as revenge trading">
      <div className="l5-zone"><em>Revenge · 4 in 11 min</em></div>
      {tilt.map((b, i) => <i key={i} className={b.win ? 'g' : 'r'} style={{ height: `${b.h}%`, ...v(i) }} />)}
    </div>
  );
}

function Heatmap() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const [tip, setTip] = useState<{ x: number; y: number; d: string; h: number; v: number } | null>(null);
  return (
    <div className="l5-heat-wrap">
      <div ref={ref} className={`l5-heat ${inView ? 'is-in' : ''}`} onPointerLeave={() => setTip(null)}>
        {HEAT_DAYS.map((d, di) => (
          <div key={d} style={{ display: 'contents' }}>
            <span className="l5-day">{d}</span>
            {heat[di]!.map((val, h) => (
              <i key={h} className={h < 6 || h > 20 ? 'l5-off-m' : ''} style={{ background: heatColor(val), ...v(di * 24 + h) }}
                onPointerEnter={e => {
                  const box = (e.currentTarget.closest('.l5-heat') as HTMLElement).getBoundingClientRect();
                  const r = e.currentTarget.getBoundingClientRect();
                  setTip({ x: r.left - box.left + r.width / 2, y: r.top - box.top, d, h, v: val });
                }} />
            ))}
          </div>
        ))}
        {tip && (
          <span className="l5-tip" style={{ left: tip.x, top: tip.y }}>
            {tip.d} {String(tip.h).padStart(2, '0')}:00 · <b className={tip.v > 0 ? 'l5-up' : tip.v < 0 ? 'l5-dn' : ''}>{tip.v === 0 ? 'no trades' : `${tip.v > 0 ? '+' : '−'}$${Math.abs(heatDollars(tip.v))}`}</b>
          </span>
        )}
      </div>
      <div className="l5-hh l5-hh-d" aria-hidden><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
      <div className="l5-hh l5-hh-m" aria-hidden><span>06</span><span>10</span><span>14</span><span>18</span><span>20</span></div>
    </div>
  );
}

export function Behaviour() {
  return (
    <section className="l5-beh" id="behaviour" aria-labelledby="leak-title">
      <div className="l5-wrap">
        <Head id="leak-title" eyebrow="Behaviour engine" title={<>Find the leak,<br /><span className="l5-s">not just</span> the loss.</>}
          lead={<>Most journals stop at P&amp;L. TRADElogs looks at <em>how</em> you traded — timing, sizing, streaks, tilt — and shows you the pattern behind the red days.</>} />
        <div className="l5-bento">
          <Reveal className="l5-card c7"><h3 className="l5-ct">Replay any trade on the real candles. <span>Entry, exit and notes on one chart.</span></h3><ReplayChart /></Reveal>
          <Reveal className="l5-card c5" delay={70}><h3 className="l5-ct">Behaviour score. <span>How well you followed yourself.</span></h3><ScoreCard /></Reveal>
          <Reveal className="l5-card c4"><h3 className="l5-ct">Tilt detection. <span>Flags revenge sequences early.</span></h3><TiltCard /></Reveal>
          <Reveal className="l5-card c8" delay={70}><h3 className="l5-ct">Your best hours, mapped. <span>London open pays. Friday afternoons don’t.</span></h3><Heatmap /></Reveal>
        </div>
      </div>
    </section>
  );
}

/* ══ AI ══════════════════════════════════════════════════════════════════ */
export function Ai() {
  return (
    <section className="l5-ai" id="ai" aria-labelledby="ai-title">
      <OrbCanvas className="l5-orb" />
      <div className="l5-wrap l5-two">
        <Reveal>
          <p className="l5-eyebrow">AI coach · SignalX</p>
          <h2 className="l5-h2" id="ai-title">Ask your own<br /><span className="l5-s">history.</span></h2>
          <p className="l5-lead">An AI that has read every trade you’ve taken — and a technical analyst for any chart you’re about to take.</p>
          <ul className="l5-ai-list">
            <li><i aria-hidden><svg viewBox="0 0 18 18" width="18" height="18" fill="none"><path d="M3 4.5h12v7.5H7l-4 3V4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></i><div><b>AI coach</b><span>Questions answered from your real fills.</span></div><small>CHAT</small></li>
            <li><i aria-hidden><svg viewBox="0 0 18 18" width="18" height="18" fill="none"><path d="M2.5 13.5 6.5 9l3 2.5 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><circle cx="15.5" cy="4.5" r="1.5" fill="currentColor" /></svg></i><div><b>SignalX</b><span>Bias, levels and scenarios for any symbol.</span></div><small>NEW</small></li>
            <li><i aria-hidden><svg viewBox="0 0 18 18" width="18" height="18" fill="none"><rect x="2.5" y="3" width="13" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 7h7M5.5 10h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg></i><div><b>Weekly review</b><span>A short note every Monday, written for you.</span></div><small>EMAIL</small></li>
          </ul>
        </Reveal>
        <Reveal delay={100}>
          <div className="l5-chat" aria-label="Example AI coach conversation">
            <div className="l5-chat-h"><span className="l5-av" aria-hidden /><div><b>TRADElogs coach</b><span>Read 312 trades · XM Global MT5</span></div><span className="l5-live">ONLINE</span></div>
            <p className="l5-msg me">What’s the one thing I should fix this week?</p>
            <div className="l5-msg bot">
              Your entries after <strong>15:00 London</strong> are the leak. Over the last 30 days they closed at a <strong>31% win rate</strong> versus <strong>64%</strong> before 12:00 — and four of them came within 20 minutes of a loss.
              <div className="l5-mini"><div><small>Before 12:00</small><b className="l5-up">+$2,410</b></div><div><small>After 15:00</small><b className="l5-dn">−$1,096</b></div><div><small>Revenge</small><b>4 trades</b></div></div>
            </div>
            <p className="l5-msg bot">Suggestion: <strong>no new entries after 15:00</strong> this week. I’ll track it in Monday’s review.</p>
            <div className="l5-chat-in" aria-hidden>Ask about your trading<span className="l5-caret" /><span className="l5-send"><svg viewBox="0 0 14 14" width="14" height="14"><path d="M7 12V2m-4 4 4-4 4 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span></div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ══ REVIEW ══════════════════════════════════════════════════════════════ */
const TODOS = ['Wait 20 min after any losing trade', 'Keep XAUUSD size — it’s working'];
export function Review() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const [done, setDone] = useState([false, false]);
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setDone(d => [true, d[1]!]), 650);
    return () => clearTimeout(t);
  }, [inView]);
  return (
    <section className="l5-review" id="review" aria-labelledby="review-title">
      <div className="l5-wrap l5-two">
        <Reveal>
          <p className="l5-eyebrow">Weekly review</p>
          <h2 className="l5-h2" id="review-title">Every Monday,<br /><span className="l5-s">one</span> thing to fix.</h2>
          <p className="l5-lead">No dashboards to decode. A short note in your inbox, written from your real trades: what worked, what leaked, and the single habit to change this week.</p>
          <div className="l5-ctas"><StartButton variant="white">Get your first review</StartButton></div>
        </Reveal>
        <Reveal delay={120}>
          <div ref={ref} className="l5-mail" aria-label="Example weekly review email">
            <div className="l5-mail-h"><div className="l5-mail-av" aria-hidden>TL</div><div><b>Your week in review</b><span>Week 43 · 23 trades · XM Global MT5</span></div><time>Mon 07:00</time></div>
            <div className="l5-mail-b">
              <p>Net <strong className="g">+$1,184</strong> on the week, profit factor <strong>1.9</strong>. Your London longs on XAUUSD carried it — <strong>7 of 8</strong> closed green.</p>
              <p>The leak: after 15:00 you took <strong>6 trades</strong> and lost <strong className="r">−$612</strong>, four of them within 20 minutes of a loss.</p>
              <div className="l5-fix"><small>This week’s one thing</small><div>Stop new entries after 15:00 London.</div></div>
              <ul className="l5-todo">
                {TODOS.map((t, i) => (
                  <li key={t}><label>
                    <input type="checkbox" checked={done[i]} onChange={() => setDone(d => d.map((x, j) => (j === i ? !x : x)))} />
                    <span className="l5-check" aria-hidden><CheckIcon /></span>{t}
                  </label></li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ══ SECURITY ════════════════════════════════════════════════════════════ */
function Vault() {
  const ticks = Array.from({ length: 72 }, (_, i) => {
    // Rounded: Node and the browser can disagree in the last float digit (hydration).
    const a = (i / 72) * Math.PI * 2, major = i % 6 === 0, r2 = major ? 228 : 216, q = (n: number) => Math.round(n * 100) / 100;
    return <line key={i} x1={q(300 + Math.cos(a) * 208)} y1={q(300 + Math.sin(a) * 208)} x2={q(300 + Math.cos(a) * r2)} y2={q(300 + Math.sin(a) * r2)} stroke={`rgba(242,242,242,${major ? 0.6 : 0.25})`} strokeWidth={major ? 1.6 : 1} />;
  });
  const tags: [string, number, number][] = [['INVESTOR LOGIN', 300, 96], ['AES-256-GCM', 508, 300], ['NO TRADING', 300, 512], ['NO WITHDRAWALS', 92, 300]];
  return (
    <svg viewBox="0 0 600 600" role="img" aria-label="A vault dial: investor login, AES-256-GCM encryption, no trading, no withdrawals">
      <defs>
        <radialGradient id="l5vg" cx=".5" cy=".45" r=".6"><stop stopColor="#08C465" stopOpacity=".42" /><stop offset="1" stopColor="#08C465" stopOpacity="0" /></radialGradient>
        <linearGradient id="l5vm" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#F2F2F2" /><stop offset=".5" stopColor="#7A7A7A" /><stop offset="1" stopColor="#2A2A2A" /></linearGradient>
        <linearGradient id="l5vl" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#3BF09A" /><stop offset="1" stopColor="#047A3D" /></linearGradient>
      </defs>
      <rect width="600" height="600" fill="url(#l5vg)" />
      {Array.from({ length: 9 }, (_, i) => <circle key={i} cx="300" cy="300" r={60 + i * 30} fill="none" stroke={`rgba(125,242,182,${(0.22 - i * 0.02).toFixed(2)})`} strokeDasharray={i % 2 ? '2 6' : undefined} />)}
      {ticks}
      <circle cx="300" cy="300" r="150" fill="#0A0A0A" stroke="url(#l5vm)" strokeWidth="3" />
      <circle cx="300" cy="300" r="132" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="18" />
      <g className="l5-lock">
        <path d="M265 290 v-28 a35 35 0 0 1 70 0 v28" fill="none" stroke="url(#l5vm)" strokeWidth="12" strokeLinecap="round" />
        <rect x="246" y="286" width="108" height="86" rx="20" fill="url(#l5vl)" />
        <rect x="246" y="286" width="108" height="86" rx="20" fill="none" stroke="rgba(255,255,255,.35)" />
        <circle cx="300" cy="322" r="9" fill="#fff" /><rect x="296" y="326" width="8" height="22" rx="4" fill="#fff" />
      </g>
      {tags.map(([t, x, y]) => { const w = t.length * 8.4 + 26; return (
        <g key={t} transform={`translate(${x - w / 2},${y - 15})`}><rect width={w} height="30" rx="15" fill="rgba(10,10,10,.92)" stroke="rgba(125,242,182,.35)" />
          <text x={w / 2} y="19.5" textAnchor="middle" fontFamily="var(--font-v5-mono), monospace" fontSize="11" letterSpacing="1.4" fill="#7DF2B6">{t}</text></g>
      ); })}
    </svg>
  );
}

const SEC = [
  { t: 'View-only access', k: 'Investor login', s: 'We can’t open, modify or close a position.' },
  { t: 'Encrypted at rest', k: 'AES-256-GCM', s: 'Broker passwords are encrypted before they’re ever stored.' },
  { t: 'Disconnect anytime', k: 'Data deleted', s: 'Removing a broker deletes its synced data.' },
  { t: 'No withdrawals', k: 'Zero fund access', s: 'The investor login has no access to funds.' },
];
export function Security() {
  return (
    <section className="l5-sec" id="security" aria-labelledby="sec-title">
      <div className="l5-wrap l5-two">
        <Reveal className="l5-vault"><Vault /></Reveal>
        <Reveal delay={100}>
          <p className="l5-eyebrow">Security</p>
          <h2 className="l5-h2" id="sec-title">Read-only.<br /><span className="l5-s">By design.</span></h2>
          <p className="l5-lead">TRADElogs connects with MetaTrader’s investor password — the one that can look, but never touch.</p>
          <ul className="l5-sec-list">
            {SEC.map((x, n) => (
              <li key={x.t}>
                <div className="l5-sec-top"><em className="l5-mono">0{n + 1}</em><small className="l5-mono">{x.k}</small></div>
                <b>{x.t}</b><span>{x.s}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ══ STEPS ═══════════════════════════════════════════════════════════════ */
export function Steps() {
  const S = [
    { n: '01', big: <>90<span className="l5-s">s</span></>, h: 'Connect MT5', p: 'Add your account with the read-only investor password. We see trades, never place them.' },
    { n: '02', big: 'Auto', h: 'Every fill, journaled', p: 'History backfills instantly. New trades land as they close — fees, swaps and all.' },
    { n: '03', big: <span className="l5-s">Mon</span>, h: 'Your review arrives', p: 'Patterns, leaks and the one habit to fix, written from your own numbers.', dk: true },
  ];
  return (
    <section className="l5-steps" id="how" aria-labelledby="how-title">
      <div className="l5-wrap">
        <Head id="how-title" eyebrow="How it works" title={<>From broker to edge<br />in <span className="l5-s">three</span> steps.</>} />
        <ol className="l5-steps-grid">
          {S.map((x, i) => (
            <Reveal as="li" key={x.n} delay={i * 80} className={`l5-step ${x.dk ? 'is-dk' : ''}`}>
              <span className="l5-step-n">{x.n}</span><div className="l5-step-big" aria-hidden>{x.big}</div><h3>{x.h}</h3><p>{x.p}</p>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ══ PARTNERS ════════════════════════════════════════════════════════════ */
export function Partners() {
  const F: [string, string][] = [['Link clicks', '1,240'], ['Signed up', '96'], ['Connected MT5', '57'], ['Active traders', '38']];
  return (
    <section className="l5-partner" id="partners" aria-labelledby="partner-title">
      <div className="l5-wrap">
        <Reveal className="l5-pband">
          <div>
            <p className="l5-eyebrow">Partner programme</p>
            <h2 id="partner-title">Run a trading group?<br />Bring them <span className="l5-s">along.</span></h2>
            <p>Your own link, codes and QR. See every trader who joins through you — from signup to connected to actively trading.</p>
            <a href="/partner" className="l5-btn l5-btn--white" data-testid="partner-cta"><span>Become a partner</span><span className="l5-ar"><ArrowRight /></span></a>
          </div>
          <div className="l5-funnel" aria-label="Example partner funnel (sample numbers)">
            {F.map(([l, n], i) => <div key={l} style={{ marginLeft: `${i * 7}%` }} className={i === 3 ? 'on' : ''}><span>{l}</span><b className="l5-mono">{n}</b></div>)}
            <small>SAMPLE PARTNER · 30 DAYS</small>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ══ FAQ ═════════════════════════════════════════════════════════════════ */
const FAQS = [
  { q: 'Can TRADElogs place trades on my account?', a: <>No. You connect with MT5&rsquo;s investor (read-only) password, which can view your history but cannot open, modify or close positions.</> },
  { q: 'Which brokers are supported?', a: <>Any broker that offers MetaTrader&nbsp;5 — XM, Exness, Vantage, Elefin, Xellion and hundreds more. You only need your MT5 login, investor password and your broker&rsquo;s server name.</> },
  { q: 'Is it really free?', a: <>Yes. TRADElogs is free while we&rsquo;re getting started, and you don&rsquo;t need a card to sign up.</> },
  { q: 'How is my data stored?', a: <>Your investor password is encrypted (AES-256-GCM) so we can keep syncing, and it can only read your account — never trade or withdraw. Disconnecting a broker from the Brokers page deletes its synced data. Details are in our <a href="/privacy">Privacy policy</a>.</> },
  { q: 'Do I need to export CSVs?', a: <>Never. Once your account is connected, your history backfills automatically and new trades appear as they close.</> },
];
export function Faq() {
  return (
    <section className="l5-faq" id="faq" aria-labelledby="faq-title">
      <div className="l5-wrap l5-faq-g">
        <Reveal>
          <p className="l5-eyebrow">FAQ</p>
          <h2 className="l5-h2" id="faq-title">Questions,<br /><span className="l5-s">answered.</span></h2>
          <p className="l5-lead">Can&rsquo;t find it here? <a href="/signup">Create a free account</a> and ask the AI coach anything about your trading.</p>
        </Reveal>
        <Reveal delay={80}>
          {FAQS.map((f, i) => (
            <details key={f.q} className="l5-q" name="l5-faq" open={i === 0}>
              <summary>{f.q}<i aria-hidden><svg viewBox="0 0 12 12" width="12" height="12"><path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></i></summary>
              <div className="l5-q-a">{f.a}</div>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ══ CTA + FOOTER ════════════════════════════════════════════════════════ */
export function Cta() {
  return (
    <section className="l5-cta" aria-labelledby="cta-title">
      <CandleField className="l5-field" />
      <div className="l5-wrap">
        <Reveal><h2 id="cta-title">Start journaling<br />in <span className="l5-s l5-shine">90 seconds.</span></h2></Reveal>
        <Reveal delay={100}>
          <p>Free while you&rsquo;re getting started. Read-only by design. Works with any MetaTrader&nbsp;5 broker.</p>
          <div className="l5-ctas l5-ctas--c">
            <StartButton testId="cta-start">Create free account</StartButton>
            <a href="/login" className="l5-btn l5-btn--beam">I have an account</a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="l5-footer">
      <div className="l5-wrap">
        <div className="l5-fg">
          <div><Wordmark /><p>The trading journal that reads your MT5 history and tells you what to fix.</p></div>
          <nav aria-label="Product"><h3>Product</h3><ul><li><a href="#product">Features</a></li><li><a href="#behaviour">Behaviour engine</a></li><li><a href="#review">Weekly review</a></li><li><a href="#how">How it works</a></li></ul></nav>
          <nav aria-label="App"><h3>App</h3><ul><li><a href="/dashboard">Dashboard</a></li><li><a href="/trader">SignalX</a></li><li><a href="/coach">AI coach</a></li><li><a href="/markets">Markets</a></li></ul></nav>
          <nav aria-label="Account"><h3>Account</h3><ul><li><a href="/signup">Create account</a></li><li><a href="/login">Sign in</a></li><li><a href="/partner">Become a partner</a></li><li><a href="/terms">Terms</a></li><li><a href="/privacy">Privacy</a></li></ul></nav>
        </div>
        <div className="l5-huge" aria-hidden>TRADE<span>logs</span></div>
        <div className="l5-legal">
          <span>&copy; {new Date().getFullYear()} TRADElogs</span>
          <span>Trading involves risk. Past performance does not guarantee future results. Figures shown are illustrative.</span>
        </div>
      </div>
    </footer>
  );
}
