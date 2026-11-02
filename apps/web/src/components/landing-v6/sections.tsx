import Logo from '@/components/logo';
import { PARTNERS_ENABLED, TRADING_ENABLED } from '@/lib/features';
import { Faq, NavLinks, SignInLink, Stage, StartCta } from './client';
import { Ic, type IconName } from './icons';
import { Bento, IconTile, Label, SecHead, Tile, seeded, type Tone } from './ui';
import HeroArt from './art/hero-art';
import JournalArt from './art/journal-art';
import AnalyticsArt from './art/analytics-art';
import CoachArt from './art/coach-art';
import DisciplineArt from './art/discipline-art';
import MarketsArt from './art/markets-art';
import SecurityArt from './art/security-art';
import StrategyArt from './art/strategy-art';
import CopyArt from './art/copy-art';

// Copy trading is advertised only when the trading platform is switched on
// (NEXT_PUBLIC_TRADING); until then the landing lists it under "Coming next".
const NAV = [
  { href: '#journal', label: 'Journal' },
  { href: '#analytics', label: 'Analytics' },
  { href: '#coach', label: 'AI coach' },
  { href: '#strategies', label: 'Strategies' },
  ...(TRADING_ENABLED ? [{ href: '#copy', label: 'Copy trading' }] : [{ href: '#markets', label: 'Markets' }]),
  { href: '#faq', label: 'FAQ' },
];

export function Nav() {
  return (
    <header className="nav">
      <div className="nav-in">
        <a href="#top" aria-label="TRADElogs home"><Logo height={20} /></a>
        <NavLinks links={NAV} />
        <div className="nav-cta"><SignInLink /><StartCta size="sm" testId="nav-start" /></div>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="hero" id="top" aria-labelledby="hero-h">
      <div className="wrap">
        <Label>Read-only sync for any MetaTrader 5 broker</Label>
        <h1 id="hero-h">The complete<br />trading journal</h1>
        <p className="sub">{TRADING_ENABLED
          ? 'Every MT5 fill journaled and every habit measured. Turn your rules into a strategy you can backtest, or copy traders whose record is synced from their exchange. Free while we’re getting started.'
          : 'Every MT5 fill journaled, every habit measured, and every Saturday one thing to fix. Then test your own rules as a strategy, on paper first. Free while we’re getting started.'}</p>
        <div className="ctas"><StartCta testId="hero-start" /></div>
        <div className="assure">
          <span><Ic name="eye" />Investor password only</span>
          <span><Ic name="check" />History backfills automatically</span>
          <span><Ic name="card" />No card needed</span>
        </div>
      </div>
      <div className="hero-stage" style={{ maxWidth: 1200, margin: '0 auto' }} aria-hidden>
        <Stage w={1200} h={470} crop={700} maxScale={1}><HeroArt /></Stage>
      </div>
    </section>
  );
}

type TileDef = [IconName, string, string];
function Tiles({ defs, tone }: { defs: TileDef[]; tone?: Tone }) {
  return <>{defs.map(([icon, bold, rest]) => <Tile key={bold} icon={icon} tone={tone} bold={bold} rest={rest} />)}</>;
}
function Art({ tone, children }: { tone: 'g' | 'r' | 'k'; children: React.ReactNode }) {
  return <div className={`art art-${tone}`} aria-hidden><Stage w={560} h={400} fill>{children}</Stage></div>;
}

