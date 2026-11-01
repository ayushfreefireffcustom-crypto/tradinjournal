'use client';

// v6 analytics cards. Every chart measures its box (useSize) so axis labels stay
// crisp at any width; green is profit, red is loss, greys for everything else.
import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import type { AccountStats, Trade } from '@/lib/api';
import { rollingSeries } from '@/lib/stats';
import { fmtHold, fmtPct, fmtUsd, fmtUsdCompact } from '@/lib/dashboard-v6';
import { tickerMark } from '@/lib/desk';
import { SideChip } from '@/components/v6/desk';
import { ACard, Empty, Facts, MONO, Tip, ticks, useSize } from './kit';
import InfoTip from '@/components/v6/ui/info-tip';
import { METRIC_HELP } from '@/lib/metric-help';

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
      {k.map(x => <div key={x.id} data-testid={`kpi-${x.id}`}><span>{x.l}<InfoTip {...METRIC_HELP[x.h]} /></span><b className={`m ${x.c}`}>{x.v}</b><small>{x.s}</small></div>)}
    </section>
  );
}

// ─── strike rate ─────────────────────────────────────────────────────────────

export function Strike({ view }: { view: AccountStats }) {
  const total = view.totalWins + view.totalLosses;
  const w = total ? view.totalWins / total : 0;
  const R = 58, C = 2 * Math.PI * R;
  return (
    <ACard title="Strike rate" sub="wins vs losses" testId="strike-card">
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
          <div><dt><i style={{ background: 'var(--g)' }} />Wins</dt><dd className="m">{view.totalWins}</dd></div>
          <div><dt><i style={{ background: 'var(--r)' }} />Losses</dt><dd className="m">{view.totalLosses}</dd></div>
          <div className="t"><dt>Total</dt><dd className="m">{total}</dd></div>
        </dl>
      </div>
      <Facts items={[
        { l: 'Avg win', h: 'avgWinLoss', v: total ? fmtUsd(view.avgWin) : '—', c: view.avgWin ? 'pos' : '' },
        { l: 'Avg loss', v: total ? fmtUsd(-Math.abs(view.avgLoss)) : '—', c: view.avgLoss ? 'neg' : '' },
        { l: 'Best', v: total ? fmtUsd(view.bestTrade) : '—', c: tone(view.bestTrade) },
        { l: 'Worst', v: total ? fmtUsd(view.worstTrade) : '—', c: tone(view.worstTrade) },
      ]} />
    </ACard>
  );
}

// ─── P&L distribution ────────────────────────────────────────────────────────

