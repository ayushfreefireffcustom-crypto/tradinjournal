'use client';

// v6 analytics cards. Every chart measures its box (useSize) so axis labels stay
// crisp at any width; green is profit, red is loss, greys for everything else.
import { useId, useMemo, useState, type ReactNode } from 'react';
import type { AccountStats, Trade } from '@/lib/api';
import { fmtPct, fmtUsd, fmtUsdCompact } from '@/lib/dashboard-v6';
import { fmtUsd as plainUsd } from '@/lib/format'; // unsigned amounts (std dev, peak)
import { tickerMark } from '@/lib/desk';
import { SideChip } from '@/components/v6/desk';
import { ACard, Empty, Facts, MONO, Tip, niceStep, ticks, useSize } from './kit';
import InfoTip from '@/components/v6/ui/info-tip';
import { METRIC_HELP } from '@/lib/metric-help';
import { MIN_CAGR_DAYS, MIN_RETURNS } from '@/lib/risk';
import Unknown from '@/components/v6/ui/unknown';

const tone = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');
/** "+$1.2k" / "−$340" / "$0". */
const sc = (v: number) => (v > 0 ? `+${fmtUsdCompact(v)}` : fmtUsdCompact(v));
/** Axis money: "$2k" rather than "$2.0k". */
const ax = (v: number) => (v === 0 ? '$0' : fmtUsdCompact(v).replace(/\.0(?=[kM])/, ''));
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

const stdev = (xs: number[]) => {
  if (!xs.length) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

const compact = (v: number) => { const a = Math.abs(v), body = a >= 1000 ? `${(a / 1000).toFixed(1)}k` : `${Math.round(a)}`; return body === '0' ? '0' : `${v > 0 ? '+' : '−'}${body}`; }; // no sign on what rounds to 0

function Caret() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>;
}

// ─── KPI strip ───────────────────────────────────────────────────────────────

export function KpiStrip({ view }: { view: AccountStats }) {
  const n = view.totalTrades;
  const peak = Math.max(...view.equityCurve.map(p => p.equity), view.startingBalance);
  const recovered = view.maxDrawdownPct > 0 && view.currentEquity >= peak;
  const ddAbs = view.maxDrawdownPct * peak;
  const pfInf = view.profitFactor >= 999;
  const k = [
    { id: 'netpl', h: 'netPnl' as const, l: 'Net P&L', v: n ? fmtUsd(view.netPnl) : '—', c: tone(view.netPnl), s: plural(n, 'trade') },
    { id: 'profitfactor', h: 'profitFactor' as const, l: 'Profit factor', v: !n ? '—' : pfInf ? '∞' : view.profitFactor.toFixed(2), c: '', s: !n ? 'No closed trades' : pfInf ? 'No losers yet' : `$${view.profitFactor.toFixed(2)} won per $1 lost` },
    { id: 'grossprofit', h: 'grossProfit' as const, l: 'Gross profit', v: n ? fmtUsd(view.grossProfit) : '—', c: view.grossProfit ? 'pos' : '', s: plural(view.totalWins, 'winner') },
    { id: 'grossloss', h: 'grossLoss' as const, l: 'Gross loss', v: n ? fmtUsd(-Math.abs(view.grossLoss)) : '—', c: view.grossLoss ? 'neg' : '', s: plural(view.totalLosses, 'loser') },
    { id: 'maxdrawdown', h: 'maxDrawdown' as const, l: 'Max drawdown', v: n ? fmtPct(view.maxDrawdownPct) : '—', c: view.maxDrawdownPct ? 'neg' : '', s: ddAbs > 0 ? `${fmtUsd(-ddAbs, 0)}${recovered ? ' · recovered' : ''}` : 'No drawdown yet' },
  ];
  return (
    <section className="x-strip x-strip--card an-kpis" style={{ ['--n' as string]: 5 }} aria-label="Summary">
      {k.map(x => <div key={x.id} data-testid={`kpi-${x.id}`}><span>{x.l}<InfoTip {...METRIC_HELP[x.h]} /></span><b className={`m ${x.c} ${['netpl', 'grossprofit', 'grossloss'].includes(x.id) ? 'mny' : ''}`}>{x.v === '—' ? <Unknown why="No closed trades in this range" /> : x.v}</b><small className={x.id === 'maxdrawdown' ? 'mny' : ''}>{x.s}</small></div>)}
    </section>
  );
}

