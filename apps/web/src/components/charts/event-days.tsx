'use client';

// "You on CPI days" (E): your closed trades on days with that release, from
// your own history and the calendar. Win %, average R, net, one bar per trade,
// opened before the print vs 30+ min after, and one line of advice when the
// split is clear. Deterministic; no AI.
import { Hourglass } from '@phosphor-icons/react';
import { money, signedR, type EventDayStats } from './trade-math';

interface Props {
  kind: string | null;
  stats: EventDayStats | null;
  scope: string;
  ccy: string;
  loading: boolean;
  unitKnown: boolean;
  error?: string | null;
}

function Bars({ s, unitKnown }: { s: EventDayStats; unitKnown: boolean }) {
  const H = 76, n = s.bars.length;
  const vals = s.bars.map(b => b.v);
  const top = Math.max(...vals, unitKnown ? 1.2 : 0, 0) || 1;
  const bot = Math.min(...vals, unitKnown ? -1.2 : 0, 0) || -1;
  const Y = (v: number) => 4 + ((top - v) / (top - bot)) * (H - 8);
  const slot = 100 / Math.max(n, 1);
  const bw = Math.min(8, slot * 0.62);
  const first = new Date(s.bars[0]!.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <div className="tl-evbars">
      <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" role="img" aria-label={`${n} trades, oldest ${first}`}>
        <line x1={0} x2={100} y1={Y(0)} y2={Y(0)} className="ax" />
        {s.bars.map((b, i) => (
          <rect key={b.id} x={i * slot + (slot - bw) / 2} y={Math.min(Y(0), Y(b.v))} width={bw} height={Math.max(1, Math.abs(Y(b.v) - Y(0)))} className={b.v >= 0 ? 'u' : 'd'}>
            <title>{unitKnown ? signedR(b.v) : money(b.v)}</title>
          </rect>
        ))}
      </svg>
      <div className="tl-evbars-l"><span>{first}</span><span>latest</span></div>
    </div>
  );
}

function Split({ label, w, l }: { label: string; w: number; l: number }) {
  return (
    <div className="tl-sp2">
      <span className="tl-lbl">{label}</span>
      <div className="tl-sb2" aria-hidden>{Array.from({ length: w }, (_, i) => <i key={`w${i}`} className="u" />)}{Array.from({ length: l }, (_, i) => <i key={`l${i}`} className="d" />)}</div>
      <b className="m">{w}–{l}</b>
    </div>
  );
}

export default function EventDays({ kind, stats, scope, ccy, loading, unitKnown, error }: Props) {
  const title = kind ? `You on ${kind} days` : 'You on event days';
  return (
    <section className="tl-card tl-w" aria-label={title} data-testid="event-days">
      <header className="tl-wh"><h2>{title}</h2>{stats && <span className="tl-st">· {stats.n} {scope}</span>}</header>
      <div className="tl-wb">
        {loading ? <div className="x-skel" style={{ height: 200 }} />
          : error ? <p className="tl-empty"><span>{error}</span></p>
          : !kind ? <p className="tl-empty"><span>No high-impact release for this market in the last two days or coming up.</span></p>
            : !stats ? <p className="tl-empty" data-testid="event-days-empty"><b>No trades on {kind} days yet.</b><span>Once you&rsquo;ve traded on a {kind} day, your win rate and timing around the print show here.</span></p>
              : (
                <>
                  <div className="tl-k3 tl-k3-big">
                    <div><b className={`tl-n22 ${stats.winPct < 50 ? 'neg' : 'pos'}`}>{Math.round(stats.winPct)}%</b><span>win</span></div>
                    {stats.avgR != null && <div><b className={`tl-n22 ${stats.avgR < 0 ? 'neg' : 'pos'}`}>{signedR(stats.avgR)}</b><span>avg</span></div>}
                    <div><b className={`tl-n22 mny ${stats.net < 0 ? 'neg' : 'pos'}`}>{money(stats.net, ccy, true)}</b><span>net</span></div>
                  </div>
                  <Bars s={stats} unitKnown={unitKnown} />
                  {stats.before.w + stats.before.l > 0 && <Split label="Opened before" w={stats.before.w} l={stats.before.l} />}
                  {stats.after.w + stats.after.l > 0 && <Split label="30m+ after" w={stats.after.w} l={stats.after.l} />}
                  {stats.advice && <p className="tl-one"><Hourglass size={14} aria-hidden />{stats.advice}</p>}
                </>
              )}
      </div>
    </section>
  );
}
