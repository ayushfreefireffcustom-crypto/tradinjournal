'use client';

// "Desk" dashboard cards: equity + drawdown, KPI column, daily P&L, breakdown by
// symbol/session/weekday, recent trades grouped by day, and the coach review.
// Charts measure their container so labels stay crisp at every width.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, type AccountStats, type AiReport, type JournalEntry, type Trade } from '@/lib/api';
import { rollingSeries } from '@/lib/stats';
import { fmtHold, fmtPct, fmtUsd, fmtUsdCompact } from '@/lib/dashboard-v6';
import {
  breakdown, dayBuckets, dayLabel, dayStats, fmtPrice, groupByDay, leakiest, marketKind, notesByTrade, tickerMark, withDrawdown,
  type BreakdownBy, type DayBucket,
} from '@/lib/desk';
import MarkdownMessage from '@/components/coach/markdown-message';
import { IChevronDown, ISync } from '@/components/v3/icons';
import '@/styles/v6/desk.css';
import InfoTip from '@/components/v6/ui/info-tip';
import { METRIC_HELP, type MetricKey } from '@/lib/metric-help';

const MONO = { fontFamily: 'var(--mono)' } as const;

/** Track an element's content-box size. */
function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e!.contentRect;
      setSize(s => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

const shortDate = (d: Date | string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export function SideChip({ dir }: { dir: Trade['direction'] }) {
  const long = dir === 'LONG';
  return (
    <span className={`x-side ${long ? 'x-side--long' : 'x-side--short'}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {long ? <path d="M7 17 17 7M9 7h8v8" /> : <path d="M7 7l10 10M17 9v8H9" />}
      </svg>
      {long ? 'Long' : 'Short'}
    </span>
  );
}

// ─── net P&L + equity ────────────────────────────────────────────────────────

export function EquityCard({ view, trades, rangeLabel }: { view: AccountStats; trades: Trade[]; rangeLabel: string }) {
  const pts = useMemo(() => withDrawdown(view.equityCurve), [view.equityCurve]);
  const days = useMemo(() => dayBuckets(trades), [trades]);
  const start = pts[0]?.equity ?? view.startingBalance;
  const pct = start > 0 ? view.netPnl / start : null;
  const best = days.length ? Math.max(...days.map(d => d.pnl)) : null;
  const worst = days.length ? Math.min(...days.map(d => d.pnl)) : null;
  return (
    <section className="x-card dk-eq" data-testid="dash-equity">
      <div className="x-ch"><h2>Net P&amp;L</h2><span className="x-sub">{rangeLabel.toLowerCase()}</span></div>
      <div className="dk-big">
        <b className={view.netPnl < 0 ? 'neg' : ''} data-testid="net-pnl">{fmtUsd(view.netPnl)}</b>
        {pct != null && view.totalTrades > 0 && <span className={`x-tag x-tag--m ${view.netPnl >= 0 ? 'x-tag--g' : 'x-tag--r'}`}>{view.netPnl >= 0 ? '+' : '−'}{fmtPct(Math.abs(pct))}</span>}
      </div>
      <div className="dk-meta">
        <span>Balance <b className="m">${view.currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b></span>
        <span>Trades <b className="m">{view.totalTrades}</b></span>
        {best != null && <span>Best day <b className={`m ${best > 0 ? 'pos' : ''}`}>{fmtUsd(best, 0)}</b></span>}
        {worst != null && <span>Worst day <b className={`m ${worst < 0 ? 'neg' : ''}`}>{fmtUsd(worst, 0)}</b></span>}
      </div>
      <EquityChart pts={pts} />
    </section>
  );
}

function EquityChart({ pts }: { pts: ReturnType<typeof withDrawdown> }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (pts.length < 2) {
    return <div className="dk-eq-chart dk-chart-empty" ref={ref}>Your equity curve draws itself after the first closed trade in this range.</div>;
  }
  const R = 46, L = 2, T = 10, gap = 18;
  const ddH = Math.max(36, Math.round(h * 0.2));
  const eqB = h - ddH - gap - 18;
  const ddTop = eqB + gap, ddB = h - 18;
  const vs = pts.map(p => p.equity);
  let mn = Math.min(...vs), mx = Math.max(...vs);
  if (mx - mn < 1) { mn -= 1; mx += 1; }
  const mdd = Math.max(...pts.map(p => p.dd), 0.0001);
  const X = (i: number) => L + (i / (pts.length - 1)) * (w - L - R);
  const Y = (v: number) => eqB - ((v - mn) / (mx - mn)) * (eqB - T);
  const Yd = (d: number) => ddTop + (d / mdd) * (ddB - ddTop);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.equity).toFixed(1)}`).join(' ');
  const ddLine = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Yd(p.dd).toFixed(1)}`).join(' ');
  const hp = hover != null ? pts[hover] : null;
  const ticks = w > 520 ? [0, 0.25, 0.5, 0.75, 1] : [0, 0.5, 1];
  const onMove = (e: React.PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left - L) / (w - L - R)) * (pts.length - 1));
    setHover(i >= 0 && i < pts.length ? i : null);
  };
  return (
    <div className="dk-eq-chart" ref={ref} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Equity from ${fmtUsdCompact(pts[0]!.equity)} to ${fmtUsdCompact(pts[pts.length - 1]!.equity)}, max drawdown ${fmtPct(mdd)}`}>
          <defs>
            <linearGradient id="dk-eq-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--g)" stopOpacity=".24" /><stop offset="1" stopColor="var(--g)" stopOpacity="0" /></linearGradient>
            <linearGradient id="dk-dd-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--r)" stopOpacity=".04" /><stop offset="1" stopColor="var(--r)" stopOpacity=".3" /></linearGradient>
          </defs>
          {[0, 1 / 3, 2 / 3, 1].map(f => {
            const v = mn + (mx - mn) * f;
            return (
              <g key={f}>
                <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="var(--grid)" />
                <text x={w - R + 8} y={Y(v) + 3.5} fontSize="10.5" fill="var(--axis)" style={MONO}>{fmtUsdCompact(v)}</text>
              </g>
            );
          })}
          <path d={`${line} L${X(pts.length - 1)} ${eqB} L${X(0)} ${eqB}Z`} fill="url(#dk-eq-g)" />
          <path d={line} fill="none" stroke="var(--g)" strokeWidth="2" strokeLinejoin="round" />
          <line x1={L} x2={w - R} y1={ddTop} y2={ddTop} stroke="var(--grid)" />
          <text x={L} y={ddTop - 5} fontSize="10.5" fill="var(--axis)">Drawdown</text>
          <path d={`${ddLine} L${X(pts.length - 1)} ${ddTop} L${X(0)} ${ddTop}Z`} fill="url(#dk-dd-g)" />
          <path d={ddLine} fill="none" stroke="var(--r)" strokeWidth="1.2" strokeLinejoin="round" />
          <text x={w - R + 8} y={ddTop + 4} fontSize="10.5" fill="var(--axis)" style={MONO}>0%</text>
          <text x={w - R + 8} y={ddB} fontSize="10.5" fill="var(--r)" style={MONO}>−{fmtPct(mdd)}</text>
          {ticks.map((f, k) => {
            const i = Math.round(f * (pts.length - 1));
            return <text key={k} x={X(i)} y={h - 2} fontSize="10.5" fill="var(--axis)" textAnchor={k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}>{shortDate(pts[i]!.time)}</text>;
          })}
          {hp && hover != null ? (
            <g>
              <line x1={X(hover)} x2={X(hover)} y1={T} y2={ddB} stroke="var(--axis)" strokeOpacity=".6" strokeDasharray="3 3" />
              <circle cx={X(hover)} cy={Y(hp.equity)} r="4.5" fill="var(--s1)" stroke="var(--g)" strokeWidth="2" />
            </g>
          ) : <circle cx={X(pts.length - 1)} cy={Y(pts[pts.length - 1]!.equity)} r="3.5" fill="var(--g)" />}
        </svg>
      )}
      {hp && hover != null && (
        <div className="dk-tip" style={{ left: Math.min(Math.max(X(hover) + 12, 0), w - 150), top: Math.max(0, Y(hp.equity) - 58) }}>
          <span>{shortDate(hp.time)}</span>
          <b className="m">${hp.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          {hp.dd > 0 && <span className="m neg">−{fmtPct(hp.dd)} from peak</span>}
        </div>
      )}
    </div>
  );
}