export function Features() {
  return (
    <>
      <section className="sec" id="journal" aria-labelledby="journal-h">
        <SecHead id="journal" label="TRADElogs Journal" title={<>Every fill journaled<br />the moment it closes</>}
          body="Connect MT5 once. Your history backfills, new trades appear as they close, and fees, swaps and partial closes are rebuilt into clean positions you can replay and annotate."
          action={{ href: '/signup', text: 'See the journal' }} />
        <Bento tiles={<Tiles defs={[['book', 'Auto-synced', 'trade log'], ['play', 'Replay', 'any trade on its chart'], ['tag', 'Notes, tags', 'and emotions per trade'], ['layers', 'Fees and swaps', 'rebuilt into positions']]} />}
          art={<Art tone="g"><JournalArt /></Art>} />
      </section>

      <section className="sec" id="analytics" aria-labelledby="analytics-h">
        <SecHead id="analytics" label="TRADElogs Analytics" title={<>Find the leak,<br />not just the loss</>}
          body="Most journals stop at P&L. TRADElogs breaks your results down by symbol, weekday, hour and session, so the pattern behind the red days becomes obvious."
          action={{ href: '/signup', text: 'Explore analytics' }} />
        <Bento flip tiles={<Tiles defs={[['clock', 'Best hours', 'and sessions mapped'], ['bars', 'Edge by symbol', 'and weekday'], ['curve', 'Equity and drawdown', 'over any range'], ['cal', 'P&L calendar', 'day by day']]} />}
          art={<Art tone="g"><AnalyticsArt /></Art>} />
      </section>

      <section className="sec" id="coach" aria-labelledby="coach-h">
        <SecHead id="coach" label="AI coach · SignalX" title={<>An AI that has read<br />every trade you’ve taken</>}
          body="Ask the coach anything and it answers from your real fills. Before your next trade, SignalX gives a bias, key levels and scenarios for the symbol you’re watching."
          action={{ href: '/signup', text: 'Ask the coach' }} />
        <Bento tiles={<Tiles defs={[['chat', 'Answers', 'from your own trades'], ['signal', 'SignalX', 'bias, levels and scenarios'], ['mail', 'Weekly review', 'every Saturday'], ['bulb', 'Plain-English', 'insights, no jargon']]} />}
          art={<Art tone="g"><CoachArt /></Art>} />
      </section>

      <section className="sec" id="discipline" aria-labelledby="discipline-h">
        <SecHead id="discipline" label="Behaviour engine" tone="red" title={<>Catch the tilt<br />before it costs you</>}
          body="TRADElogs watches how you trade, not just what. It scores how well you followed your own rules and flags revenge sequences the moment they start to form."
          action={{ href: '/signup', text: 'See your behaviour score' }} />
        <Bento flip tiles={<Tiles tone="red" defs={[['flame', 'Tilt detection', 'flags revenge trades'], ['gauge', 'Behaviour score', 'out of 100'], ['list', 'Your rules', 'checked every week'], ['pause', 'Holding habits', 'winners vs losers']]} />}
          art={<Art tone="r"><DisciplineArt /></Art>} />
      </section>

      <section className="sec" id="strategies" aria-labelledby="strategies-h">
        <SecHead id="strategies" label="Strategy builder" title={<>Turn your rules<br />into a strategy</>}
          body={`Describe a setup in a sentence or build it from blocks, then backtest it on years of real candles and run it on paper with simulated fills.${TRADING_ENABLED ? ' When the numbers hold up, deploy it to your own exchange account.' : ''} No code.`}
          action={{ href: '/signup', text: 'Build a strategy' }} />
        <Bento tiles={<Tiles defs={[['blocks', 'No-code', 'rule blocks'], ['bulb', 'From a sentence', 'with the AI builder'], ['curve', 'Backtests', 'on real candles'], ['play', TRADING_ENABLED ? 'Paper, then live' : 'Paper trading', TRADING_ENABLED ? 'when you’re ready' : 'with simulated fills']]} />}
          art={<Art tone="g"><StrategyArt live={TRADING_ENABLED} /></Art>} />
      </section>

      {TRADING_ENABLED && (
        <section className="sec" id="copy" aria-labelledby="copy-h">
          <SecHead id="copy" label="Copy trading · Beta" title={<>Copy traders whose<br />record you can check</>}
            body="Every leader’s results come from their exchange account, not a screenshot. Pick one, choose your size and a daily loss limit, and their trades are placed on your own account through a trade-only API key. Delta Exchange India first; try it on testnet before real money."
            action={{ href: '/signup', text: 'See the leaders' }} />
          <Bento flip tiles={<Tiles defs={[['copy', 'Synced records', 'from the exchange'], ['gauge', 'Your size', 'proportional, fixed or ×'], ['shield', 'Daily loss limit', 'pauses copying'], ['key', 'Trade-only keys', 'can’t withdraw']]} />}
            art={<Art tone="g"><CopyArt /></Art>} />
        </section>
      )}

      <section className="sec" id="markets" aria-labelledby="markets-h">
        <SecHead id="markets" label="Markets & macro" tone="gray" title={<>The market context,<br />right next to your trades</>}
          body="An economic calendar, market news filtered to your symbols, a macro dashboard and price alerts, so you know what moved the market on the days you won and lost."
          action={{ href: '/signup', text: 'Open markets' }} />
        <Bento flip={!TRADING_ENABLED} tiles={<Tiles tone="gray" defs={[['cal', 'Economic calendar', 'with impact levels'], ['news', 'News', 'for the symbols you trade'], ['globe', 'Macro dashboard', 'and asset bias'], ['bell', 'Price alerts', 'to web push']]} />}
          art={<Art tone="k"><MarketsArt /></Art>} />
      </section>

      <section className="sec" id="security" aria-labelledby="security-h">
        <SecHead id="security" label="Read-only by design" tone="gray" title={<>It can look at your account.<br />It can never touch it.</>}
          body={`TRADElogs connects with MetaTrader’s investor password, the one that can view history but cannot open, modify or close a position. It’s encrypted at rest, and disconnecting removes the synced data.${TRADING_ENABLED ? ' Exchange keys are encrypted the same way, and keys with withdrawal rights are refused.' : ''}`}
          action={{ href: '/privacy', text: 'How we keep it safe' }} />
        <Bento flip={TRADING_ENABLED} tiles={<Tiles tone="gray" defs={[['eye', 'Investor password', 'only'], ['key', 'AES-256-GCM', 'encryption at rest'], ['plug', 'Any MT5 broker', 'with an investor login'], ['unlink', 'Disconnect', 'and the synced data goes']]} />}
          art={<Art tone="k"><SecurityArt /></Art>} />
      </section>
    </>
  );
}

