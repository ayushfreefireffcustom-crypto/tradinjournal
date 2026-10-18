'use client';

import { Fragment, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AccountStats, Trade } from '@/lib/api';
import { rollingSeries } from '@/lib/stats';
import { money, moneyShort, plain, dur, compact, tone } from './format';

const stdev = (xs: number[]) => {
  if (!xs.length) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

/** Card chrome shared by every analytics block. */
export function ACard({ title, sub, right, children, className = '', testId }: { title: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string; testId?: string }) {
  return (
    <section className={`v3-card a-card ${className}`} data-testid={testId}>
      <div className="v3-ch"><h3>{title}{sub && <span> · {sub}</span>}</h3>{right}</div>
      {children}
    </section>
  );
}

function Tiles({ items }: { items: { l: string; v: string; c?: string }[] }) {
  return <div className="a-tiles">{items.map(t => <div key={t.l}><span>{t.l}</span><b className={`num ${t.c ?? ''}`}>{t.v}</b></div>)}</div>;
}

// ── KPI row ───────────────────────────────────────────────────────────────
export function AKpis({ view }: { view: AccountStats }) {
  const peak = Math.max(...view.equityCurve.map(p => p.equity), view.startingBalance);
  const cur = view.currentEquity;
  const recovered = view.maxDrawdownPct > 0 && cur >= peak;
  const ddAbs = view.maxDrawdownPct * peak;
  const k = [
    { l: 'Net P&L', v: money(view.netPnl), c: tone(view.netPnl), s: `${view.totalTrades} trade${view.totalTrades === 1 ? '' : 's'}` },
    { l: 'Profit factor', v: view.profitFactor >= 999 ? '∞' : view.profitFactor.toFixed(2), c: '', s: view.profitFactor >= 999 ? 'No losers yet' : `$${view.profitFactor.toFixed(2)} per $1 lost` },
    { l: 'Gross profit', v: money(view.grossProfit), c: 'lg', s: `${view.totalWins} winner${view.totalWins === 1 ? '' : 's'}` },
    { l: 'Gross loss', v: money(-Math.abs(view.grossLoss)), c: view.grossLoss ? 'sh' : '', s: `${view.totalLosses} loser${view.totalLosses === 1 ? '' : 's'}` },
    { l: 'Max drawdown', v: `${(view.maxDrawdownPct * 100).toFixed(1)}%`, c: view.maxDrawdownPct ? 'sh' : '', s: ddAbs > 0 ? `${money(-ddAbs, 0)}${recovered ? ' · recovered' : ''}` : 'No drawdown yet' },
  ];
  return (
    <section className="v3-card a-kpis" aria-label="Summary">
      {k.map(x => {
        const [w, c] = x.v.includes('$') && x.v.includes('.') ? x.v.split('.') : [x.v, ''];
        return <div key={x.l} data-testid={`kpi-${x.l.toLowerCase().replace(/[^a-z]/g, '')}`}><span>{x.l}</span><b className={`num ${x.c}`}>{w}{c && <em>.{c}</em>}</b><small>{x.s}</small></div>;
      })}
    </section>
  );
}

// ── Strike rate ───────────────────────────────────────────────────────────
export function Strike({ view }: { view: AccountStats }) {
  const total = view.totalWins + view.totalLosses;
  const w = total ? view.totalWins / total : 0;
  const R = 70, C = 2 * Math.PI * R;
  return (
    <ACard title="Strike rate" testId="strike-card">
      <div className="a-strike">
        <div className="a-ring" data-testid="winloss-donut">
          <svg viewBox="0 0 170 170"><circle cx="85" cy="85" r={R} stroke="#FCE3E8" strokeWidth="18" fill="none" />
            {total > 0 && <circle cx="85" cy="85" r={R} stroke="#F4435E" strokeWidth="18" fill="none" strokeDasharray={`${C * (1 - w)} ${C}`} strokeDashoffset={-C * w} className="a-arc" />}
            {total > 0 && <circle cx="85" cy="85" r={R} stroke="#19C37D" strokeWidth="18" fill="none" strokeDasharray={`${C * w} ${C}`} className="a-arc" />}
          </svg>
          <div><b className="num">{total ? `${Math.round(w * 100)}%` : '—'}</b><span>win rate</span></div>
        </div>
        <dl className="a-legend">
          <div><dt><i style={{ background: 'var(--long-fill)' }} />Wins</dt><dd className="num">{view.totalWins}</dd></div>
          <div><dt><i style={{ background: 'var(--short-fill)' }} />Losses</dt><dd className="num">{view.totalLosses}</dd></div>
          <div className="t"><dt>Total</dt><dd className="num">{total}</dd></div>
        </dl>
      </div>
      <Tiles items={[
        { l: 'Avg win', v: money(view.avgWin), c: view.avgWin ? 'lg' : '' },
        { l: 'Avg loss', v: money(-Math.abs(view.avgLoss)), c: view.avgLoss ? 'sh' : '' },
        { l: 'Best', v: money(view.bestTrade), c: tone(view.bestTrade) },
        { l: 'Worst', v: money(view.worstTrade), c: tone(view.worstTrade) },
      ]} />
    </ACard>
  );
}

// ── P&L distribution ──────────────────────────────────────────────────────
export function Dist({ trades }: { trades: Trade[] }) {
  const pnls = trades.map(t => t.netPnl);
  const [hi, setHi] = useState<number | null>(null);
  if (!pnls.length) return <ACard title="Net P&L per trade" sub="distribution"><div className="d-empty">No closed trades in this range.</div></ACard>;
  const N = 8, absMax = Math.max(...pnls.map(Math.abs), 1), width = (2 * absMax) / N;
  const buckets = Array.from({ length: N }, (_, i) => ({ center: -absMax + (i + 0.5) * width, n: 0 }));
  for (const v of pnls) buckets[Math.min(N - 1, Math.max(0, Math.floor((v + absMax) / width)))]!.n++;
  const maxN = Math.max(...buckets.map(b => b.n), 1);
  const exp = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  return (
    <ACard title="Net P&L per trade" sub="distribution" testId="r-distribution">
      <div className="a-dist" onPointerLeave={() => setHi(null)}>
        {buckets.map((b, i) => (
          <div key={i} className={`a-dcol ${hi != null && hi !== i ? 'dim' : ''}`} onPointerEnter={() => setHi(i)}
            title={`${b.n} trade${b.n === 1 ? '' : 's'} around ${moneyShort(b.center)} · ${Math.round((b.n / pnls.length) * 100)}%`}>
            <div className="bar"><small className="num">{hi === i ? `${Math.round((b.n / pnls.length) * 100)}%` : b.n}</small>
              <i style={{ height: b.n ? `${Math.max((b.n / maxN) * 100, 3)}%` : 0, background: b.center < 0 ? 'var(--short-fill)' : 'var(--long-fill)', animationDelay: `${i * 50}ms` }} /></div>
            <span className="num">{`${b.center < 0 ? '−' : ''}$${Math.round(Math.abs(b.center)).toLocaleString()}`}</span>
          </div>
        ))}
      </div>
      <Tiles items={[
        { l: 'Expectancy', v: money(exp), c: tone(exp) },
        { l: 'Std dev', v: plain(stdev(pnls), 0) },
        { l: 'Best', v: moneyShort(Math.max(...pnls)), c: tone(Math.max(...pnls)) },
        { l: 'Worst', v: moneyShort(Math.min(...pnls)), c: tone(Math.min(...pnls)) },
      ]} />
    </ACard>
  );
}

// ── Generic light area chart with hover ───────────────────────────────────
export function AreaLine({ pts, base, fmt, height = 260, labelFor }: { pts: number[]; base?: number; fmt: (v: number) => string; height?: number; labelFor?: (i: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  const gid = `al${useId().replace(/:/g, '')}`;
  const W = 1000, H = height;
  if (pts.length < 2) return <div className="d-empty" style={{ height }}>Not enough data to draw yet.</div>;
  let mn = Math.min(...pts, base ?? Infinity), mx = Math.max(...pts, base ?? -Infinity);
  if (mn === mx) { mn -= 1; mx += 1; }
  const pad = (mx - mn) * 0.1; mn -= pad; mx += pad;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (v: number) => 8 + (1 - (v - mn) / (mx - mn)) * (H - 16);
  const d = 'M' + pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L');
  const onMove = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); setH(Math.max(0, Math.min(pts.length - 1, Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1))))); };
  return (
    <div ref={ref} className="a-area" style={{ height }} onPointerMove={onMove} onPointerLeave={() => setH(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6E4BFF" stopOpacity=".2" /><stop offset="1" stopColor="#6E4BFF" stopOpacity="0" /></linearGradient></defs>
        {base != null && <line x1={0} x2={W} y1={y(base)} y2={y(base)} stroke="#C9C7D2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />}
        <path d={`${d} L${W},${H} L0,${H}Z`} fill={`url(#${gid})`} />
        <path d={d} fill="none" stroke="#6E4BFF" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {h != null && <>
        <span className="a-cross" style={{ left: `${(x(h) / W) * 100}%` }} />
        <span className="a-dot" style={{ left: `${(x(h) / W) * 100}%`, top: `${(y(pts[h]!) / H) * 100}%` }} />
        <span className={`a-tip num ${x(h) / W > 0.8 ? 'l' : ''}`} style={{ left: `${(x(h) / W) * 100}%`, top: `${(y(pts[h]!) / H) * 100}%` }}>{fmt(pts[h]!)}{labelFor && <em>{labelFor(h)}</em>}</span>
      </>}
    </div>
  );
}

export function Equity({ view }: { view: AccountStats }) {
  const pts = [view.startingBalance, ...view.equityCurve.map(p => p.equity)];
  const times = ['', ...view.equityCurve.map(p => p.time)];
  const peak = Math.max(...pts);
  return (
    <ACard title="Equity curve" sub="realised vs starting balance" testId="dd-card" right={<span className="v3-pill v num">Peak {plain(peak)}</span>}>
      <div className="a-pad"><AreaLine pts={pts} base={view.startingBalance} fmt={v => plain(v)} height={260}
        labelFor={i => (times[i] ? new Date(times[i]!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Start')} /></div>
    </ACard>
  );
}

// ── Session × weekday ─────────────────────────────────────────────────────
const SESS = ['Asia', 'London', 'NY'] as const;
const WDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
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
  if (!has) return <ACard title="Session × weekday" sub="UTC"><div className="d-empty">No weekday trades in this range.</div></ACard>;
  const totals = grid.map(r => r.reduce((s, c) => s + c.v, 0));
  let best = { s: 0, d: -1, v: -Infinity }, worst = { s: 0, d: -1, v: Infinity };
  grid.forEach((r, i) => r.forEach((c, j) => { if (!c.n) return; if (c.v > best.v) best = { s: i, d: j, v: c.v }; if (c.v < worst.v) worst = { s: i, d: j, v: c.v }; }));
  const bestSess = totals.indexOf(Math.max(...totals));
  const bg = (v: number, n: number) => !n ? 'var(--paper)' : v >= 0 ? `rgba(25,195,125,${0.12 + Math.min(1, Math.abs(v) / max) * 0.42})` : `rgba(244,67,94,${0.1 + Math.min(1, Math.abs(v) / max) * 0.36})`;
  return (
    <ACard title="Session × weekday" sub="UTC" testId="session-heatmap">
      <div className="a-sess">
        <span />{WDAYS.map(d => <span key={d} className="h">{d}</span>)}<span className="h">Total</span>
        {SESS.map((s, i) => (
          <Fragment key={s}>
            <span className="r">{s}</span>
            {grid[i]!.map((c, j) => (
              <div key={j} className={`c num ${c.n ? (c.v >= 0 ? 'lg' : 'sh') : 'mute'}`} style={{ background: bg(c.v, c.n) }} title={c.n ? `${s} · ${WDAYS[j]}: ${money(c.v)} over ${c.n} trade${c.n === 1 ? '' : 's'}` : `${s} · ${WDAYS[j]}: no trades`}>
                {c.n ? compact(c.v) : '—'}
              </div>
            ))}
            <div className={`c tot num ${tone(totals[i]!)}`}>{compact(totals[i]!)}</div>
          </Fragment>
        ))}
      </div>
      <div className="a-chips">
        {totals[bestSess]! > 0 && <span className="v3-pill g">Best session · {SESS[bestSess]}</span>}
        {worst.d >= 0 && worst.v < 0 && <span className="v3-pill r">Worst · {SESS[worst.s]} {WDAYS[worst.d]}</span>}
        {best.d >= 0 && best.v > 0 && <span className="v3-pill n">Best cell · {SESS[best.s]} {WDAYS[best.d]} {compact(best.v)}</span>}
      </div>
    </ACard>
  );
}

// ── Rolling edge ──────────────────────────────────────────────────────────
export function Rolling({ trades }: { trades: Trade[] }) {
  const [m, setM] = useState<'win' | 'exp'>('win');
  const n = trades.length;
  const win = n >= 40 ? 20 : Math.max(5, Math.floor(n / 3));
  const series = useMemo(() => rollingSeries(trades, win), [trades, win]);
  const seg = (
    <div className="v3-seg sm" role="group" aria-label="Rolling metric">
      <button aria-pressed={m === 'win'} onClick={() => setM('win')}>Win rate</button>
      <button aria-pressed={m === 'exp'} onClick={() => setM('exp')}>Expectancy</button>
    </div>
  );
  return (
    <ACard title="Rolling edge" sub={`${win}-trade window`} right={seg} testId="rolling-card">
      <div className="a-pad">
        {n < 10 ? <div className="d-empty" style={{ height: 230 }}><b>Needs 10+ closed trades</b>You have {n} in this range.</div>
          : <AreaLine key={m} pts={series.map(p => (m === 'win' ? p.winRate * 100 : p.expectancy))} base={m === 'win' ? 50 : 0}
              fmt={v => (m === 'win' ? `${v.toFixed(0)}% win` : `${money(v)} / trade`)} height={230}
              labelFor={i => `Trade ${series[i]!.i}`} />}
      </div>
    </ACard>
  );
}

// ── Instruments table ─────────────────────────────────────────────────────
export function SymbolTable({ rows }: { rows: AccountStats['bySymbol'] }) {
  const [k, setK] = useState<'netPnl' | 'trades' | 'winRate'>('netPnl');
  const sorted = [...rows].sort((a, b) => b[k] - a[k]);
  const th = (key: typeof k, l: string) => <th className="r"><button className={`v3-sort ${k === key ? 'on' : ''}`} onClick={() => setK(key)}>{l}</button></th>;
  return (
    <ACard title="Instrument analytics" sub={`${rows.length} traded`} testId="bysymbol-card" className="a-flush">
      {rows.length === 0 ? <div className="d-empty">No instruments in this range.</div> : (
        <div className="v3-tbl-wrap">
          <table className="v3-table a-sym">
            <thead><tr><th>Symbol</th>{th('trades', 'Trades')}{th('winRate', 'Win rate')}{th('netPnl', 'Net P&L')}<th className="r">Avg P&amp;L</th></tr></thead>
            <tbody>{sorted.map(s => (
              <tr key={s.symbol} className="static">
                <td><div className="d-sym"><i>{s.symbol.slice(0, 2)}</i>{s.symbol}</div></td>
                <td className="r num">{s.trades}</td>
                <td className="r"><span className={`v3-pill num ${s.winRate === 0 ? 'r' : 'v'}`}>{Math.round(s.winRate * 100)}%</span></td>
                <td className={`r num ${tone(s.netPnl)}`} style={{ fontWeight: 700 }}>{money(s.netPnl)}</td>
                <td className="r num">{money(s.avgPnl)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </ACard>
  );
}

// ── Diverging group bars (emotion / tag) ──────────────────────────────────
export interface Group { label: string; trades: number; wins: number; netPnl: number }
export function GroupBars({ title, sub, rows, empty, testId, order }: { title: string; sub: string; rows: Group[]; empty: string; testId?: string; order?: string[] }) {
  const list = order ? [...rows].sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)) : rows;
  const mx = Math.max(...rows.map(r => Math.abs(r.netPnl)), 1);
  return (
    <ACard title={title} sub={sub} testId={testId}>
      {rows.length === 0 ? <div className="d-empty a-empty">{empty}</div> : (
        <div className="a-gbars">
          {list.map((r, i) => {
            const w = Math.max((Math.abs(r.netPnl) / mx) * 50, r.netPnl ? 1.5 : 0);
            return (
              <div key={r.label} className="a-gb" title={`${r.trades} trade${r.trades === 1 ? '' : 's'} · ${Math.round((r.wins / r.trades) * 100)}% win`}>
                <span>{r.label}<small>{r.trades} · {Math.round((r.wins / r.trades) * 100)}%</small></span>
                <div className="track"><i style={{ [r.netPnl >= 0 ? 'left' : 'right']: '50%', width: `${w}%`, background: r.netPnl >= 0 ? 'var(--long-fill)' : 'var(--short-fill)', transformOrigin: r.netPnl >= 0 ? 'left' : 'right', animationDelay: `${i * 60}ms` }} /></div>
                <b className={`num ${tone(r.netPnl)}`}>{compact(r.netPnl).replace(/^([+−])/, '$1$')}</b>
              </div>
            );
          })}
        </div>
      )}
    </ACard>
  );
}

// ── Hour of day ───────────────────────────────────────────────────────────
export function Hours({ trades }: { trades: Trade[] }) {
  const [h, setH] = useState<number | null>(null);
  const net = Array(24).fill(0) as number[], cnt = Array(24).fill(0) as number[];
  for (const t of trades) { const x = new Date(t.openTime).getUTCHours(); net[x] = net[x]! + t.netPnl; cnt[x] = cnt[x]! + 1; }
  const mx = Math.max(...net.map(Math.abs), 1);
  const best = net.indexOf(Math.max(...net)), worst = net.indexOf(Math.min(...net)), busy = cnt.indexOf(Math.max(...cnt));
  const hh = (x: number) => `${String(x).padStart(2, '0')}:00`;
  return (
    <ACard title="Hour of day" sub="UTC open" testId="time-of-day" right={h != null ? <span className="a-readout num">{hh(h)} · {cnt[h]} trade{cnt[h] === 1 ? '' : 's'} · <b className={tone(net[h]!)}>{money(net[h]!)}</b></span> : undefined}>
      <div className="a-hours" onPointerLeave={() => setH(null)}>
        {net.map((v, i) => (
          <div key={i} className={`a-hc ${h != null && h !== i ? 'dim' : ''}`} onPointerEnter={() => setH(i)}>
            <div className="t">{v > 0 && <i style={{ height: `${Math.max((v / mx) * 100, 3)}%`, background: 'var(--long-fill)' }} />}</div>
            <div className="b">{v < 0 && <i style={{ height: `${Math.max((-v / mx) * 100, 3)}%`, background: 'var(--short-fill)' }} />}</div>
            <span>{i % 3 === 0 ? String(i).padStart(2, '0') : ''}</span>
          </div>
        ))}
      </div>
      <Tiles items={[
        { l: 'Best hour', v: net[best]! > 0 ? hh(best) : '—', c: net[best]! > 0 ? 'lg' : '' },
        { l: 'Worst hour', v: net[worst]! < 0 ? hh(worst) : '—', c: net[worst]! < 0 ? 'sh' : '' },
        { l: 'Most active', v: cnt[busy] ? hh(busy) : '—' },
      ]} />
    </ACard>
  );
}

// ── Scatter: P&L vs hold time ─────────────────────────────────────────────
export function Scatter({ trades }: { trades: Trade[] }) {
  const [hov, setHov] = useState<Trade | null>(null);
  const pts = trades.filter(t => t.durationSecs != null);
  if (pts.length < 2) return <ACard title="P&L vs hold time"><div className="d-empty">Not enough closed trades.</div></ACard>;
  const lx = (s: number) => Math.log10(Math.max(s, 30));
  const x0 = lx(Math.min(...pts.map(t => t.durationSecs!))), x1 = Math.max(lx(Math.max(...pts.map(t => t.durationSecs!))), x0 + 1);
  const ym = Math.max(...pts.map(t => Math.abs(t.netPnl)), 1);
  const X = (s: number) => 4 + ((lx(s) - x0) / (x1 - x0)) * 92, Y = (v: number) => 50 - (v / ym) * 44;
  const ticks = [60, 600, 3600, 4 * 3600, 86400, 7 * 86400].filter(s => lx(s) >= x0 && lx(s) <= x1);
  return (
    <ACard title="P&L vs hold time" sub="each dot is a trade" testId="scatter-card"
      right={hov ? <span className="a-readout num">{hov.symbol} · {dur(hov.durationSecs)} · <b className={tone(hov.netPnl)}>{money(hov.netPnl)}</b></span> : undefined}>
      <div className="a-scatter">
        <span className="zero" />
        {ticks.map(s => <span key={s} className="tick" style={{ left: `${X(s)}%` }}>{dur(s)}</span>)}
        {pts.map(t => (
          <i key={t.positionId} className={`${t.netPnl >= 0 ? 'g' : 'r'} ${hov === t ? 'on' : ''}`} style={{ left: `${X(t.durationSecs!)}%`, top: `${Y(t.netPnl)}%`, width: 8 + Math.min(t.volume, 3) * 3, height: 8 + Math.min(t.volume, 3) * 3 }}
            onPointerEnter={() => setHov(t)} onPointerLeave={() => setHov(null)} />
        ))}
      </div>
    </ACard>
  );
}