// ─── KPI column ──────────────────────────────────────────────────────────────

/** ⓘ with the shared explanation of a metric (QW.8). */
function Help({ k }: { k: MetricKey }) {
  return <InfoTip {...METRIC_HELP[k]} />;
}

export function KpiColumn({ view, trades }: { view: AccountStats; trades: Trade[] }) {
  const n = view.totalTrades;
  const pfInf = view.profitFactor >= 999;
  const rr = view.avgLoss !== 0 ? view.avgWin / Math.abs(view.avgLoss) : null;
  const exp = n ? view.netPnl / n : null;
  const roll = useMemo(() => rollingSeries(trades, Math.min(20, Math.max(5, Math.floor(trades.length / 4)))), [trades]);
  return (
    <div className="dk-kpis" data-testid="dash-kpis">
      <div className="x-card dk-kpi">
        <div className="x-stat"><span>Win rate<Help k="winRate" /></span><b>{n ? fmtPct(view.winRate) : '—'}</b><small>{n ? `${view.totalWins} won · ${view.totalLosses} lost` : 'No closed trades'}</small></div>
        <Ring value={n ? view.winRate : 0} />
      </div>
      <div className="x-card dk-kpi">
        <div className="x-stat"><span>Profit factor<Help k="profitFactor" /></span><b>{!n ? '—' : pfInf ? '∞' : view.profitFactor.toFixed(2)}</b><small>{pfInf ? 'No losing trades yet' : 'Gross win ÷ gross loss'}</small></div>
        <Gauge value={!n ? 0 : pfInf ? 1 : Math.min(view.profitFactor / 3, 1)} />
      </div>
      <div className="x-card dk-kpi">
        <div className="x-stat"><span>Avg win / loss<Help k="avgWinLoss" /></span><b>{rr == null ? '—' : `1 : ${rr.toFixed(2)}`}</b><small>Reward to risk</small></div>
        <div className="dk-wl" aria-hidden>
          {(() => {
            const m = Math.max(view.avgWin, Math.abs(view.avgLoss), 1);
            return (
              <>
                <div><i style={{ width: `${(view.avgWin / m) * 100}%`, background: 'var(--g)' }} /><span className="m">{fmtUsdCompact(view.avgWin)}</span></div>
                <div><i style={{ width: `${(Math.abs(view.avgLoss) / m) * 100}%`, background: 'var(--r)' }} /><span className="m">{fmtUsdCompact(view.avgLoss)}</span></div>
              </>
            );
          })()}
        </div>
      </div>
      <div className="x-card dk-kpi">
        <div className="x-stat"><span>Expectancy<Help k="expectancy" /></span><b className={exp == null ? '' : exp >= 0 ? 'pos' : 'neg'}>{exp == null ? '—' : `${fmtUsd(exp, 0)}`}<em> / trade</em></b><small>Max drawdown {n ? fmtPct(view.maxDrawdownPct) : '—'}</small></div>
        {roll.length > 2 && <Spark vals={roll.map(r => r.expectancy)} />}
      </div>
    </div>
  );
}

