'use client';

// Open trade (E): live P&L, where price sits between your stop and 2R, distance
// to the stop, time held, the worst point so far, your note and one coach line.
// Nothing is shown that the data can't back: no stop on record → no R track.
import { useEffect, useState } from 'react';
import { Circle, NotePencil, Warning } from '@phosphor-icons/react';
import { heldFor, money, px, signedR, type ChartTrade, type Coach } from './trade-math';

interface Props {
  symbol: string;
  trade: ChartTrade | null;
  loading: boolean;
  error: string | null;
  venue: string | null;
  price: number | null;
  pnl: number | null;
  ccy: string;
  stop: number | null;
  stopSource: string | null;
  /** Worst adverse move since entry, in price (≤ 0). */
  worstMove: number | null;
  pointValue: number | null;
  decimals: number;
  coach: Coach | null;
  note: string | null;
  /** Closed trades on this symbol (for the empty state). */
  closedCount: number;
}

function RTrack({ now, low }: { now: number; low: number | null }) {
  // Lines in a stretched SVG, labels and the dot in HTML so type stays 11px at any width.
  const lo = -1.25, hi = 2.25;
  const X = (r: number) => 3 + ((Math.max(lo, Math.min(hi, r)) - lo) / (hi - lo)) * 94;
  const showLow = low != null && Math.abs(X(low) - X(now)) > 8;
  return (
    <div className="tl-rtrack" role="img" aria-label={`Now ${signedR(now)} of risk${low != null ? `, low ${signedR(low)}` : ''}`}>
      <svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden>
        <line className="ax" x1={3} x2={97} y1={10} y2={10} />
        <rect x={X(-1)} y={5} width={X(0) - X(-1)} height={10} className="zd" />
        <rect x={X(0)} y={5} width={X(hi) - X(0)} height={10} className="zu" />
        {[-1, 0, 1, 2].map(r => <line key={r} x1={X(r)} x2={X(r)} y1={2} y2={18} className={r === -1 ? 'sl' : 'tk'} />)}
        {low != null && <line x1={X(low)} x2={X(low)} y1={3} y2={17} className="lo" />}
        <line x1={X(0)} x2={X(now)} y1={10} y2={10} className={now < 0 ? 'nowd' : 'nowu'} />
      </svg>
      <i className="tl-rt-dot" style={{ left: `${X(now)}%` }} />
      {showLow && <span className="tl-rt-top" style={{ left: `${X(low!)}%` }}>low</span>}
      <span className="tl-rt-top cur" style={{ left: `${Math.min(80, X(now))}%`, transform: 'translateX(8px)' }}>now {signedR(now)}</span>
      {[-1, 0, 1, 2].map(r => <span key={r} className={`tl-rt-bot ${r === -1 ? 'neg' : ''}`} style={{ left: `${X(r)}%` }}>{r === -1 ? 'SL' : r === 0 ? '0R' : `+${r}R`}</span>)}
    </div>
  );
}

export default function OpenTradeCard(p: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const t = p.trade;
  const dist = t && p.stop != null ? Math.abs(t.entry - p.stop) : null;
  const dir = t?.side === 'LONG' ? 1 : -1;
  const rNow = t && dist && p.price != null ? ((p.price - t.entry) * dir) / dist : null;
  const rLow = t && dist && p.worstMove != null ? Math.min(p.worstMove / dist, rNow ?? 0) : null;
  const toStop = t && p.stop != null && p.price != null ? Math.abs(p.price - p.stop) : null;
  const worstMoney = t && p.worstMove != null && p.pointValue ? p.worstMove * t.volume * p.pointValue : null;

  return (
    <section className="tl-card tl-w" aria-label="Open trade" data-testid="open-trade">
      <header className="tl-wh">
        <h2>Open trade</h2>
        {t && <span className="tl-st">· {t.symbol}{p.venue ? ` · ${p.venue}` : ''}</span>}
        <div className="tl-r">{t && <span className="tl-chip up"><Circle size={8} weight="bold" aria-hidden />Live</span>}</div>
      </header>
      <div className="tl-wb">
        {p.loading && !t ? <div className="x-skel" style={{ height: 150 }} aria-label="Loading your trades" />
          : p.error && !t ? <p className="tl-empty">Your trades didn&rsquo;t load: {p.error}</p>
            : !t ? (
              <div className="tl-empty" data-testid="open-trade-empty">
                <b>No open {p.symbol} trade.</b>
                <span>{p.closedCount ? `Your ${p.closedCount} closed ${p.symbol} trade${p.closedCount === 1 ? '' : 's'} are on the chart.` : `Trades you take on ${p.symbol} show up here and on the chart.`}</span>
              </div>
            ) : (
              <>
                <div className="tl-pnl">
                  {p.pnl != null ? <span className={`tl-n34 mny ${p.pnl < 0 ? 'neg' : p.pnl > 0 ? 'pos' : ''}`} data-testid="open-pnl">{money(p.pnl, p.ccy, true)}</span> : <span className="tl-n34 x-muted">—</span>}
                  <span className="tl-sub m">{t.side === 'LONG' ? 'long' : 'short'} {t.volume} @ {px(t.entry, p.decimals)}</span>
                </div>
                {rNow != null ? <RTrack now={rNow} low={rLow} /> : p.stop != null ? null : (
                  <p className="tl-hint" data-testid="no-stop">{p.stopSource ?? 'No stop on record for this trade (MT5 doesn’t share it). Save a plan in the Risk ruler to track it in R.'}</p>
                )}
                <div className="tl-k3">
                  {toStop != null && <div><b className="tl-n14">{px(toStop, p.decimals)}</b><span>to stop</span></div>}
                  {t.openTime != null && <div><b className="tl-n14">{heldFor(now - t.openTime)}</b><span>held</span></div>}
                  {worstMoney != null && <div><b className={`tl-n14 mny ${worstMoney < 0 ? 'neg' : ''}`}>{money(worstMoney, p.ccy, true)}</b><span>worst</span></div>}
                </div>
                {p.note && <div className="tl-note"><NotePencil size={14} aria-hidden /><span>&ldquo;{p.note}&rdquo;</span></div>}
                {p.coach?.line && <p className={`tl-one ${p.coach.line.startsWith('You lost') ? 'neg' : ''}`} data-testid="coach-line"><Warning size={14} aria-hidden />{p.coach.line}</p>}
                {!p.coach?.line && p.coach?.flag && <p className="tl-one"><Warning size={14} aria-hidden />{p.coach.flag}</p>}
              </>
            )}
      </div>
    </section>
  );
}