export function Dist({ trades }: { trades: Trade[] }) {
  const pnls = trades.map(t => t.netPnl);
  if (!pnls.length) return <ACard title="P&L per trade" sub="distribution" testId="r-distribution"><Empty h={240}>No closed trades in this range.</Empty></ACard>;
  const N = 10, absMax = Math.max(...pnls.map(Math.abs), 1), width = (2 * absMax) / N;
  const buckets = Array.from({ length: N }, (_, i) => ({ lo: -absMax + i * width, hi: -absMax + (i + 1) * width, n: 0 }));
  for (const v of pnls) buckets[Math.min(N - 1, Math.max(0, Math.floor((v + absMax) / width)))]!.n++;
  const exp = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  return (
    <ACard title="P&L per trade" sub="trades per P&L range" testId="r-distribution">
      <DistChart buckets={buckets} total={pnls.length} />
      <Facts items={[
        { l: 'Expectancy', h: 'expectancy', v: fmtUsd(exp), c: tone(exp) },
        { l: 'Std dev', h: 'stdDev', v: `$${stdev(pnls).toLocaleString('en-US', { maximumFractionDigits: 0 })}` },
        { l: 'Best', v: sc(Math.max(...pnls)), c: tone(Math.max(...pnls)) },
        { l: 'Worst', v: sc(Math.min(...pnls)), c: tone(Math.min(...pnls)) },
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
              <text x={L - 8} y={Y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--axis)" style={MONO}>{v}</text>
            </g>
          ))}
          {buckets.map((b, i) => {
            const x = L + i * slot + (slot - bw) / 2, mid = (b.lo + b.hi) / 2;
            return (
              <g key={i} onPointerEnter={() => setHov(i)}>
                <rect x={L + i * slot} y={T} width={slot} height={h - B - T} fill="transparent" />
                {b.n > 0 && <rect x={x} y={Y(b.n)} width={bw} height={h - B - Y(b.n)} rx={Math.min(4, bw / 4)} fill={mid < 0 ? 'var(--r)' : 'var(--g)'} opacity={hov == null || hov === i ? 0.9 : 0.4} />}
                {b.n > 0 && <text x={x + bw / 2} y={Y(b.n) - 5} textAnchor="middle" fontSize="10.5" fill="var(--mut)" style={MONO}>{b.n}</text>}
                {(i % every === 0) && <text x={L + i * slot + slot / 2} y={h - 5} textAnchor="middle" fontSize="10.5" fill="var(--axis)" style={MONO}>{sc(mid)}</text>}
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
  return (
    <ACard title="Equity curve" sub="realised, vs starting balance" testId="dd-card"
      right={<span className="x-tag x-tag--m">Peak ${peak.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>}>
      <EquityChart pts={pts} base={view.startingBalance} />
      {view.risk && (
        <Facts items={[
          { l: 'Sharpe', h: 'sharpe', v: view.risk.sharpe == null ? '—' : view.risk.sharpe.toFixed(2) },
          { l: 'Sortino', h: 'sortino', v: view.risk.sortino == null ? '—' : view.risk.sortino.toFixed(2) },
          { l: 'CAGR', h: 'cagr', v: view.risk.cagrPct == null ? '—' : fmtPct(view.risk.cagrPct / 100), c: view.risk.cagrPct == null ? '' : tone(view.risk.cagrPct) },
          { l: 'Recovery factor', h: 'recoveryFactor', v: view.risk.recoveryFactor == null ? '—' : view.risk.recoveryFactor.toFixed(2) },
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
  const xt = Array.from({ length: nT }, (_, k) => Math.round((k / (nT - 1)) * (pts.length - 1)));
  const label = (i: number) => (pts[i]!.time ? shortDate(pts[i]!.time) : 'Start');
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
              <text x={L - 8} y={Y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--axis)" style={MONO}>{ax(v)}</text>
            </g>
          ))}
          <path d={area} fill={`url(#${uid}g)`} clipPath={`url(#${uid}a)`} />
          <path d={area} fill={`url(#${uid}r)`} clipPath={`url(#${uid}b)`} />
          <line x1={L} x2={w - R} y1={yb} y2={yb} stroke="var(--line-2)" strokeDasharray="4 4" />
          <text x={w - R} y={yb - 6} textAnchor="end" fontSize="10" fill="var(--axis)">Starting balance</text>
          <path d={line} fill="none" stroke="var(--g)" strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${uid}a)`} />
          <path d={line} fill="none" stroke="var(--r)" strokeWidth="2" strokeLinejoin="round" clipPath={`url(#${uid}b)`} />
          <text x={L} y={ddTop - 8} fontSize="10.5" fill="var(--axis)">Drawdown from peak</text>
          <line x1={L} x2={w - R} y1={ddTop} y2={ddTop} stroke="var(--grid)" />
          <line x1={L} x2={w - R} y1={ddB} y2={ddB} stroke="var(--grid)" />
          <text x={L - 8} y={ddTop + 3.5} textAnchor="end" fontSize="10.5" fill="var(--axis)" style={MONO}>0%</text>
          <text x={L - 8} y={ddB + 3.5} textAnchor="end" fontSize="10.5" fill="var(--r)" style={MONO}>−{fmtPct(mdd)}</text>
          <path d={`${ddLine} L${X(pts.length - 1)} ${ddTop} L${X(0)} ${ddTop}Z`} fill={`url(#${uid}r)`} />
          <path d={ddLine} fill="none" stroke="var(--r)" strokeWidth="1.3" strokeLinejoin="round" />
          {xt.map((i, k) => (
            <text key={k} x={X(i)} y={h - 3} fontSize="10.5" fill="var(--axis)" textAnchor={k === 0 ? 'start' : k === xt.length - 1 ? 'end' : 'middle'}>{label(i)}</text>
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

// ─── session × weekday ───────────────────────────────────────────────────────

const SESS = ['Asia', 'London', 'NY'] as const;
const WDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
const compact = (v: number) => { const a = Math.abs(v); return `${v > 0 ? '+' : v < 0 ? '−' : ''}${a >= 1000 ? `${(a / 1000).toFixed(1)}k` : Math.round(a)}`; };
const tint = (v: number, max: number) => `${Math.round(10 + Math.min(1, Math.abs(v) / max) * 40)}%`;

export function Sessions({ trades }: { trades: Trade[] }) {
  const { grid, has, max } = useMemo(() => {
    const g = SESS.map(() => WDAYS.map(() => ({ v: 0, n: 0 })));
    for (const t of trades) {
      const d = new Date(t.openTime), wd = d.getUTCDay();
      if (wd < 1 || wd > 5) continue;
      const hh = d.getUTCHours(), s = hh < 7 || hh >= 22 ? 0 : hh < 13 ? 1 : 2;
      g[s]![wd - 1]!.v += t.netPnl; g[s]![wd - 1]!.n++;
    }
    return { grid: g, has: g.flat().some(c => c.n), max: Math.max(...g.flat().map(c => Math.abs(c.v)), 1) };
  }, [trades]);
  if (!has) return <ACard title="Session × weekday" sub="UTC entry" testId="session-heatmap"><Empty h={200}>No weekday trades in this range.</Empty></ACard>;
  const totals = grid.map(r => r.reduce((s, c) => s + c.v, 0));
  let best = { s: 0, d: -1, v: -Infinity }, worst = { s: 0, d: -1, v: Infinity };
  grid.forEach((r, i) => r.forEach((c, j) => { if (!c.n) return; if (c.v > best.v) best = { s: i, d: j, v: c.v }; if (c.v < worst.v) worst = { s: i, d: j, v: c.v }; }));
  const bestSess = totals.indexOf(Math.max(...totals));
  return (
    <ACard title="Session × weekday" sub="UTC entry, net P&L" testId="session-heatmap">
      <div className="an-hm" role="table" aria-label="Net P&L by session and weekday">
        <span />{WDAYS.map(d => <span key={d} className="h">{d}</span>)}<span className="h tot">Total</span>
        {SESS.map((s, i) => (
          <Fragment key={s}>
            <span className="r">{s}</span>
            {grid[i]!.map((c, j) => (
              <div key={j} className={`c m ${c.n ? (c.v >= 0 ? 'g' : 'l') : 'z'}`} style={c.n ? { ['--p' as string]: tint(c.v, max) } : undefined}
                title={c.n ? `${s} · ${WDAYS[j]}: ${fmtUsd(c.v)} over ${plural(c.n, 'trade')}` : `${s} · ${WDAYS[j]}: no trades`}>
                {c.n ? compact(c.v) : '—'}
              </div>
            ))}
            <div className={`c m tot ${tone(totals[i]!)}`}>{compact(totals[i]!)}</div>
          </Fragment>
        ))}
      </div>
      <div className="an-hm-lg"><span>Loss</span><i className="l" /><i className="l2" /><i className="z" /><i className="g2" /><i className="g" /><span>Profit</span></div>
      <div className="an-chips">
        {totals[bestSess]! > 0 && <span className="x-tag x-tag--g">Best session · {SESS[bestSess]}</span>}
        {worst.d >= 0 && worst.v < 0 && <span className="x-tag x-tag--r">Worst · {SESS[worst.s]} {WDAYS[worst.d]}</span>}
        {best.d >= 0 && best.v > 0 && <span className="x-tag">Best cell · {SESS[best.s]} {WDAYS[best.d]} <span className="m">{sc(best.v)}</span></span>}
      </div>
    </ACard>
  );
}

// ─── rolling edge ────────────────────────────────────────────────────────────

export function Rolling({ trades }: { trades: Trade[] }) {
  const [m, setM] = useState<'win' | 'exp'>('win');
  const n = trades.length;
  const win = n >= 40 ? 20 : Math.max(5, Math.floor(n / 3));
  const series = useMemo(() => rollingSeries(trades, win), [trades, win]);
  const seg = (
    <div className="x-seg x-seg--sm" role="group" aria-label="Rolling metric">
      <button aria-pressed={m === 'win'} onClick={() => setM('win')}>Win rate</button>
      <button aria-pressed={m === 'exp'} onClick={() => setM('exp')}>Expectancy</button>
    </div>
  );
  return (
    <ACard title="Rolling edge" sub={`${win}-trade window`} right={seg} testId="rolling-card">
      {n < 10 ? <Empty h={240}><b>Needs 10+ closed trades</b>You have {n} in this range.</Empty> : (
        <SplitLine key={m} vals={series.map(p => (m === 'win' ? p.winRate * 100 : p.expectancy))} base={m === 'win' ? 50 : 0}
          axis={v => (m === 'win' ? `${Math.round(v)}%` : ax(v))}
          tip={(v, i) => <><span>Trade {series[i]!.i} · last {win}</span><b className={`m ${v >= (m === 'win' ? 50 : 0) ? 'pos' : 'neg'}`}>{m === 'win' ? `${v.toFixed(0)}% won` : `${fmtUsd(v)} / trade`}</b></>}
          xLabel={i => `#${series[i]!.i}`} baseLabel={m === 'win' ? '50% win rate' : 'Break-even'} />
      )}
    </ACard>
  );
}

/** Line with the area to a baseline: green above it, red below it. */
function SplitLine({ vals, base, axis, tip, xLabel, baseLabel }: {
  vals: number[]; base: number; axis: (v: number) => string; tip: (v: number, i: number) => ReactNode; xLabel: (i: number) => string; baseLabel: string;
}) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hov, setHov] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  if (vals.length < 2) return <div className="an-chart" ref={ref}><Empty>Not enough trades to draw yet.</Empty></div>;
  const L = 48, R = 8, T = 10, B = 22;
  const yt = ticks(Math.min(...vals, base), Math.max(...vals, base), 4);
  const mn = yt[0]!, mx = yt[yt.length - 1]!;
  const X = (i: number) => L + (i / (vals.length - 1)) * (w - L - R);
  const Y = (v: number) => h - B - ((v - mn) / (mx - mn)) * (h - B - T);
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const yb = Y(base);
  const area = `${line} L${X(vals.length - 1).toFixed(1)} ${yb.toFixed(1)} L${X(0).toFixed(1)} ${yb.toFixed(1)}Z`;
  const nT = w > 520 ? 5 : 3;
  const xt = Array.from({ length: nT }, (_, k) => Math.round((k / (nT - 1)) * (vals.length - 1)));
  const onMove = (e: React.PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - L) / (w - L - R)) * (vals.length - 1));
    setHov(i >= 0 && i < vals.length ? i : null);
  };
  return (
    <div className="an-chart" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHov(null)}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Rolling metric over time; dashed line marks ${baseLabel}`}>
          <defs>
            <clipPath id={`${uid}a`}><rect x={0} y={0} width={w} height={Math.max(0, yb)} /></clipPath>
            <clipPath id={`${uid}b`}><rect x={0} y={yb} width={w} height={Math.max(0, h - yb)} /></clipPath>
          </defs>
          {yt.map(v => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" />
              <text x={L - 8} y={Y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--axis)" style={MONO}>{axis(v)}</text>
            </g>
          ))}
          <path d={area} fill="var(--g)" fillOpacity=".14" clipPath={`url(#${uid}a)`} />
          <path d={area} fill="var(--r)" fillOpacity=".14" clipPath={`url(#${uid}b)`} />
          <line x1={L} x2={w - R} y1={yb} y2={yb} stroke="var(--line-2)" strokeDasharray="4 4" />
          <path d={line} fill="none" stroke="var(--g)" strokeWidth="1.8" strokeLinejoin="round" clipPath={`url(#${uid}a)`} />
          <path d={line} fill="none" stroke="var(--r)" strokeWidth="1.8" strokeLinejoin="round" clipPath={`url(#${uid}b)`} />
          {xt.map((i, k) => (
            <text key={k} x={X(i)} y={h - 4} fontSize="10.5" fill="var(--axis)" style={MONO} textAnchor={k === 0 ? 'start' : k === xt.length - 1 ? 'end' : 'middle'}>{xLabel(i)}</text>
          ))}
          {hov != null && (
            <g pointerEvents="none">
              <line x1={X(hov)} x2={X(hov)} y1={T} y2={h - B} stroke="var(--axis)" strokeOpacity=".6" strokeDasharray="3 3" />
              <circle cx={X(hov)} cy={Y(vals[hov]!)} r="4" fill="var(--s1)" stroke={vals[hov]! >= base ? 'var(--g)' : 'var(--r)'} strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
      {hov != null && <Tip x={X(hov)} y={Math.max(0, Y(vals[hov]!) - 56)} w={w}>{tip(vals[hov]!, hov)}</Tip>}
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
                <td className="n"><span className={`x-tag x-tag--m ${s.winRate >= 0.5 ? 'x-tag--g' : 'x-tag--r'}`}>{fmtPct(s.winRate, 0)}</span></td>
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

function Caret() {
  return <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>;
}

// ─── diverging bars (emotion / tag / direction) ──────────────────────────────

export interface Group { label: string; trades: number; wins: number; netPnl: number }

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

export function GroupBars({ title, sub, rows, empty, testId, order }: { title: string; sub: string; rows: Group[]; empty: string; testId?: string; order?: string[] }) {
  const list = order ? [...rows].sort((a, b) => (order.indexOf(a.label) + 1 || 99) - (order.indexOf(b.label) + 1 || 99)) : rows;
  return (
    <ACard title={title} sub={sub} testId={testId}>
      {rows.length === 0 ? <Empty h={200}>{empty}</Empty> : (
        <Diverging rows={list.map(r => ({
          key: r.label, label: r.label, net: r.netPnl,
          sub: `${plural(r.trades, 'trade')} · ${fmtPct(r.wins / r.trades, 0)} won`,
          title: `${r.label}: ${fmtUsd(r.netPnl)} over ${plural(r.trades, 'trade')}`,
        }))} />
      )}
    </ACard>
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
              <text x={L - 8} y={Y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--axis)" style={MONO}>{ax(v)}</text>
            </g>
          ))}
          {bars.map((b, i) => {
            const x = L + i * slot + (slot - bw) / 2;
            const bh = b.net ? Math.max(2, Math.abs(Y(b.net) - y0)) : 0;
            return (
              <g key={b.key} onPointerEnter={() => setHov(i)}>
                <rect x={L + i * slot} y={T} width={slot} height={h - B - T + (values ? 20 : 0)} fill="transparent" />
                {bh > 0 && <rect x={x} y={b.net >= 0 ? y0 - bh : y0} width={bw} height={bh} rx={Math.min(4, bw / 4)} fill={b.net >= 0 ? 'var(--g)' : 'var(--r)'} opacity={hov == null || hov === i ? 0.92 : 0.4} />}
                {(i % labelEvery === 0) && <text x={x + bw / 2} y={h - (values ? 22 : 5)} textAnchor="middle" fontSize="10.5" fill="var(--axis)" style={values ? undefined : MONO}>{b.label}</text>}
                {values && <text x={x + bw / 2} y={h - 5} textAnchor="middle" fontSize="10.5" fill={b.net > 0 ? 'var(--g)' : b.net < 0 ? 'var(--r)' : 'var(--dim)'} style={MONO}>{!b.n ? '—' : slot < 46 && b.net > 0 ? compact(b.net).slice(1) : compact(b.net)}</text>}
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
  for (const t of trades) { const x = new Date(t.openTime).getUTCHours(); net[x] = net[x]! + t.netPnl; cnt[x] = cnt[x]! + 1; }
  const best = net.indexOf(Math.max(...net)), worst = net.indexOf(Math.min(...net)), busy = cnt.indexOf(Math.max(...cnt));
  const hh = (x: number) => `${String(x).padStart(2, '0')}:00`;
  const bars = net.map((v, i) => ({ key: String(i), label: String(i).padStart(2, '0'), net: v, n: cnt[i]! }));
  return (
    <ACard title="Hour of day" sub="UTC entry hour" testId="time-of-day">
      {!trades.length ? <Empty h={220}>No closed trades in this range.</Empty> : <VBars bars={bars} labelEvery={3} tipLabel={b => `${hh(Number(b.key))}–${hh((Number(b.key) + 1) % 24)} UTC`} />}
      <Facts items={[
        { l: 'Best hour', v: net[best]! > 0 ? hh(best) : '—', c: net[best]! > 0 ? 'pos' : '' },
        { l: 'Worst hour', v: net[worst]! < 0 ? hh(worst) : '—', c: net[worst]! < 0 ? 'neg' : '' },
        { l: 'Most active', v: cnt[busy] ? hh(busy) : '—' },
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

// ─── P&L vs hold time ────────────────────────────────────────────────────────

export function Scatter({ trades }: { trades: Trade[] }) {
  const pts = trades.filter(t => t.durationSecs != null);
  return (
    <ACard title="P&L vs hold time" sub="each dot is a trade, sized by volume" testId="scatter-card">
      {pts.length < 2 ? <Empty h={260}>Not enough closed trades.</Empty> : <ScatterChart pts={pts} />}
    </ACard>
  );
}

function ScatterChart({ pts }: { pts: Trade[] }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hov, setHov] = useState<number | null>(null);
  const L = 54, R = 12, T = 10, B = 24;
  const lx = (s: number) => Math.log10(Math.max(s, 30));
  const x0 = lx(Math.min(...pts.map(t => t.durationSecs!))), x1 = Math.max(lx(Math.max(...pts.map(t => t.durationSecs!))), x0 + 1);
  const ym = Math.max(...pts.map(t => Math.abs(t.netPnl)), 1);
  const yt = ticks(-ym, ym, 4);
  const mn = yt[0]!, mx = yt[yt.length - 1]!;
  const X = (s: number) => L + ((lx(s) - x0) / (x1 - x0)) * (w - L - R);
  const Y = (v: number) => h - B - ((v - mn) / (mx - mn)) * (h - B - T);
  const xt = [60, 300, 900, 1800, 3600, 2 * 3600, 4 * 3600, 8 * 3600, 86400, 3 * 86400, 7 * 86400].filter(s => lx(s) >= x0 && lx(s) <= x1);
  const minGap = 46;
  const shownX = xt.filter((s, i, a) => i === 0 || X(s) - X(a[i - 1]!) >= minGap);
  const ht = hov != null ? pts[hov] : null;
  // Nearest dot within reach, so small dots are easy to hit with a mouse or a finger.
  const onMove = (e: React.PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mx0 = e.clientX - box.left, my0 = e.clientY - box.top;
    let best = -1, bd = 24 * 24;
    pts.forEach((t, i) => { const dx = X(t.durationSecs!) - mx0, dy = Y(t.netPnl) - my0, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } });
    setHov(best >= 0 ? best : null);
  };
  return (
    <div className="an-chart an-chart--sc" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHov(null)}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} role="img" aria-label={`${pts.length} trades plotted by hold time and P&L`}>
          {yt.map(v => (
            <g key={v}>
              <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke={v === 0 ? 'var(--line-2)' : 'var(--grid)'} />
              <text x={L - 8} y={Y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--axis)" style={MONO}>{ax(v)}</text>
            </g>
          ))}
          {shownX.map(s => (
            <g key={s}>
              <line x1={X(s)} x2={X(s)} y1={T} y2={h - B} stroke="var(--grid)" />
              <text x={X(s)} y={h - 5} textAnchor="middle" fontSize="10.5" fill="var(--axis)" style={MONO}>{fmtHold(s)}</text>
            </g>
          ))}
          {pts.map((t, i) => (
            <circle key={t.positionId} cx={X(t.durationSecs!)} cy={Y(t.netPnl)} r={3.5 + Math.min(t.volume, 3) * 1.3}
              fill={t.netPnl >= 0 ? 'var(--g)' : 'var(--r)'} fillOpacity={hov == null ? 0.6 : hov === i ? 1 : 0.25}
              stroke={hov === i ? 'var(--tx)' : 'none'} strokeWidth="1.5" />
          ))}
        </svg>
      )}
      {ht && (
        <Tip x={X(ht.durationSecs!)} y={Math.max(0, Y(ht.netPnl) - 60)} w={w}>
          <span>{ht.symbol} · {ht.direction === 'LONG' ? 'Long' : 'Short'} · {ht.volume.toFixed(2)} lots</span>
          <b className={`m ${tone(ht.netPnl)}`}>{fmtUsd(ht.netPnl)}</b>
          <span>Held {fmtHold(ht.durationSecs)}</span>
        </Tip>
      )}
    </div>
  );
}