// ─── strike rate ─────────────────────────────────────────────────────────────

export function Strike({ view }: { view: AccountStats }) {
  const total = view.totalWins + view.totalLosses;
  const w = total ? view.totalWins / total : 0;
  const R = 58, C = 2 * Math.PI * R;
  return (
    <ACard title="Win rate" sub="wins vs losses" testId="strike-card">
      <div className="an-strike">
        <div className="an-ring" data-testid="winloss-donut">
          <svg viewBox="0 0 140 140" aria-hidden>
            <circle cx="70" cy="70" r={R} fill="none" stroke="var(--track)" strokeWidth="14" />
            {total > 0 && w < 1 && <circle cx="70" cy="70" r={R} fill="none" stroke="var(--r)" strokeWidth="14" strokeDasharray={`${C * (1 - w)} ${C}`} strokeDashoffset={-C * w} transform="rotate(-90 70 70)" />}
            {total > 0 && w > 0 && <circle cx="70" cy="70" r={R} fill="none" stroke="var(--g)" strokeWidth="14" strokeDasharray={`${C * w} ${C}`} transform="rotate(-90 70 70)" />}
          </svg>
          <div><b className="m">{total ? fmtPct(w, 0) : '—'}</b><span>win rate</span></div>
        </div>
        <dl className="an-legend">
          <div><dt><i className="g" />Wins</dt><dd className="m">{view.totalWins}</dd></div>
          <div><dt><i className="r" />Losses</dt><dd className="m">{view.totalLosses}</dd></div>
          <div className="t"><dt>Total</dt><dd className="m">{total}</dd></div>
        </dl>
      </div>
      <Facts items={[
        { l: 'Avg win', h: 'avgWinLoss', v: total ? fmtUsd(view.avgWin) : '—', c: view.avgWin ? 'pos' : '', why: 'No closed trades in this range' },
        { l: 'Avg loss', v: total ? fmtUsd(-Math.abs(view.avgLoss)) : '—', c: view.avgLoss ? 'neg' : '', why: 'No closed trades in this range' },
        { l: 'Best', v: total ? fmtUsd(view.bestTrade) : '—', c: tone(view.bestTrade), why: 'No closed trades in this range' },
        { l: 'Worst', v: total ? fmtUsd(view.worstTrade) : '—', c: tone(view.worstTrade), why: 'No closed trades in this range' },
      ]} />
    </ACard>
  );
}

// ─── P&L distribution ────────────────────────────────────────────────────────

export function Dist({ trades }: { trades: Trade[] }) {
  const pnls = trades.map(t => t.netPnl);
  if (!pnls.length) return <ACard title="P&L per trade" sub="distribution" testId="r-distribution"><Empty h={240}>No closed trades in this range.</Empty></ACard>;
  // Round bins with an edge at $0, so every bar is all wins or all losses.
  const lo0 = Math.min(...pnls, 0), hi0 = Math.max(...pnls, 0);
  const width = niceStep(Math.max(hi0 - lo0, 1), Math.min(12, Math.max(6, Math.round(Math.sqrt(pnls.length) * 2))));
  const start = Math.floor(lo0 / width) * width, N = Math.max(1, Math.ceil((hi0 - start) / width) + (hi0 % width === 0 && hi0 > 0 ? 1 : 0));
  const buckets = Array.from({ length: N }, (_, i) => ({ lo: start + i * width, hi: start + (i + 1) * width, n: 0 }));
  for (const v of pnls) buckets[Math.min(N - 1, Math.max(0, Math.floor((v - start) / width)))]!.n++;
  const exp = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  // Best and worst trade are on the strike-rate card; this one describes the shape.
  const sorted = [...pnls].sort((a, b) => a - b), mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const sd = stdev(pnls);
  const within = pnls.filter(v => Math.abs(v - exp) <= sd).length / pnls.length;
  return (
    <ACard title="P&L per trade" sub="trades per P&L range" testId="r-distribution">
      <DistChart buckets={buckets} total={pnls.length} />
      <Facts items={[
        { l: 'Expectancy', h: 'expectancy', v: fmtUsd(exp), c: tone(exp) },
        { l: 'Std dev', h: 'stdDev', v: plainUsd(sd, { digits: 0 }) },
        { l: 'Median trade', h: 'median', v: fmtUsd(median), c: tone(median) },
        { l: 'Within 1 std dev', h: 'withinSd', v: pnls.length > 1 ? `${Math.round(within * 100)}%` : '—', why: 'Needs at least 2 closed trades' },
      ]} />
    </ACard>
  );
}