function HeatViz() {
  const rnd = seeded(7);
  const cells: { x: number; y: number; fill: string }[] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 12; c++) {
    let v = c >= 2 && c <= 4 ? 0.5 + rnd() * 0.5 : c >= 6 && c <= 8 ? rnd() - 0.45 : (rnd() - 0.5) * 0.3;
    if (r === 4 && c >= 8) v = -(0.5 + rnd() * 0.5);
    const fill = v > 0 ? `rgba(8,196,101,${(0.12 + v * 0.8).toFixed(2)})` : v < 0 ? `rgba(254,58,49,${(0.12 - v * 0.7).toFixed(2)})` : '#1C1C1F';
    cells.push({ x: 46 + c * 21, y: 30 + r * 21, fill });
  }
  return (
    <svg viewBox="0 0 340 190" aria-hidden>
      {cells.map((c, i) => <rect key={i} x={c.x} y={c.y} width="18" height="18" rx="4" fill={c.fill} />)}
      {['M', 'T', 'W', 'T', 'F'].map((d, i) => <text key={i} x="34" y={43 + i * 21} textAnchor="middle" fontSize="10" fill="#55555B">{d}</text>)}
      <text x="170" y="166" textAnchor="middle" fontSize="11.5" fill="#55555B">hour of day × weekday · sample</text>
    </svg>
  );
}

export function How() {
  return (
    <section className="sec" aria-labelledby="how-h">
      <div className="center-head"><Label>How it works</Label><h2 id="how-h">One journal for the<br />whole improvement loop</h2></div>
      <div className="three">
        <article className="card3">
          <div className="viz">
            <svg viewBox="0 0 340 190" aria-hidden>
              <defs><linearGradient id="v1" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#08C465" stopOpacity="0" /><stop offset=".5" stopColor="#08C465" /><stop offset="1" stopColor="#08C465" stopOpacity="0" /></linearGradient></defs>
              <rect x="40" y="56" width="92" height="66" rx="16" fill="#1F1F23" stroke="rgba(255,255,255,.08)" />
              <text x="86" y="94" textAnchor="middle" style={{ fontFamily: 'var(--mono)' }} fontSize="15" fill="#EDEDEF">MT5</text>
              <rect x="208" y="56" width="92" height="66" rx="16" fill="#1F1F23" stroke="rgba(8,196,101,.4)" />
              <g transform="translate(254 89) scale(.36)"><path d="M-92 -62 H-110 V62 H-92 M92 -62 H110 V62 H92" fill="none" stroke="#EDEDEF" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /><rect x="-62" y="-36" width="24" height="64" rx="5" fill="#08C465" /><rect x="-12" y="-20" width="24" height="56" rx="5" fill="#FE3A31" /><rect x="38" y="-56" width="24" height="70" rx="5" fill="#08C465" /></g>
              <path d="M140 89 H200" stroke="url(#v1)" strokeWidth="2" strokeDasharray="4 4" />
              <circle cx="170" cy="89" r="11" fill="#151517" stroke="rgba(255,255,255,.12)" />
              <g transform="translate(163 82) scale(.58)" fill="none" stroke="#3DE296" strokeWidth="2.4"><use href="#lp6-lock" width="24" height="24" /></g>
              <text x="170" y="152" textAnchor="middle" fontSize="11.5" fill="#55555B">investor password · read-only</text>
            </svg>
          </div>
          <div className="tx"><div className="step">01</div><h3>Connect MT5, read-only</h3><p>Add your MT5 login, investor password and server. Your history backfills on its own.</p></div>
        </article>
        <article className="card3">
          <div className="viz"><HeatViz /></div>
          <div className="tx"><div className="step">02</div><h3>See where your edge is</h3><p>Every trade measured by symbol, hour, weekday and session, with replay and notes.</p></div>
        </article>
        <article className="card3">
          <div className="viz">
            <svg viewBox="0 0 340 190" aria-hidden>
              <rect x="58" y="34" width="224" height="112" rx="16" fill="#1F1F23" stroke="rgba(255,255,255,.07)" />
              <rect x="76" y="52" width="70" height="8" rx="4" fill="#fff" opacity=".22" />
              <rect x="76" y="70" width="168" height="6" rx="3" fill="#fff" opacity=".09" />
              <rect x="76" y="84" width="140" height="6" rx="3" fill="#fff" opacity=".09" />
              <rect x="76" y="106" width="188" height="24" rx="8" fill="#08C465" opacity=".14" />
              <circle cx="90" cy="118" r="5" fill="#08C465" />
              <rect x="102" y="115" width="120" height="6" rx="3" fill="#3DE296" opacity=".6" />
              <text x="170" y="168" textAnchor="middle" fontSize="11.5" fill="#55555B">Saturday · your week in review</text>
            </svg>
          </div>
          <div className="tx"><div className="step">03</div><h3>Fix one thing a week</h3><p>A short review every Saturday: what worked, what leaked, and the single habit to change.</p></div>
        </article>
      </div>
    </section>
  );
}