function Ring({ value }: { value: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--track)" strokeWidth="7" />
      {value > 0 && <circle cx="32" cy="32" r={r} fill="none" stroke="var(--g)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 32 32)" />}
    </svg>
  );
}
function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const a = Math.PI * (1 - v), x = 44 + 36 * Math.cos(a), y = 46 - 36 * Math.sin(a);
  return (
    <svg width="88" height="52" viewBox="0 0 88 52" aria-hidden>
      <path d="M8 46 A36 36 0 0 1 80 46" fill="none" stroke="var(--track)" strokeWidth="7" strokeLinecap="round" />
      {v > 0.005 && <path d={`M8 46 A36 36 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} fill="none" stroke="var(--g)" strokeWidth="7" strokeLinecap="round" />}
    </svg>
  );
}
function Spark({ vals }: { vals: number[] }) {
  const mn = Math.min(0, ...vals), mx = Math.max(0, ...vals), span = mx - mn || 1;
  const Y = (v: number) => 36 - ((v - mn) / span) * 32;
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${((i / (vals.length - 1)) * 94 + 1).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  return (
    <svg width="96" height="40" viewBox="0 0 96 40" aria-hidden className="dk-spark">
      <line x1="0" x2="96" y1={Y(0)} y2={Y(0)} stroke="var(--grid)" />
      <path d={d} fill="none" stroke={vals[vals.length - 1]! >= 0 ? 'var(--g)' : 'var(--r)'} strokeWidth="1.6" />
    </svg>
  );
}

// ─── daily P&L ───────────────────────────────────────────────────────────────

export function DailyCard({ trades }: { trades: Trade[] }) {
  const days = useMemo(() => dayBuckets(trades).slice(-30), [trades]);
  const st = useMemo(() => dayStats(days), [days]);
  return (
    <section className="x-card dk-daily" data-testid="dash-daily">
      <div className="x-ch">
        <h2>Daily P&amp;L</h2><span className="x-sub">last {days.length} trading day{days.length === 1 ? '' : 's'}</span>
        <div className="x-r">
          <span className="dk-legend"><span><i style={{ background: 'var(--g)' }} />Day</span><span><i className="ln" />Running total</span></span>
          {days.length > 0 && <span><b className="m pos">{st.green}</b> green · <b className="m neg">{st.red}</b> red</span>}
        </div>
      </div>
      <DailyChart days={days} />
      <div className="x-strip dk-dstats">
        <div><span>Avg green day<Help k="avgGreenDay" /></span><b className="m pos">{st.avgGreen == null ? '—' : fmtUsd(st.avgGreen, 0)}</b></div>
        <div><span>Avg red day<Help k="avgRedDay" /></span><b className="m neg">{st.avgRed == null ? '—' : fmtUsd(st.avgRed, 0)}</b></div>
        <div><span>Best green streak<Help k="bestStreak" /></span><b>{st.bestStreak ? `${st.bestStreak} day${st.bestStreak === 1 ? '' : 's'}` : '—'}</b></div>
        <div><span>Trades per day<Help k="tradesPerDay" /></span><b>{st.perDay == null ? '—' : st.perDay.toFixed(1)}</b></div>
      </div>
    </section>
  );
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

function DailyChart({ days }: { days: DayBucket[] }) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!days.length) return <div className="dk-daily-chart dk-chart-empty" ref={ref}>No closed trades in this range.</div>;
  const L = 48, R = 8, T = 10, B = 22;
  // Gains and losses get their own scale so small losses don't leave half the chart empty.
  const posMax = Math.max(0, ...days.map(d => d.pnl));
  const negMax = Math.max(0, ...days.map(d => -d.pnl));
  const top = niceMax(Math.max(posMax, negMax * 0.25, 1));
  const bot = negMax > 0 ? niceMax(Math.max(negMax, top * 0.25)) : top * 0.25;
  const plotH = h - B - T;
  const mid = T + plotH * (top / (top + bot));
  const yOf = (v: number) => (v >= 0 ? mid - (v / top) * (mid - T) : mid + (-v / bot) * (h - B - mid));
  const slot = (w - L - R) / days.length, bw = Math.max(2, Math.min(slot * 0.64, 26));
  const bx = (i: number) => L + i * slot + (slot - bw) / 2;
  let run = 0;
  const runs = days.map(d => (run += d.pnl));
  const rMax = Math.max(...runs.map(Math.abs), 1);
  const rY = (v: number) => (v >= 0 ? mid - (v / rMax) * (mid - T) * 0.94 : mid + (-v / rMax) * (h - B - mid) * 0.94);
  const every = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(w / 90))));
  // Date labels every `every` days plus the last one; drop any that would touch a neighbour.
  const labels = (() => {
    const last = days.length - 1;
    const span = (i: number): [number, number] => {
      const x = bx(i) + bw / 2, tw = shortDate(days[i]!.date).length * 6 + 2;
      return i === 0 ? [x, x + tw] : i === last ? [x - tw, x] : [x - tw / 2, x + tw / 2];
    };
    const keep: number[] = [];
    for (let i = 0; i < last; i += every) if (!keep.length || span(i)[0] > span(keep[keep.length - 1]!)[1] + 10) keep.push(i);
    while (keep.length && span(keep[keep.length - 1]!)[1] + 10 > span(last)[0]) keep.pop();
    return new Set([...keep, last]);
  })();
  const hd = hover != null ? days[hover] : null;
  return (
    <div className="dk-daily-chart" ref={ref} onPointerLeave={() => setHover(null)}>
      {w > 0 && h > 0 && (
        <svg width={w} height={h} role="img" aria-label={`Daily P&L for the last ${days.length} trading days`}>
          {[top, top / 2, 0, -bot / 2, -bot].map((v, k) => (
            <g key={k}>
              <line x1={L} x2={w - R} y1={yOf(v)} y2={yOf(v)} stroke={v === 0 ? 'var(--line-2)' : 'var(--grid)'} strokeDasharray={k === 1 || k === 3 ? '2 4' : undefined} />
              <text x={L - 8} y={yOf(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--axis)" style={MONO}>{v === 0 ? '$0' : fmtUsdCompact(v)}</text>
            </g>
          ))}
          {days.map((d, i) => {
            const bh = Math.max(1.5, Math.abs(yOf(d.pnl) - mid));
            return (
              <g key={d.key} onPointerEnter={() => setHover(i)}>
                <rect x={L + i * slot} y={T} width={slot} height={h - B - T} fill="transparent" />
                <rect x={bx(i)} y={d.pnl >= 0 ? mid - bh : mid} width={bw} height={bh} rx={Math.min(3, bw / 3)} fill={d.pnl >= 0 ? 'var(--g)' : 'var(--r)'} opacity={hover == null || hover === i ? 0.92 : 0.45} />
              </g>
            );
          })}
          <path d={runs.map((v, i) => `${i ? 'L' : 'M'}${(bx(i) + bw / 2).toFixed(1)} ${rY(v).toFixed(1)}`).join(' ')} fill="none" stroke="var(--tx)" strokeOpacity=".7" strokeWidth="1.5" strokeLinejoin="round" pointerEvents="none" />
          <circle cx={bx(days.length - 1) + bw / 2} cy={rY(runs[runs.length - 1]!)} r="3.5" fill="var(--tx)" pointerEvents="none" />
          {hover == null && (
            <text x={Math.max(L + 40, bx(days.length - 1) + bw / 2 - 8)} y={Math.max(12, rY(runs[runs.length - 1]!) - 9)} textAnchor="end" fontSize="10.5" fill="var(--tx)" style={MONO} pointerEvents="none">{fmtUsd(runs[runs.length - 1]!, 0)}</text>
          )}
          {days.map((d, i) => labels.has(i) ? (
            <text key={d.key} x={bx(i) + bw / 2} y={h - 5} fontSize="10.5" fill="var(--axis)" textAnchor={i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'}>{shortDate(d.date)}</text>
          ) : null)}
        </svg>
      )}
      {hd && hover != null && (
        <div className="dk-tip" style={{ left: Math.min(Math.max(bx(hover) + bw + 8, 0), w - 150), top: 6 }}>
          <span>{dayLabel(hd.date)}</span>
          <b className={`m ${hd.pnl >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(hd.pnl)}</b>
          <span>{hd.n} trade{hd.n === 1 ? '' : 's'} · running {fmtUsd(runs[hover]!, 0)}</span>
        </div>
      )}
    </div>
  );
}