function DistChart({ buckets, total }: { buckets: { lo: number; hi: number; n: number }[]; total: number }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hov, setHov] = useState<number | null>(null);
  const L = 34, R = 4, T = 16, B = 22;
  const yt = ticks(0, Math.max(...buckets.map(b => b.n), 1), 3).filter(v => Number.isInteger(v));
  const top = yt[yt.length - 1]!;
  const Y = (v: number) => h - B - (v / top) * (h - B - T);
  const slot = (w - L - R) / buckets.length, bw = Math.max(3, slot * 0.72);
  const every = Math.max(1, Math.ceil(buckets.length / Math.max(2, Math.floor((w - L - R) / 58))));
  const hb = hov != null ? buckets[hov] : null;
  return (
    <div className="an-chart" ref={ref} onPointerLeave={() => setHov(null)}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Distribution of ${total} trade results`}>
          {yt.map(v => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--line-2)' : 'var(--grid)'} />
              <text x={L - 8} y={Y(v) + 3.5} textAnchor="end" fontSize="11" fill="var(--axis)" style={MONO}>{v}</text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const x = L + i * slot + (slot - bw) / 2, mid = (b.lo + b.hi) / 2;
            return (
              <g key={i} onPointerEnter={() => setHov(i)}>
                <rect x={L + i * slot} y={T} width={slot} height={h - B - T} fill="transparent" />
                {b.n > 0 && <rect x={x} y={Y(b.n)} width={bw} height={h - B - Y(b.n)} rx={Math.min(4, bw / 4)} fill={mid < 0 ? 'var(--r)' : 'var(--g)'} opacity={hov == null || hov === i ? 0.9 : 0.4} />}
                {b.n > 0 && <text x={x + bw / 2} y={Y(b.n) - 5} textAnchor="middle" fontSize="11" fill="var(--mut)" style={MONO}>{b.n}</text>}
                {(i % every === 0) && <text x={L + i * slot} y={h - 5} textAnchor={i === 0 ? 'start' : 'middle'} fontSize="11" fill="var(--axis)" style={MONO}>{b.lo === 0 ? '$0' : sc(b.lo)}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {hb && hov != null && (
        <Tip x={L + hov * slot + slot / 2} y={8} w={w}>
          <span>{sc(hb.lo)} to {sc(hb.hi)}</span>
          <b className="m">{plural(hb.n, 'trade')}</b>
          <span>{fmtPct(hb.n / total, 0)} of trades</span>
        </Tip>
      )}
    </div>
  );
}

// ─── equity + drawdown ───────────────────────────────────────────────────────

interface EqPt { time: string; equity: number; dd: number }

export function Equity({ view }: { view: AccountStats }) {
  const pts = useMemo<EqPt[]>(() => {
    let peak = -Infinity;
    return view.equityCurve.filter(p => Number.isFinite(p.equity)).map(p => {
      peak = Math.max(peak, p.equity);
      return { time: p.time, equity: p.equity, dd: peak > 0 ? (peak - p.equity) / peak : 0 };
    });
  }, [view.equityCurve]);
  const peak = Math.max(...pts.map(p => p.equity), view.startingBalance);
  const days = view.risk?.tradingDays ?? 0;
  const fewDays = days < MIN_RETURNS ? `Needs ${MIN_RETURNS} trading days; ${days} so far` : null;
  return (
    <ACard title="Equity curve" sub="vs starting balance" testId="dd-card"
      right={<span className="x-sub an-peak">Peak <b className="m mny">{plainUsd(peak, { digits: 0 })}</b></span>}>
      <EquityChart pts={pts} base={view.startingBalance} />
      {view.risk && (
        <Facts items={[
          { l: 'Sharpe', h: 'sharpe', v: view.risk.sharpe == null ? '—' : view.risk.sharpe.toFixed(2), why: fewDays ?? 'Every day returned the same, so there is no spread to measure' },
          { l: 'Sortino', h: 'sortino', v: view.risk.sortino == null ? '—' : view.risk.sortino.toFixed(2), why: fewDays ?? 'No losing days yet' },
          { l: 'CAGR', h: 'cagr', v: view.risk.cagrPct == null ? '—' : fmtPct(view.risk.cagrPct / 100), c: view.risk.cagrPct == null ? '' : tone(view.risk.cagrPct), why: `Needs ${MIN_CAGR_DAYS} days of history and a positive balance` },
          { l: 'Recovery factor', h: 'recoveryFactor', v: view.risk.recoveryFactor == null ? '—' : view.risk.recoveryFactor.toFixed(2), why: 'No drawdown yet, so nothing to recover from' },
        ]} />
      )}
    </ACard>
  );
}

function EquityChart({ pts, base }: { pts: EqPt[]; base: number }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hov, setHov] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  if (pts.length < 2) return <div className="an-chart an-chart--eq" ref={ref}><Empty>The curve draws itself after the first closed trade in this range.</Empty></div>;
  const L = 56, R = 10, T = 10, gap = 34;
  const ddH = Math.max(46, Math.round(h * 0.22));
  const eqB = h - ddH - gap - 20, ddTop = eqB + gap, ddB = h - 20;
  const vs = pts.map(p => p.equity);
  const yt = ticks(Math.min(...vs, base), Math.max(...vs, base), 4);
  const mn = yt[0]!, mx = yt[yt.length - 1]!;
  const mdd = Math.max(...pts.map(p => p.dd), 0.0001);
  const X = (i: number) => L + (i / (pts.length - 1)) * (w - L - R);
  const Y = (v: number) => eqB - ((v - mn) / (mx - mn)) * (eqB - T);
  const Yd = (d: number) => ddTop + (d / mdd) * (ddB - ddTop);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.equity).toFixed(1)}`).join(' ');
  const ddLine = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Yd(p.dd).toFixed(1)}`).join(' ');
  const yb = Y(base);
  const area = `${line} L${X(pts.length - 1).toFixed(1)} ${yb.toFixed(1)} L${X(0).toFixed(1)} ${yb.toFixed(1)}Z`;
  const nT = w > 640 ? 5 : 3;
  const times = pts.map(p => (p.time ? new Date(p.time).getTime() : NaN)).filter(Number.isFinite);
  const shortSpan = times.length > 1 && Math.max(...times) - Math.min(...times) < 2 * 86_400_000;
  const label = (i: number) => {
    const t = pts[i]!.time;
    if (!t) return 'Start';
    return shortSpan ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : shortDate(t);
  };
  // Evenly spaced by trade, then drop any tick that would repeat its neighbour's label.
  const xt = Array.from({ length: nT }, (_, k) => Math.round((k / (nT - 1)) * (pts.length - 1)))
    .filter((i, k, a) => k === 0 || (i !== a[k - 1] && label(i) !== label(a[k - 1]!)));
  const onMove = (e: React.PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - L) / (w - L - R)) * (pts.length - 1));
    setHov(i >= 0 && i < pts.length ? i : null);
  };
  const hp = hov != null ? pts[hov] : null;
  return (
    <div className="an-chart an-chart--eq" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHov(null)}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Equity from $${Math.round(pts[0]!.equity)} to $${Math.round(pts[pts.length - 1]!.equity)}, max drawdown ${fmtPct(mdd)}`}>
          <defs>
            <clipPath id={`${uid}a`}><rect x={0} y={0} width={w} height={Math.max(0, yb)} /></clipPath>
            <clipPath id={`${uid}b`}><rect x={0} y={yb} width={w} height={Math.max(0, h - yb)} /></clipPath>
            <linearGradient id={`${uid}g`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--g)" stopOpacity=".26" /><stop offset="1" stopColor="var(--g)" stopOpacity=".02" /></linearGradient>
            <linearGradient id={`${uid}r`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--r)" stopOpacity=".04" /><stop offset="1" stopColor="var(--r)" stopOpacity=".28" /></linearGradient>
          </defs>
          {yt.map(v => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" />
              <text className="mny" x={L - 8} y={Y(v) + 3.5} textAnchor="end" fontSize="11" fill="var(--axis)" style={MONO}>{ax(v)}</text>
            </g>
          ))}
          <path d={area} fill={`url(#${uid}g)`} clipPath={`url(#${uid}a)`} />
          <path d={area} fill={`url(#${uid}r)`} clipPath={`url(#${uid}b)`} />
          <line x1={L} x2={w - R} y1={yb} y2={yb} stroke="var(--line-2)" strokeDasharray="4 4" />
          <text x={w - R} y={yb - 6} textAnchor="end" fontSize="11" fill="var(--axis)">Starting balance</text>
          <path d={line} fill="none" stroke="var(--g)" strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${uid}a)`} />
          <path d={line} fill="none" stroke="var(--r)" strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${uid}b)`} />
          <text x={L} y={ddTop - 8} fontSize="11" fill="var(--axis)">Drawdown from peak</text>
          <line x1={L} x2={w - R} y1={ddTop} y2={ddTop} stroke="var(--grid)" />
          <line x1={L} x2={w - R} y1={ddB} y2={ddB} stroke="var(--grid)" />
          <text x={L - 8} y={ddTop + 3.5} textAnchor="end" fontSize="11" fill="var(--axis)" style={MONO}>0%</text>
          <text x={L - 8} y={ddB + 3.5} textAnchor="end" fontSize="11" fill="var(--r)" style={MONO}>−{fmtPct(mdd)}</text>
          <path d={`${ddLine} L${X(pts.length - 1)} ${ddTop} L${X(0)} ${ddTop}Z`} fill={`url(#${uid}r)`} />
          <path d={ddLine} fill="none" stroke="var(--r)" strokeWidth="1.3" strokeLinejoin="round" />
          {xt.map((i, k) => (
            <text key={k} x={X(i)} y={h - 3} fontSize="11" fill="var(--axis)" textAnchor={k === 0 ? 'start' : k === xt.length - 1 ? 'end' : 'middle'}>{label(i)}</text>
          ))}
          {hp && hov != null && (
            <g pointerEvents="none">
              <line x1={X(hov)} x2={X(hov)} y1={T} y2={ddB} stroke="var(--axis)" strokeOpacity=".6" strokeDasharray="3 3" />
              <circle cx={X(hov)} cy={Y(hp.equity)} r="4.5" fill="var(--s1)" stroke={hp.equity >= base ? 'var(--g)' : 'var(--r)'} strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {hp && hov != null && (
        <Tip x={X(hov)} y={Math.max(0, Y(hp.equity) - 64)} w={w}>
          <span>{label(hov)}</span>
          <b className="m">${hp.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          <span className={`m ${hp.equity >= base ? 'pos' : 'neg'}`}>{fmtUsd(hp.equity - base)} vs start</span>
          {hp.dd > 0 && <span className="m neg">−{fmtPct(hp.dd)} from peak</span>}
        </Tip>
      )}
    </div>
  );
}

// ─── instruments ─────────────────────────────────────────────────────────────

export function SymbolTable({ rows }: { rows: AccountStats['bySymbol'] }) {
  const [k, setK] = useState<'netPnl' | 'trades' | 'winRate'>('netPnl');
  const sorted = [...rows].sort((a, b) => b[k] - a[k]);
  const th = (key: typeof k, l: string, cls = '') => (
    <th className={`n ${cls}`} aria-sort={k === key ? 'descending' : undefined}>
      <button onClick={() => setK(key)} className={k === key ? 'an-sorted' : undefined}>{l}{k === key && <Caret />}</button>
    </th>
  );
  return (
    <ACard title="Instruments" sub={`${rows.length} traded`} testId="bysymbol-card">
      {rows.length === 0 ? <Empty h={200}>No instruments in this range.</Empty> : (
        <div className="x-tblwrap an-symwrap">
          <table className="x-tbl an-sym">
            <thead><tr><th>Symbol</th>{th('trades', 'Trades', 'an-hide')}{th('winRate', 'Win rate')}{th('netPnl', 'Net P&L')}<th className="n an-hide">Avg / trade</th></tr></thead>
            <tbody>{sorted.map(s => (
              <tr key={s.symbol}>
                <td><span className="x-sym"><span className="x-mk">{tickerMark(s.symbol)}</span><span><b>{s.symbol}</b><small className="an-show">{plural(s.trades, 'trade')}</small></span></span></td>
                <td className="n m an-hide">{s.trades}</td>
                <td className="n m">{fmtPct(s.winRate, 0)}</td>
                <td className={`n m ${tone(s.netPnl)}`}>{fmtUsd(s.netPnl)}</td>
                <td className={`n m an-hide ${tone(s.avgPnl)}`}>{fmtUsd(s.avgPnl)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ACard>
  );
}

// ─── diverging bars (emotion / tag / direction) ──────────────────────────────

function Diverging({ rows }: { rows: { key: string; label: ReactNode; sub: string; net: number; title: string }[] }) {
  const mx = Math.max(...rows.map(r => Math.abs(r.net)), 1);
  return (
    <div className="an-div">
      {rows.map(r => {
        const w = Math.max((Math.abs(r.net) / mx) * 50, r.net ? 1 : 0);
        return (
          <div key={r.key} className="an-div-row" title={r.title}>
            <span className="an-div-l">{r.label}<small>{r.sub}</small></span>
            <div className="an-div-t"><i style={{ [r.net >= 0 ? 'left' : 'right']: '50%', width: `${w}%`, background: r.net >= 0 ? 'var(--g)' : 'var(--r)' }} /></div>
            <b className={`m ${tone(r.net)}`}>{sc(r.net)}</b>
          </div>
        );
      })}
      <div className="an-div-row an-div-ax" aria-hidden>
        <span />
        <div className="m"><span>{sc(-mx)}</span><span>$0</span><span>{sc(mx)}</span></div>
        <span />
      </div>
    </div>
  );
}

export function Direction({ view }: { view: AccountStats }) {
  const { long, short } = view.byDirection;
  const total = long.trades + short.trades;
  const rows = [{ k: 'LONG' as const, d: long }, { k: 'SHORT' as const, d: short }];
  return (
    <ACard title="Long vs short" sub="net P&L by direction" testId="direction-card">
      {total === 0 ? <Empty h={200}>No closed trades in this range.</Empty> : (
        <>
          <Diverging rows={rows.map(({ k, d }) => ({
            key: k, label: <SideChip dir={k} />, net: d.netPnl,
            sub: d.trades ? `${plural(d.trades, 'trade')} · ${fmtPct(d.wins / d.trades, 0)} won` : 'No trades',
            title: `${k === 'LONG' ? 'Long' : 'Short'}: ${fmtUsd(d.netPnl)} over ${plural(d.trades, 'trade')}`,
          }))} />
          <Facts items={[
            { l: 'Long share', v: fmtPct(long.trades / total, 0) },
            { l: 'Long avg', v: long.trades ? fmtUsd(long.netPnl / long.trades, 0) : '—', c: long.trades ? tone(long.netPnl) : '' },
            { l: 'Short avg', v: short.trades ? fmtUsd(short.netPnl / short.trades, 0) : '—', c: short.trades ? tone(short.netPnl) : '' },
          ]} />
        </>
      )}
    </ACard>
  );
}

// ─── vertical diverging bars (hour of day / weekday) ─────────────────────────

export interface Bar { key: string; label: string; net: number; n: number }

export function VBars({ bars, labelEvery = 1, values = false, tipLabel, height }: { bars: Bar[]; labelEvery?: number; values?: boolean; tipLabel: (b: Bar) => string; height?: number }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hov, setHov] = useState<number | null>(null);
  const L = 48, R = 4, T = values ? 18 : 8, B = values ? 38 : 22;
  const hasNeg = bars.some(b => b.net < 0), hasPos = bars.some(b => b.net > 0);
  const yt = ticks(hasNeg ? Math.min(...bars.map(b => b.net)) : 0, hasPos ? Math.max(...bars.map(b => b.net)) : 0, 4);
  const mn = yt[0]!, mx = yt[yt.length - 1]!;
  const Y = (v: number) => h - B - ((v - mn) / (mx - mn)) * (h - B - T);
  const y0 = Y(0);
  const slot = (w - L - R) / bars.length, bw = Math.max(3, Math.min(slot * 0.66, 44));
  const hb = hov != null ? bars[hov] : null;
  return (
    <div className="an-chart" ref={ref} style={height ? { height } : undefined} onPointerLeave={() => setHov(null)}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} role="img" aria-label="Net P&L bars">
          {yt.map(v => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--line-2)' : 'var(--grid)'} />
              <text className="mny" x={L - 8} y={Y(v) + 3.5} textAnchor="end" fontSize="11" fill="var(--axis)" style={MONO}>{ax(v)}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x = L + i * slot + (slot - bw) / 2;
            const bh = b.net ? Math.max(2, Math.abs(Y(b.net) - y0)) : 0;
            return (
              <g key={b.key} onPointerEnter={() => setHov(b.n ? i : null)}>
                <rect x={L + i * slot} y={T} width={slot} height={h - B - T + (values ? 20 : 0)} fill="transparent" />
                {bh > 0 && <rect x={x} y={b.net >= 0 ? y0 - bh : y0} width={bw} height={bh} rx={Math.min(4, bw / 4)} fill={b.net >= 0 ? 'var(--g)' : 'var(--r)'} opacity={hov == null || hov === i ? 0.92 : 0.55} />}
                {(i % labelEvery === 0) && <text x={x + bw / 2} y={h - (values ? 22 : 5)} textAnchor="middle" fontSize="11" fill="var(--axis)" style={values ? undefined : MONO}>{b.label}</text>}
                {values && <text x={x + bw / 2} y={h - 5} textAnchor="middle" fontSize="11" fill={b.net > 0 ? 'var(--g)' : b.net < 0 ? 'var(--r)' : 'var(--dim)'} style={MONO}>{!b.n ? '—' : slot < 46 && b.net > 0 ? compact(b.net).slice(1) : compact(b.net)}</text>}
              </g>
            );
          })}
        </svg>
      )}
      {hb && hov != null && (
        <Tip x={L + hov * slot + slot / 2} y={6} w={w}>
          <span>{tipLabel(hb)}</span>
          <b className={`m ${tone(hb.net)}`}>{hb.n ? fmtUsd(hb.net) : '—'}</b>
          <span>{plural(hb.n, 'trade')}</span>
        </Tip>
      )}
    </div>
  );
}

export function Hours({ trades }: { trades: Trade[] }) {
  const net = Array(24).fill(0) as number[], cnt = Array(24).fill(0) as number[];
  for (const t of trades) { const x = new Date(t.openTime).getHours(); net[x] = net[x]! + t.netPnl; cnt[x] = cnt[x]! + 1; }
  const best = net.indexOf(Math.max(...net)), worst = net.indexOf(Math.min(...net)), busy = cnt.indexOf(Math.max(...cnt));
  const hh = (x: number) => `${String(x).padStart(2, '0')}:00`;
  const bars = net.map((v, i) => ({ key: String(i), label: String(i).padStart(2, '0'), net: v, n: cnt[i]! }));
  return (
    <ACard title="Hour of day" sub="entry hour, your time" testId="time-of-day">
      {!trades.length ? <Empty h={220}>No closed trades in this range.</Empty> : <VBars bars={bars} labelEvery={3} tipLabel={b => `${hh(Number(b.key))}–${hh((Number(b.key) + 1) % 24)}`} />}
      <Facts items={[
        { l: 'Best hour', v: net[best]! > 0 ? hh(best) : '—', c: net[best]! > 0 ? 'pos' : '', why: trades.length ? 'No hour finished in profit' : 'No closed trades in this range' },
        { l: 'Worst hour', v: net[worst]! < 0 ? hh(worst) : '—', c: net[worst]! < 0 ? 'neg' : '', why: trades.length ? 'No hour finished at a loss' : 'No closed trades in this range' },
        { l: 'Most active', v: cnt[busy] ? hh(busy) : '—', why: 'No closed trades in this range' },
      ]} />
    </ACard>
  );
}

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function DayBars({ data }: { data: { day: string; netPnl: number; trades: number }[] }) {
  const all = WEEK.map(d => data.find(x => x.day.slice(0, 3) === d) ?? { day: d, netPnl: 0, trades: 0 });
  const rows = all.filter((r, i) => i < 5 || r.trades > 0);
  const total = rows.reduce((n, r) => n + r.trades, 0);
  return (
    <ACard title="P&L by weekday" sub="local close day" right={<span className="m">{plural(total, 'trade')}</span>} testId="byday-card">
      {!total ? <Empty h={220}>No closed trades in this range.</Empty> : (
        <VBars values bars={rows.map(r => ({ key: r.day, label: r.day.slice(0, 3), net: r.netPnl, n: r.trades }))} tipLabel={b => b.label} />
      )}
    </ACard>
  );
}