/** What isn't live yet. Hidden once the trading platform is switched on. */
export function Next() {
  if (TRADING_ENABLED) return null;
  const items: [IconName, string, string][] = [
    ['copy', 'Copy verified traders', 'Follow a trader whose record is synced from their exchange, sized to your account, with your own daily loss limit.'],
    ['key', 'Crypto exchanges', 'Connect an exchange with a trade-only API key. Keys that can withdraw are refused.'],
    ['play', 'Strategies, live', 'Run a strategy you’ve backtested and paper-traded on your own exchange account.'],
  ];
  return (
    <section className="sec" aria-labelledby="next-h">
      <SecHead id="next" label="Coming next" tone="gray" title={<>From reviewing trades<br />to automating them</>}
        body="We’re building trade execution on top of the journal. These aren’t live yet, and we’ll only ship them once they’re safe to use with real money." />
      <div className="next">
        {items.map(([icon, t, d]) => (
          <article className="n" key={t}><span className="soon">Coming soon</span><IconTile icon={icon} tone="gray" /><h3>{t}</h3><p>{d}</p></article>
        ))}
      </div>
    </section>
  );
}

export function Integrations() {
  const items: [IconName, string][] = TRADING_ENABLED
    ? [['plug', 'MetaTrader 5'], ['eye', 'Any MT5 broker'], ['key', 'Delta Exchange India'], ['signal', 'TradingView alerts'], ['bell', 'Web push'], ['mail', 'Email reviews'], ['cal', 'Economic calendar'], ['curve', 'Live charts']]
    : [['plug', 'MetaTrader 5'], ['eye', 'Any MT5 broker'], ['bell', 'Web push'], ['mail', 'Email reviews'], ['cal', 'Economic calendar'], ['news', 'Market news'], ['globe', 'Macro data'], ['curve', 'Live charts']];
  return (
    <section className="sec" aria-labelledby="int-h">
      <h2 className="int-title" id="int-h">What TRADElogs works with today</h2>
      <div className="intframe">
        <span className="vl" style={{ left: 0 }} /><span className="vl" style={{ right: 0 }} />
        <ul className="intgrid">
          {items.map(([icon, t]) => <li className="c" key={t}><Ic name={icon} stroke={1.8} />{t}</li>)}
        </ul>
      </div>
    </section>
  );
}