// ─── breakdown ───────────────────────────────────────────────────────────────

const BD_TABS: { key: BreakdownBy; label: string }[] = [{ key: 'symbol', label: 'Symbol' }, { key: 'session', label: 'Session' }, { key: 'weekday', label: 'Weekday' }];
const SESSION_MARK: Record<string, string> = { Asia: 'AS', London: 'LDN', 'New York': 'NY' };

export function BreakdownCard({ trades }: { trades: Trade[] }) {
  const [by, setBy] = useState<BreakdownBy>('symbol');
  const rows = useMemo(() => breakdown(trades, by), [trades, by]);
  const shown = rows.slice(0, 6);
  const leak = useMemo(() => leakiest(rows), [rows]);
  const max = Math.max(1, ...shown.map(r => r.gw + r.gl));
  const label = BD_TABS.find(t => t.key === by)!.label;
  return (
    <section className="x-card dk-bd" data-testid="dash-breakdown">
      <div className="x-ch">
        <h2>Breakdown</h2>
        <div className="x-r">
          <div className="x-seg x-seg--sm" role="tablist" aria-label="Break down by">
            {BD_TABS.map(t => <button key={t.key} role="tab" aria-selected={by === t.key} onClick={() => setBy(t.key)} data-testid={`bd-${t.key}`}>{t.label}</button>)}
          </div>
        </div>
      </div>
      {shown.length === 0 ? <div className="x-empty"><p>No closed trades in this range.</p></div> : (
        <>
          <div className="dk-bd-head"><span>{label}</span><span>Won vs given back</span><span>Net</span></div>
          <div className="dk-bd-rows">
            {shown.map(r => {
              const net = r.gw - r.gl;
              const mark = by === 'symbol' ? tickerMark(r.key) : by === 'session' ? SESSION_MARK[r.key] ?? r.key.slice(0, 3) : r.key.slice(0, 3);
              return (
                <div className="dk-bd-row" key={r.key}>
                  <div className="x-sym">
                    <span className="x-mk">{mark}</span>
                    <div style={{ minWidth: 0 }}>
                      <b>{r.key}{by === 'session' && <span className="x-dim"> · UTC</span>}</b>
                      <small className="dk-ell">{r.kind && <span className="dk-bd-kind">{r.kind} · </span>}{r.n} trade{r.n === 1 ? '' : 's'} · {fmtPct(r.wins / r.n, 0)} won</small>
                    </div>
                  </div>
                  <div className="dk-gl-wrap" aria-label={`Won ${fmtUsd(r.gw, 0)}, gave back ${fmtUsd(-r.gl, 0)}`}>
                    <div className="dk-gl-box" style={{ width: `${((r.gw + r.gl) / max) * 100}%` }}>
                      <div className="dk-gl">{r.gw > 0 && <i style={{ flex: r.gw, background: 'var(--g)' }} />}{r.gl > 0 && <i style={{ flex: r.gl, background: 'var(--r)' }} />}</div>
                      <div className="dk-gl-l m"><span>{fmtUsdCompact(r.gw)}</span><span>{r.gl ? fmtUsdCompact(-r.gl) : ''}</span></div>
                    </div>
                  </div>
                  <div className="dk-bd-net">
                    <b className={`m ${net >= 0 ? 'pos' : 'neg'}`}>{fmtUsdCompact(net)}</b>
                    <small>{r.gw > 0 ? `${fmtPct(r.gl / r.gw, 0)} given back` : 'no wins'}</small>
                  </div>
                </div>
              );
            })}
          </div>
          {leak && leak.gl > 0 && (
            <p className="dk-callout"><i aria-hidden /><span><b>{leak.key}</b> gives back {fmtPct(leak.gl / leak.gw, 0)} of what it wins, the most of any {label.toLowerCase()}.{by === 'symbol' ? ' Check stop placement there before sizing up.' : ' Consider trading it smaller.'}</span></p>
          )}
        </>
      )}
    </section>
  );
}

