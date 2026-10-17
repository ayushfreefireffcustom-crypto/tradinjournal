'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowRight, ChatIcon, CheckIcon, GridIcon, ReplayIcon, Reveal, StartButton, Wordmark, useCountUp, useInViewOnce,
} from './ui';
import {
  candles, ENTRY_INDEX, EXIT_INDEX, HEAT_DAYS, heat, heatColor, heatDollars, REPLAY_H, REPLAY_W, tilt, traits,
} from './data';

const v = (i: number) => ({ '--i': i } as CSSProperties);

/* ══ 2 · CORE — the ledger ═══════════════════════════════════════════════ */
const CELLS = [
  { k: 'Import', t: <>Zero manual <br />entry.</>, p: 'Every fill, fee and swap imported from MT5.', l: 'Auto-journal', href: '#how' },
  { k: 'Measure', t: <>40+ metrics <br />per trade.</>, p: 'Expectancy, hold time, R-multiple, session.', l: 'Deep analytics', href: '#behaviour' },
  { k: 'Connect', t: <>90-second <br />setup.</>, p: 'Investor password in, history backfilled.', l: 'Read-only by design', href: '#faq' },
  { k: 'Behave', t: <>Behaviour <br />score.</>, p: 'One number for how well you followed yourself.', l: 'Discipline signals', href: '#behaviour' },
  { k: 'Explain', t: <>Plain-English <br />insights.</>, p: '“Tuesdays bleed. Size down.” Not chart soup.', l: 'Insight engine', href: '#behaviour' },
  { k: 'Review', t: <>Monday <br />review.</>, p: 'One note a week. One thing to fix — in your inbox.', l: 'Weekly email', href: '#review', hl: true },
];