const FAQ = [
  TRADING_ENABLED
    ? { q: 'Can TRADElogs place or close trades on my account?', a: 'Not on MT5: you connect with the investor (read-only) password, which can view your history but cannot open, modify or close positions. On a crypto exchange it places orders only for the copies and strategies you switch on, using a trade-only API key you create and can revoke at any time.' }
    : { q: 'Can TRADElogs place or close trades on my account?', a: 'No. You connect with MT5’s investor (read-only) password, which can view your history but cannot open, modify or close positions.' },
  { q: 'Which brokers work?', a: 'Any broker that offers MetaTrader 5. You only need your MT5 login, investor password and your broker’s server name.' },
  { q: 'How much does it cost?', a: 'TRADElogs is free while we’re getting started, and you don’t need a card to sign up.' },
  { q: 'What happens to my password and data?', a: 'Your investor password is encrypted (AES-256-GCM) so we can keep syncing, and it can only read your account. Disconnecting a broker from the Brokers page deletes its synced data.' },
  { q: 'Do I have to import trades by hand?', a: 'Never. Once your account is connected, your history backfills automatically and new trades appear as they close.' },
  { q: 'Can I test a strategy before risking money?', a: 'Yes. Every strategy can be backtested on past candles and run on paper with simulated fills, so you see how the rules behave before anything else.' },
  ...(TRADING_ENABLED ? [{ q: 'Can a leader I copy take money from my account?', a: 'No. Leaders never see your account. Copies go through your own trade-only API key, and keys that can withdraw are refused. You set the size and a daily loss limit, and you can stop copying at any time.' }] : []),
];

export function FaqSection() {
  return (
    <section className="sec" id="faq" aria-labelledby="faq-h">
      <div className="faq">
        <div className="side">
          <Label tone="gray">FAQ</Label>
          <h2 id="faq-h">Frequently<br />asked<br />questions</h2>
          <p>Can’t find it here? Create a free account and ask the AI coach anything about your trading.</p>
        </div>
        <Faq items={FAQ} />
      </div>
    </section>
  );
}

export function Closing() {
  // [icon, tone, column, row] on a 6×5 grid
  const tiles: [IconName, Tone, number, number][] = [['book', 'green', 1, 0], ['chat', 'green', 3, 0], ['signal', 'green', 5, 1], ['bars', 'green', 0, 2], ['flame', 'red', 2, 2], ['curve', 'green', 4, 3], ['cal', 'gray', 1, 4], ['lock', 'gray', 3, 4]];
  const halo = { green: 'rgba(8,196,101,.9)', red: 'rgba(254,58,49,.9)', gray: 'rgba(255,255,255,.25)' };
  return (
    <section className="sec" aria-labelledby="close-h">
      <div className="closing">
        <div>
          <Label>Free while we’re getting started</Label>
          <h2 id="close-h">Sync. Review.<br />Fix. Repeat.</h2>
          <p>Connect your MT5 account in a couple of minutes and get your first weekly review on Saturday.</p>
          <StartCta testId="closing-start" />
        </div>
        <div className="scatter" aria-hidden>
          <div className="grid" />
          {tiles.map(([icon, tone, c, r]) => {
            const pos = { left: `${((c + 0.5) / 6) * 100}%`, top: `${((r + 0.5) / 5) * 100}%` };
            return (
              <span key={icon}>
                <span className="halo" style={{ ...pos, background: halo[tone] }} />
                <span className={`it lg ${tone === 'green' ? '' : tone}`} style={pos}><Ic name={icon} /></span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot-wrap">
      <div className="wrap">
        <div className="foot">
          <div className="brand">
            <Logo height={22} />
            <p style={{ color: 'var(--mut)', fontSize: 13.5, marginTop: 14, maxWidth: 280 }}>The trading journal that reads your MT5 history and tells you what to fix.</p>
            <div className="contact"><IconTile icon="chat" size="sm" /><div><b>Questions about your trading?</b><small>Ask the AI coach inside the app</small></div></div>
          </div>
          <nav aria-label="Product"><h3>Product</h3><ul><li><a href="#journal">Journal</a></li><li><a href="#analytics">Analytics</a></li><li><a href="#coach">AI coach</a></li><li><a href="#coach">SignalX</a></li><li><a href="#strategies">Strategies</a></li>{TRADING_ENABLED && <li><a href="#copy">Copy trading</a></li>}<li><a href="#markets">Markets</a></li></ul></nav>
          <nav aria-label="Account"><h3>Account</h3><ul><li><a href="/signup">Create account</a></li><li><a href="/login">Sign in</a></li>{PARTNERS_ENABLED && <li><a href="/partner">Become a partner</a></li>}<li><a href="#faq">FAQ</a></li></ul></nav>
          <nav aria-label="Legal"><h3>Legal</h3><ul><li><a href="/privacy">Privacy policy</a></li><li><a href="/terms">Terms of service</a></li></ul></nav>
        </div>
        <div className="ghostmark" aria-hidden>TRADElogs</div>
        <div className="fine"><span>© 2026 TRADElogs. Trading involves risk. Past performance does not guarantee future results. Figures shown are illustrative.</span><span className="links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></span></div>
      </div>
    </footer>
  );
}