// ─── recent trades ───────────────────────────────────────────────────────────

type TradeFilter = 'all' | 'win' | 'loss' | 'nonote';
const FILTERS: { key: TradeFilter; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'win', label: 'Wins' }, { key: 'loss', label: 'Losses' }, { key: 'nonote', label: 'No note' }];

export function RecentTrades({ trades, journal, balance }: { trades: Trade[]; journal: JournalEntry[]; balance: number }) {
  const router = useRouter();
  const [f, setF] = useState<TradeFilter>('all');
  const notes = useMemo(() => notesByTrade(journal), [journal]);
  const days = useMemo(() => dayBuckets(trades), [trades]);
  const dayTotal = useMemo(() => new Map(days.map(d => [d.key, d])), [days]);
  const filtered = useMemo(() => {
    const sorted = [...trades].sort((a, b) => +new Date(b.closeTime!) - +new Date(a.closeTime!));
    const keep = sorted.filter(t => f === 'all' || (f === 'win' ? t.netPnl > 0 : f === 'loss' ? t.netPnl <= 0 : !notes.get(t.positionId)?.noted));
    return keep.slice(0, 8);
  }, [trades, f, notes]);
  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const maxHold = Math.max(1, ...trades.map(t => t.durationSecs ?? 0));
  const noted = trades.filter(t => notes.get(t.positionId)?.noted).length;
  const open = (t: Trade) => router.push(`/trades/${encodeURIComponent(t.positionId)}`);

  const journalCell = (t: Trade) => {
    const n = notes.get(t.positionId);
    if (n?.noted) {
      return n.tags.length
        ? <span className="dk-tags">{n.tags.slice(0, 2).map(x => <span key={x.label} className={`x-tag ${x.tone === 'g' ? 'x-tag--g' : x.tone === 'r' ? 'x-tag--r' : ''}`}>{x.label}</span>)}{n.tags.length > 2 && <span className="x-dim">+{n.tags.length - 2}</span>}</span>
        : <span className="dk-noted">Noted</span>;
    }
    return <Link className="x-btn x-btn--dash x-btn--sm" href={`/journal?trade=${encodeURIComponent(t.positionId)}`} onClick={e => e.stopPropagation()}>+ Add note</Link>;
  };
  const dayHead = (key: string, date: Date) => {
    const d = dayTotal.get(key);
    return <><b>{dayLabel(date)}</b>{d && <>{d.n} trade{d.n === 1 ? '' : 's'} · <span className={`m ${d.pnl >= 0 ? 'pos' : 'neg'}`}>{fmtUsd(d.pnl)}</span></>}</>;
  };
  const pctOf = (v: number) => (balance > 0 ? `${v >= 0 ? '+' : '−'}${((Math.abs(v) / balance) * 100).toFixed(2)}%` : '');

  return (
    <section className="x-card dk-trades" data-testid="dash-trades">
      <div className="x-ch">
        <h2>Recent trades</h2>
        <span className="x-sub">{noted} of {trades.length} journaled</span>
        <div className="x-r">
          <div className="x-seg x-seg--sm" role="tablist" aria-label="Filter trades">
            {FILTERS.map(x => <button key={x.key} role="tab" aria-selected={f === x.key} onClick={() => setF(x.key)} data-testid={`tf-${x.key}`}>{x.label}</button>)}
          </div>
          <Link className="x-btn x-btn--sm" href="/trades">View all</Link>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="x-empty"><p>{f === 'nonote' ? 'Every trade in this range has a note. Nice.' : 'No trades match this filter.'}</p></div>
      ) : (
        <>
          <div className="x-tblwrap dk-tbl">
            <table className="x-tbl">
              <thead><tr><th>Symbol</th><th>Side</th><th>Entry → exit</th><th className="n">Size</th><th className="n">Hold</th><th className="n">P&amp;L</th><th>Journal</th><th aria-label="Open" /></tr></thead>
              <tbody>
                {groups.map(g => [
                  <tr key={g.key} className="x-grp"><td colSpan={8}>{dayHead(g.key, g.date)}</td></tr>,
                  ...g.trades.map(t => (
                    <tr key={t.positionId} className="x-click" onClick={() => open(t)} data-testid="recent-trade">
                      <td>
                        <span className="x-sym"><span className="x-mk">{tickerMark(t.symbol)}</span>
                          <span><b>{t.symbol}</b><small>{marketKind(t.symbol) ? `${marketKind(t.symbol)} · ` : ''}{new Date(t.closeTime!).toTimeString().slice(0, 5)}</small></span></span>
                      </td>
                      <td><SideChip dir={t.direction} /></td>
                      <td className="m dk-px"><b>{fmtPrice(t.entryPrice, t.exitPrice)}</b> → {fmtPrice(t.exitPrice, t.entryPrice)}</td>
                      <td className="n m">{t.volume.toFixed(2)}</td>
                      <td className="n"><span className="dk-hold"><i style={{ width: `${Math.max(4, ((t.durationSecs ?? 0) / maxHold) * 44)}px` }} /><span className="m">{fmtHold(t.durationSecs)}</span></span></td>
                      <td className="n dk-pl"><b className={`m ${t.netPnl > 0 ? 'pos' : t.netPnl < 0 ? 'neg' : ''}`}>{fmtUsd(t.netPnl)}</b><small className="m">{pctOf(t.netPnl)}</small></td>
                      <td>{journalCell(t)}</td>
                      <td className="dk-chev"><Chevron /></td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
          <div className="dk-cards">
            {groups.map(g => (
              <div key={g.key}>
                <div className="dk-cgrp">{dayHead(g.key, g.date)}</div>
                {g.trades.map(t => (
                  <div key={t.positionId} className="dk-card" role="link" tabIndex={0} onClick={() => open(t)} onKeyDown={e => { if (e.key === 'Enter') open(t); }}>
                    <span className="x-mk">{tickerMark(t.symbol)}</span>
                    <div className="dk-card-a"><span><b>{t.symbol}</b><SideChip dir={t.direction} /></span><small>{fmtHold(t.durationSecs)} · {new Date(t.closeTime!).toTimeString().slice(0, 5)}</small></div>
                    <div className="dk-pl"><b className={`m ${t.netPnl > 0 ? 'pos' : t.netPnl < 0 ? 'neg' : ''}`}>{fmtUsd(t.netPnl)}</b><small className="m">{pctOf(t.netPnl)}</small></div>
                    <div className="dk-card-j">{journalCell(t)}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Chevron() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>;
}

// ─── coach review (AI) ───────────────────────────────────────────────────────

function writtenLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const h = (Date.now() - d.getTime()) / 3600_000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `on ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
}

/** The written review, cached server-side. Hides itself if AI is off or fails. */
export function CoachReview({ accountId }: { accountId: string | null }) {
  const [report, setReport] = useState<AiReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    setLoading(true); setFailed(false); setReport(null); setOpen(false);
    api.ai.report(accountId)
      .then(r => { if (alive) setReport(r); })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [accountId]);

  const refresh = useCallback(async () => {
    if (!accountId || refreshing) return;
    setRefreshing(true);
    try { setReport(await api.ai.report(accountId, true)); } catch { /* keep the current review */ } finally { setRefreshing(false); }
  }, [accountId, refreshing]);

  if (!accountId || failed) return null;
  return (
    <section className="x-card dk-coach" data-testid="ai-report-card">
      <div className="x-ch">
        <h2>Coach review</h2>
        <span className="x-sub">{report ? (report.generated ? `Written ${writtenLabel(report.updatedAt)}` : 'Rule-based summary') : 'Writing your review…'} · not financial advice</span>
        <div className="x-r">
          <button className="x-btn x-btn--sm" onClick={refresh} disabled={loading || refreshing} data-testid="ai-report-refresh">
            <ISync size={14} className={refreshing ? 'x-spin' : undefined} />{refreshing ? 'Rewriting' : 'Rewrite'}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="dk-coach-sk" data-testid="ai-report-loading">{[92, 76, 60].map(w => <i key={w} className="x-skel x-skel--in" style={{ width: `${w}%` }} />)}</div>
      ) : report && (
        <>
          <div className={`dk-coach-bd ${open ? 'open' : ''}`}><MarkdownMessage content={report.content} /></div>
          {report.stale && <p className="x-lead" style={{ fontSize: 12.5 }}>Couldn&rsquo;t refresh, so this is the last review.</p>}
          <button className="dk-more" onClick={() => setOpen(o => !o)} aria-expanded={open}>
            {open ? 'Show less' : 'Read the full review'}<IChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : undefined }} />
          </button>
        </>
      )}
    </section>
  );
}

export function DeskSkeleton() {
  return (
    <div className="dk-grid" aria-busy="true" aria-label="Loading your dashboard">
      <div className="dk-row1"><div className="x-skel" style={{ height: 460 }} /><div className="dk-kpis">{[0, 1, 2, 3].map(i => <div key={i} className="x-skel" style={{ height: 104 }} />)}</div></div>
      <div className="dk-row2"><div className="x-skel" style={{ height: 420 }} /><div className="x-skel" style={{ height: 420 }} /></div>
    </div>
  );
}