export function Core() {
  return (
    <section className="lp-core lp-on-light" id="product" aria-labelledby="core-title">
      <div className="lp-wrap">
        <Reveal>
          <p className="lp-eyebrow">Our core</p>
          <h2 className="lp-h2" id="core-title">What makes TRADElogs <em>different</em> from a spreadsheet?</h2>
        </Reveal>
        <ul className="lp-ledger">
          {CELLS.map((c, i) => (
            <Reveal as="li" key={c.k} delay={(i % 3) * 70} className={`lp-cell ${c.hl ? 'lp-cell--hl' : ''}`}>
              <div className="lp-cell-k"><b>{c.k}</b><span aria-hidden>{String.fromCharCode(65 + i)}</span></div>
              <h3>{c.t}</h3>
              <p>{c.p}</p>
              <a className="lp-link" href={c.href}>{c.l} <ArrowRight /></a>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ══ 3 · PLATFORM — accent band with devices ═════════════════════════════ */
const PRODUCTS = [
  { icon: <GridIcon />, b: 'Dashboard & analytics', s: 'Your edge, measured' },
  { icon: <ReplayIcon />, b: 'Chart replay', s: 'Every trade on real candles' },
  { icon: <ChatIcon />, b: 'AI coach & SignalX', s: 'Ask your own history' },
];

export function Platform() {
  return (
    <section className="lp-platform lp-dark" id="platform" aria-labelledby="platform-title">
      <div className="lp-wrap">
        <Reveal>
          <h2 id="platform-title">Every trade, every screen, <br />one <em>journal.</em></h2>
          <p className="lp-platform-eb"><i aria-hidden />Driven by your own data.</p>
        </Reveal>
        <Reveal as="ul" className="lp-prods" delay={80}>
          {PRODUCTS.map(p => (
            <li key={p.b} className="lp-prod">
              <span className="lp-prod-ic">{p.icon}</span>
              <span><b>{p.b}</b><span>{p.s}</span></span>
            </li>
          ))}
        </Reveal>
      </div>
      <Reveal className="lp-devices" delay={120}>
        <div className="lp-laptop" aria-hidden>
          <div className="lp-laptop-scr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/dashboard.jpg" width={1720} height={1075} alt="" loading="lazy" decoding="async" />
          </div>
          <div className="lp-laptop-base" />
        </div>
        <div className="lp-phone lp-device-phone">
          <span className="lp-phone-island" aria-hidden />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/dashboard-mobile.jpg" width={810} height={1753} alt="TRADElogs on mobile: net P&L, weekly review and recent trades" loading="lazy" decoding="async" />
        </div>
      </Reveal>
    </section>
  );
}

/* ══ 4 · LEAK — behaviour bento ══════════════════════════════════════════ */
function ReplayChart() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const W = REPLAY_W, H = REPLAY_H, w = W / candles.length;
  const mn = Math.min(...candles.map(c => c.l)), mx = Math.max(...candles.map(c => c.h));
  const y = (val: number) => H - 24 - ((val - mn) / (mx - mn)) * (H - 50);
  const ex = ENTRY_INDEX * w + w / 2, xx = EXIT_INDEX * w + w / 2;
  const ey = y(candles[ENTRY_INDEX]!.c), xy = y(candles[EXIT_INDEX]!.c);
  return (
    <div ref={ref} className={`lp-replay ${inView ? 'is-in' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Candlestick chart of a long trade: entry at 1.0842, exit for +$256.00">
        {[0, 1, 2, 3, 4].map(i => <line key={i} x1={0} x2={W} y1={20 + i * 62} y2={20 + i * 62} stroke="#EDECF0" vectorEffect="non-scaling-stroke" />)}
        <rect className="lp-trade-band" x={ex} y={Math.min(ey, xy)} width={xx - ex} height={Math.abs(ey - xy)} fill="rgba(110,75,255,.07)" />
        {candles.map((k, i) => {
          const x = i * w + w / 2, up = k.c >= k.o, col = up ? '#19C37D' : '#F4435E';
          return (
            <g key={i} className="lp-candle" style={v(i)}>
              <line x1={x} x2={x} y1={y(k.h)} y2={y(k.l)} stroke={col} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              <rect x={x - w * 0.32} y={y(Math.max(k.o, k.c))} width={w * 0.64} height={Math.max(2, Math.abs(y(k.o) - y(k.c)))} rx={1.5} fill={col} />
            </g>
          );
        })}
        <g className="lp-trade-lines">
          <line x1={ex} x2={W} y1={ey} y2={ey} stroke="#6E4BFF" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          <line x1={xx} x2={W} y1={xy} y2={xy} stroke="#100F17" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
        </g>
      </svg>
      {/* Pins/labels are HTML so they stay crisp and un-stretched at any width */}
      <div className="lp-trade-pins">
        <span className="lp-pin lp-pin--entry" style={{ left: `${(ex / W) * 100}%`, top: `${(ey / H) * 100}%` }}>
          <i /><em>Entry 1.0842</em>
        </span>
        <span className="lp-pin lp-pin--exit" style={{ left: `${(xx / W) * 100}%`, top: `${(xy / H) * 100}%` }}>
          <i /><em>Exit · +$256.00</em>
        </span>
      </div>
    </div>
  );
}

function ScoreCard() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const n = useCountUp(82, inView);
  return (
    <div ref={ref} className={`lp-score ${inView ? 'is-in' : ''}`}>
      <div className="lp-score-n"><b className="num" aria-label="82 out of 100">{n}</b><span>/ 100 &nbsp;<span className="lg">▲ 6 this month</span></span></div>
      <ul className="lp-traits">
        {traits.map((t, i) => (
          <li key={t.label} className="lp-trait">
            {t.label}
            <span className="lp-bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.value} aria-label={t.label}>
              <i style={{ width: `${t.value}%`, ...('warn' in t ? { background: 'var(--amber-fill)' } : {}), ...v(i) }} />
            </span>
            <b className="num">{t.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TiltCard() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  return (
    <div ref={ref} className={`lp-tilt ${inView ? 'is-in' : ''}`} role="img" aria-label="Trade sequence: wins and losses, ending with four rapid losing trades flagged as revenge trading">
      <div className="lp-flag"><span>Revenge · 4 trades in 11 min</span></div>
      <div className="lp-tilt-row">
        {tilt.map((b, i) => <i key={i} style={{ height: `${b.h}%`, background: b.win ? '#19C37D' : '#F4435E', ...v(i) }} />)}
      </div>
    </div>
  );
}

function Heatmap() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const [tip, setTip] = useState<{ x: number; y: number; d: string; h: number; v: number } | null>(null);
  return (
    <div ref={ref} className={`lp-heat ${inView ? 'is-in' : ''}`} onPointerLeave={() => setTip(null)}>
      {HEAT_DAYS.map((d, di) => (
        <div key={d} style={{ display: 'contents' }}>
          <span className="lp-day">{d}</span>
          {heat[di]!.map((val, h) => (
            <i
              key={h}
              className={`lp-heat-cell ${h < 7 || h > 18 ? 'lp-off-m' : ''}`}
              style={{ background: heatColor(val), ...v(di * 24 + h) }}
              onPointerEnter={e => {
                const box = (e.currentTarget.closest('.lp-heat') as HTMLElement).getBoundingClientRect();
                const r = e.currentTarget.getBoundingClientRect();
                setTip({ x: r.left - box.left + r.width / 2, y: r.top - box.top, d, h, v: val });
              }}
            />
          ))}
        </div>
      ))}
      <div className="lp-heat-hours lp-hh-d" aria-hidden><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>
      <div className="lp-heat-hours lp-hh-m" aria-hidden><span>07</span><span>10</span><span>13</span><span>16</span><span>18</span></div>
      {tip && (
        <span className="lp-tip" style={{ left: tip.x, top: tip.y }}>
          {tip.d} {String(tip.h).padStart(2, '0')}:00 · <b className={tip.v > 0 ? 'lg' : tip.v < 0 ? 'sh' : ''} style={{ color: tip.v > 0 ? '#5BE3A6' : tip.v < 0 ? '#FF8A9B' : '#fff' }}>
            {tip.v === 0 ? 'no trades' : `${tip.v > 0 ? '+' : '−'}$${Math.abs(heatDollars(tip.v))}`}
          </b>
        </span>
      )}
    </div>
  );
}

export function Leak() {
  return (
    <section className="lp-leak lp-on-light" id="behaviour" aria-labelledby="leak-title">
      <div className="lp-wrap">
        <Reveal className="lp-head">
          <div>
            <p className="lp-eyebrow">Behaviour engine</p>
            <h2 className="lp-h2" id="leak-title">Find the leak, <br /><em>not just</em> the loss.</h2>
          </div>
          <p className="lp-lead">Most journals stop at P&amp;L. TRADElogs looks at <em>how</em> you traded — timing, sizing, streaks, tilt — and shows you the pattern behind the red days.</p>
        </Reveal>
        <div className="lp-bento">
          <Reveal className="lp-bc lp-c7">
            <h3>Replay any trade on the real candles. <span>Entry, exit and your notes on one chart.</span></h3>
            <ReplayChart />
          </Reveal>
          <Reveal className="lp-bc lp-c5" delay={80}>
            <h3>Behaviour score. <span>How well you followed your own rules.</span></h3>
            <ScoreCard />
          </Reveal>
          <Reveal className="lp-bc lp-c4">
            <h3>Tilt detection. <span>Flags revenge sequences early.</span></h3>
            <TiltCard />
          </Reveal>
          <Reveal className="lp-bc lp-c8" delay={80}>
            <h3>Your best hours, mapped. <span>London open pays. Friday afternoons don&rsquo;t.</span></h3>
            <Heatmap />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ══ 5 · REVIEW — the Monday email ═══════════════════════════════════════ */
const TODOS = ['Stop new entries after 15:00 London', 'Wait 20 min after any losing trade', 'Keep XAUUSD size — it’s working'];

export function Review() {
  const { ref, inView } = useInViewOnce<HTMLDivElement>();
  const [done, setDone] = useState([false, false, false]);
  // The first habit ticks itself once the email scrolls into view.
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setDone(d => d.map((x, j) => (j === 0 ? true : x))), 650);
    return () => clearTimeout(t);
  }, [inView]);
  return (
    <section className="lp-review lp-dark" id="review" aria-labelledby="review-title">
      <div className="lp-wrap">
        <Reveal>
          <p className="lp-eyebrow">Weekly review</p>
          <h2 className="lp-h2" id="review-title">Every Monday, <br /><em>one</em> thing to fix.</h2>
          <p className="lp-lead">No dashboards to decode. A short note in your inbox, written from your real trades: what worked, what leaked, and the single habit to change this week.</p>
          <StartButton variant="white">Get your first review</StartButton>
        </Reveal>
        <Reveal delay={120}>
          <div ref={ref} className="lp-mail lp-on-light" aria-label="Example weekly review email">
            <div className="lp-mail-hd">
              <div className="lp-av" aria-hidden>TL</div>
              <div><b>Your week in review</b><span>Week 41 · 23 trades · XM Global MT5</span></div>
              <time>Mon 07:00</time>
            </div>
            <div className="lp-mail-body">
              <p>Net <strong className="lg">+$1,184</strong> on the week, profit factor <strong>1.9</strong>. Your London longs on XAUUSD carried it — <strong>7 of 8</strong> closed green.</p>
              <p>The leak: after 15:00 you took <strong>6 trades</strong> and lost <strong className="sh">−$612</strong>, four of them within 20 minutes of a loss.</p>
              <ul className="lp-todo">
                {TODOS.map((t, i) => (
                  <li key={t}>
                    <label>
                      <input type="checkbox" checked={done[i]} onChange={() => setDone(d => d.map((x, j) => (j === i ? !x : x)))} />
                      <span className="lp-check" aria-hidden><CheckIcon /></span>
                      {t}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ══ 6 · STEPS ═══════════════════════════════════════════════════════════ */
export function Steps() {
  return (
    <section className="lp-steps lp-on-light" id="how" aria-labelledby="how-title">
      <div className="lp-wrap">
        <Reveal className="lp-head">
          <div>
            <p className="lp-eyebrow">How it works</p>
            <h2 className="lp-h2" id="how-title">From broker to edge <br />in <em>three</em> steps.</h2>
          </div>
          <p className="lp-lead">No CSV exports, no copy-paste, no spreadsheets. Connect once and TRADElogs keeps itself up to date.</p>
        </Reveal>
        <ol className="lp-steps-grid">
          <Reveal as="li" className="lp-step">
            <span className="lp-step-n">Step 1 · 90 seconds</span>
            <div className="lp-step-big num" aria-hidden>90s</div>
            <h3>Connect MT5</h3>
            <p>Add your account with the read-only investor password. We see trades, never place them.</p>
          </Reveal>
          <Reveal as="li" className="lp-step" delay={80}>
            <span className="lp-step-n">Step 2 · automatically</span>
            <div className="lp-step-big num" aria-hidden>0</div>
            <h3>Every fill, journaled</h3>
            <p>History backfills instantly. New trades land as they close — fees, swaps and all.</p>
          </Reveal>
          <Reveal as="li" className="lp-step lp-step--dk" delay={160}>
            <span className="lp-step-n">Step 3 · every Monday</span>
            <div className="lp-step-big" aria-hidden>Mon</div>
            <h3>Your review arrives</h3>
            <p>Patterns, leaks and the one habit to fix, written from your own numbers.</p>
          </Reveal>
        </ol>
      </div>
    </section>
  );
}

/* ══ 7 · FAQ ═════════════════════════════════════════════════════════════ */
const FAQS = [
  { q: 'Can TRADElogs place trades on my account?', a: <>No. You connect with MT5&rsquo;s investor (read-only) password, which can view your history but cannot open, modify or close positions.</> },
  { q: 'Which brokers are supported?', a: <>Any broker that offers MetaTrader&nbsp;5 — XM, Exness, Vantage, Elefin, Xellion and hundreds more. You only need your MT5 login, investor password and your broker&rsquo;s server name.</> },
  { q: 'Is it really free?', a: <>Yes. TRADElogs is free while we&rsquo;re getting started, and you don&rsquo;t need a card to sign up.</> },
  { q: 'How is my data stored?', a: <>Your investor password is encrypted at rest and only ever used for read-only access. You can disconnect a broker account at any time from your settings.</> },
  { q: 'Do I need to export CSVs?', a: <>Never. Once your account is connected, your history backfills automatically and new trades appear as they close.</> },
];

export function Faq() {
  return (
    <section className="lp-faq lp-on-light" id="faq" aria-labelledby="faq-title">
      <div className="lp-wrap">
        <Reveal className="lp-faq-aside">
          <p className="lp-eyebrow">FAQ</p>
          <h2 className="lp-h2" id="faq-title">Questions, <br /><em>answered.</em></h2>
          <p className="lp-lead">Can&rsquo;t find it here? <a href="/signup">Create a free account</a> and ask the AI coach anything about your trading.</p>
        </Reveal>
        <Reveal delay={80}>
          {FAQS.map((f, i) => (
            <details key={f.q} className="lp-q" name="lp-faq" open={i === 0}>
              <summary>{f.q}<span className="lp-pm" aria-hidden /></summary>
              <div className="lp-q-a">{f.a}</div>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ══ 8 · CTA ═════════════════════════════════════════════════════════════ */
export function Cta() {
  return (
    <section className="lp-cta lp-dark" aria-labelledby="cta-title">
      <div className="lp-wrap">
        <Reveal><h2 id="cta-title">Start journaling <br />in <em>90 seconds.</em></h2></Reveal>
        <Reveal delay={100}>
          <p>Free while you&rsquo;re getting started. Read-only by design. Works with any MetaTrader&nbsp;5 broker.</p>
          <div className="lp-cta-ctas">
            <StartButton variant="white" testId="cta-start" />
            <a href="/login" className="lp-btn lp-btn--ghost">I have an account</a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ══ 9 · FOOTER ══════════════════════════════════════════════════════════ */
export function Footer() {
  return (
    <footer className="lp-footer lp-dark">
      <div className="lp-wrap">
        <div className="lp-fg">
          <div>
            <Wordmark />
            <p>The trading journal that reads your MT5 history and tells you what to fix.</p>
          </div>
          <nav aria-label="Product">
            <h3>Product</h3>
            <ul><li><a href="#product">Features</a></li><li><a href="#behaviour">Behaviour engine</a></li><li><a href="#review">Weekly review</a></li><li><a href="#how">How it works</a></li></ul>
          </nav>
          <nav aria-label="App">
            <h3>App</h3>
            <ul><li><a href="/dashboard">Dashboard</a></li><li><a href="/trader">SignalX</a></li><li><a href="/coach">AI coach</a></li><li><a href="/markets">Markets</a></li></ul>
          </nav>
          <nav aria-label="Account">
            <h3>Account</h3>
            <ul><li><a href="/signup">Create account</a></li><li><a href="/login">Sign in</a></li><li><a href="#faq">FAQ</a></li></ul>
          </nav>
        </div>
        <div className="lp-huge" aria-hidden>TRADE<span>logs</span></div>
        <div className="lp-legal">
          <span>&copy; {new Date().getFullYear()} TRADElogs</span>
          <span>Trading involves risk. Past performance does not guarantee future results. Figures shown are illustrative.</span>
        </div>
      </div>
    </footer>
  );
}
