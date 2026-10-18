'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, type CSSProperties } from 'react';
import type { AccountStats, Trade } from '@/lib/api';
import type { Insight } from '@/lib/insights';
import { IAlert, IArrowRight, ICalendar, ITrendUp, ISun, IWarn } from './icons';

import { money, moneyShort, plain, dur, compact, tone } from './format';
export { money, moneyShort, plain, dur, compact };

/** Net P&L per local calendar day (YYYY-MM-DD) from closed trades. */
export function dailyPnl(trades: Trade[]) {
  const m = new Map<string, { pnl: number; n: number }>();
  for (const t of trades) {
    if (!t.closeTime) continue;
    const d = new Date(t.closeTime);
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const e = m.get(k) ?? { pnl: 0, n: 0 };
    e.pnl += t.netPnl; e.n++;
    m.set(k, e);
  }
  return m;
}

// ── Hero: Net P&L + equity / drawdown / daily chart ────────────────────────
type Mode = 'equity' | 'drawdown' | 'daily';

export function HeroPnl({ view, trades }: { view: AccountStats; trades: Trade[] }) {
  const [mode, setMode] = useState<Mode>('equity');
  const pct = view.startingBalance ? (view.netPnl / view.startingBalance) * 100 : 0;
  const days = useMemo(() => [...dailyPnl(trades).entries()].sort(([a], [b]) => (a < b ? -1 : 1)), [trades]);
  const bestDay = days.reduce((m, [, v]) => Math.max(m, v.pnl), -Infinity);
  const [whole, cents] = money(view.netPnl).split('.');
  return (
    <section className="d-hero" aria-label="Net P&L" data-testid="hero-pnl">
      <div className="d-hero-top">
        <div>
          <div className="d-hero-lbl">Net P&amp;L <span className="d-hero-chip num">{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%</span></div>
          <div className="d-big num">{whole}<small>.{cents}</small></div>
          <div className="d-deltas">
            <span>Balance <b className="num">{plain(view.currentEquity)}</b></span>
            <span>Started <b className="num">{plain(view.startingBalance, 0)}</b></span>
            {Number.isFinite(bestDay) && bestDay > 0 && <span>Best day <b className="num">{moneyShort(bestDay)}</b></span>}
          </div>
        </div>
        <div className="d-tabs" role="group" aria-label="Chart">
          {(['equity', 'drawdown', 'daily'] as Mode[]).map(m => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === 'equity' ? 'Equity' : m === 'drawdown' ? 'Drawdown' : 'Daily P&L'}</button>
          ))}
        </div>
      </div>
      <HeroChart view={view} days={days} mode={mode} />
    </section>
  );
}

function HeroChart({ view, days, mode }: { view: AccountStats; days: [string, { pnl: number; n: number }][]; mode: Mode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000, H = 230;

  const series = useMemo(() => {
    if (mode === 'daily') return days.map(([k, v]) => ({ label: k, v: v.pnl }));
    const pts = view.equityCurve.length ? view.equityCurve : [{ time: '', equity: view.startingBalance }];
    if (mode === 'equity') return [{ label: 'Start', v: view.startingBalance }, ...pts.map(p => ({ label: p.time, v: p.equity }))];
    let peak = -Infinity;
    return [{ label: 'Start', v: 0 }, ...pts.map(p => { peak = Math.max(peak, p.equity); return { label: p.time, v: peak > 0 ? ((p.equity - peak) / peak) * 100 : 0 }; })];
  }, [view, days, mode]);

  const vals = series.map(s => s.v);
  const base = mode === 'equity' ? view.startingBalance : 0;
  let mn = Math.min(...vals, base), mx = Math.max(...vals, base);
  if (mn === mx) { mn -= 1; mx += 1; }
  const pad = (mx - mn) * 0.12;
  mn -= pad; mx += pad;
  const y = (v: number) => H - 10 - ((v - mn) / (mx - mn)) * (H - 26);
  const x = (i: number) => (series.length <= 1 ? 0 : (i / (series.length - 1)) * W);
  const by = y(base);

  const fmt = (v: number) => (mode === 'drawdown' ? `${v.toFixed(2)}%` : mode === 'daily' ? money(v) : plain(v));
  const dateLabel = (l: string) => { if (!l || l === 'Start') return 'Start'; const d = new Date(l); return Number.isNaN(+d) ? l : d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }); };

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r || series.length < 2) return;
    const i = Math.round(((e.clientX - r.left) / r.width) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };
  const hi = hover ?? series.length - 1;
  const hx = (x(hi) / W) * 100, hy = series[hi] ? (y(series[hi]!.v) / H) * 100 : 0;

  let body: React.ReactNode;
  if (mode === 'daily') {
    const bw = Math.min(28, (W / Math.max(series.length, 1)) * 0.6);
    body = series.map((s, i) => {
      const top = Math.min(y(s.v), by), h = Math.max(2, Math.abs(y(s.v) - by));
      return <rect key={i} x={x(i) - bw / 2 + (series.length === 1 ? W / 2 : 0)} y={top} width={bw} height={h} rx={3} fill={s.v >= 0 ? '#fff' : 'rgba(255,255,255,.45)'} opacity={hover == null || hover === i ? 1 : 0.55} />;
    });
  } else {
    const d = 'M' + series.map((s, i) => `${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join(' L');
    body = (
      <>
        <defs><linearGradient id="d-hero-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".32" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
        <path d={`${d} L${W},${H} L0,${H}Z`} fill="url(#d-hero-fill)" />
        <path d={d} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </>
    );
  }

  const last = series[series.length - 1];
  return (
    <div ref={ref} className="d-chart" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
      aria-label={`${mode === 'equity' ? 'Equity curve' : mode === 'drawdown' ? 'Drawdown' : 'Daily P&L'}; latest ${last ? fmt(last.v) : 'n/a'}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <line x1={0} x2={W} y1={by} y2={by} stroke="rgba(255,255,255,.5)" strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
        {body}
      </svg>
      {mode === 'equity' && <span className="d-start" style={{ top: `${(by / H) * 100}%` }}>Start {plain(view.startingBalance, 0)}</span>}
      {series.length > 1 && hover != null && <span className="d-cross" style={{ left: `${hx}%` }} />}
      {series.length > 0 && mode !== 'daily' && <span className="d-dot" style={{ left: `${hx}%`, top: `${hy}%` }} />}
      {series[hi] && (
        <span className="d-tag num" style={{ left: `calc(${Math.max(hx, 12)}% - ${hx > 96 ? 0 : -8}px)`, top: `${Math.max(hy, 18)}%` }}>
          {fmt(series[hi]!.v)}{hover != null && <span>{dateLabel(series[hi]!.label)}</span>}
        </span>
      )}
    </div>
  );
}

// ── Review card (rule-based, from the trader's own insights) ───────────────
export function ReviewCard({ view, insights, rangeLabel }: { view: AccountStats; insights: Insight[]; rangeLabel: string }) {
  const edge = insights.find(i => i.id === 'dir-edge');
  const hold = insights.find(i => i.id === 'hold-asym' && i.tone === 'warning');
  const fix = hold ?? insights.find(i => i.id === 'tilt') ?? insights.find(i => i.id === 'worst-day');
  const best = [...view.byDay].sort((a, b) => b.netPnl - a.netPnl)[0];
  const worst = [...view.byDay].sort((a, b) => a.netPnl - b.netPnl)[0];
  const fixText = fix?.id === 'hold-asym' ? 'Close losing trades at your stop — don’t wait for them to come back.'
    : fix?.id === 'tilt' ? 'Pause for 20 minutes after any loss before the next entry.'
    : fix?.id === 'worst-day' ? `Size down on ${worst?.day}s — or sit them out until the pattern changes.` : null;
  const keep = !fixText ? insights.find(i => i.id === 'top-symbol') ?? insights.find(i => i.id === 'session') : null;
  return (
    <section className="v3-card d-review" aria-labelledby="d-review-t" data-testid="review-card">
      <div className="v3-ch"><h3 id="d-review-t">Your review <span>· {rangeLabel}</span></h3><Link href="/coach">Ask coach <IArrowRight size={14} /></Link></div>
      <div className="d-review-bd">
        {edge ? (
          <p className="d-review-q">{edge.lead}: <span className={tone(view.byDirection.long.netPnl)}>longs {moneyShort(view.byDirection.long.netPnl)}</span> vs <span className={tone(view.byDirection.short.netPnl)}>shorts {moneyShort(view.byDirection.short.netPnl)}</span>.{hold ? <span className="m"> {hold.lead} — {hold.detail?.split(' — ')[0]}.</span> : <span className="m"> {(view.winRate * 100).toFixed(0)}% win rate across {view.totalTrades} trades, profit factor {view.profitFactor >= 999 ? '∞' : view.profitFactor.toFixed(2)}.</span>}</p>
        ) : (
          <p className="d-review-q">{view.totalTrades} closed trades · win rate {(view.winRate * 100).toFixed(1)}% <span className="m">· profit factor {view.profitFactor >= 999 ? '∞' : view.profitFactor.toFixed(2)}</span></p>
        )}
        {fixText && <div className="d-fix"><small>One thing to fix</small><p>{fixText}</p></div>}
        {keep && <div className="d-fix d-keep"><small>Keep doing</small><p>{keep.lead ?? keep.text}{keep.detail ? ` — ${keep.detail.charAt(0).toLowerCase()}${keep.detail.slice(1)}.` : '.'}</p></div>}
        <div className="d-kv">
          <div><b className={best && best.netPnl > 0 ? 'lg' : ''}>{best && best.netPnl > 0 ? best.day : '—'}</b><span>Strongest{best && best.netPnl > 0 ? ` · ${moneyShort(best.netPnl)}` : ''}</span></div>
          <div><b className={worst && worst.netPnl < 0 ? 'sh' : ''}>{worst && worst !== best ? worst.day : '—'}</b><span>{worst && worst.netPnl < 0 ? 'Bleeds most' : 'Weakest'}{worst && worst !== best ? ` · ${moneyShort(worst.netPnl)}` : ''}</span></div>
        </div>
      </div>
    </section>
  );
}

// ── KPI strip ──────────────────────────────────────────────────────────────
export function KpiStrip({ view }: { view: AccountStats }) {
  const win = view.winRate * 100;
  const pf = view.profitFactor;
  const awl = Math.max(view.avgWin, Math.abs(view.avgLoss), 1);
  const rr = view.avgLoss ? view.avgWin / Math.abs(view.avgLoss) : 0;
  const streakMax = Math.max(view.maxWinStreak, view.maxLossStreak, 1);
  const peakLoss = view.maxDrawdownPct * Math.max(...view.equityCurve.map(p => p.equity), view.startingBalance);
  const g = (w: number, c: string, i = 0): CSSProperties => ({ width: `${Math.max(0, Math.min(100, w))}%`, background: c, animationDelay: `${i * 70}ms` });
  return (
    <section className="v3-card d-kpis" aria-label="Key metrics" data-testid="kpi-strip">
      <div className="d-kpi" data-testid="kpi-winrate"><div className="l">Win rate</div><b className="num">{win.toFixed(1)}%</b><div className="s">{view.totalWins} wins · {view.totalLosses} losses</div>
        <div className="d-meter"><i style={g(win, 'var(--long-fill)')} /><i style={g(100 - win, '#F7A9B5', 1)} /></div></div>
      <div className="d-kpi" data-testid="kpi-pf"><div className="l">Profit factor</div><b className="num">{pf >= 999 ? '∞' : pf.toFixed(2)}</b><div className="s">{pf >= 999 ? 'No losing trades yet' : `$${pf.toFixed(2)} made per $1 lost`}</div>
        <div className="d-meter"><i style={g(Math.min(pf / 3, 1) * 100, 'var(--acc)')} /></div></div>
      <div className="d-kpi" data-testid="kpi-avgwl"><div className="l">Avg win / loss</div><b className="num"><span className="lg">${Math.round(view.avgWin).toLocaleString()}</span> <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/</span> <span className="sh">${Math.round(Math.abs(view.avgLoss)).toLocaleString()}</span></b><div className="s">Reward : risk {rr ? rr.toFixed(1) : '—'}</div>
        <div className="d-meter"><i style={g((view.avgWin / awl) * 50, 'var(--long-fill)')} /><i style={g((Math.abs(view.avgLoss) / awl) * 50, '#F7A9B5', 1)} /></div></div>
      <div className="d-kpi" data-testid="kpi-streaks"><div className="l">Streaks</div><b className="num">{view.maxWinStreak} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>/</span> {view.maxLossStreak}</b><div className="s">Best win · worst loss run</div>
        <div className="d-meter"><i style={g((view.maxWinStreak / (streakMax * 2)) * 100, 'var(--long-fill)')} /><i style={g((view.maxLossStreak / (streakMax * 2)) * 100, '#F7A9B5', 1)} /></div></div>
      <div className="d-kpi" data-testid="kpi-dd"><div className="l">Max drawdown</div><b className="num sh">{(view.maxDrawdownPct * 100).toFixed(1)}%</b><div className="s">{peakLoss > 0 ? `${money(-peakLoss, 0)} from peak` : 'No drawdown yet'}</div>
        <div className="d-meter"><i style={g(Math.min(view.maxDrawdownPct * 100 * 4, 100), 'var(--short-fill)')} /></div></div>
    </section>
  );
}

// ── Insights list ──────────────────────────────────────────────────────────
const ICON: Record<string, React.ReactNode> = { warning: <IWarn size={16} />, clock: <IAlert size={16} />, calendar: <ICalendar size={16} />, coin: <ITrendUp size={16} />, session: <ISun size={16} />, direction: <ITrendUp size={16} />, target: <ITrendUp size={16} />, trophy: <ITrendUp size={16} /> };
export function InsightList({ insights }: { insights: Insight[] }) {
  const ordered = useMemo(() => {
    const rank = (i: Insight) => (i.tone === 'warning' ? 0 : i.tone === 'loss' ? 1 : 2);
    return [...insights].sort((a, b) => rank(a) - rank(b)).slice(0, 5);
  }, [insights]);
  return (
    <section className="v3-card" aria-labelledby="d-ins-t" data-testid="insights-list">
      <div className="v3-ch"><h3 id="d-ins-t">What your trades say <span>· {insights.length} insight{insights.length === 1 ? '' : 's'}</span></h3><Link href="/analytics">See all <IArrowRight size={14} /></Link></div>
      {ordered.length === 0 ? <div className="d-empty"><b>Not enough trades yet</b>Insights appear after 3 closed trades.</div> : (
        <div className="d-ins">
          {ordered.map(i => {
            const c = i.tone === 'warning' ? 'w' : i.tone === 'loss' ? 'r' : i.tone === 'profit' ? 'g' : 'n';
            return (
              <div key={i.id} className="d-in" data-testid={`insight-${i.id}`}>
                <span className={`ic ${c}`}>{ICON[i.icon]}</span>
                <p>{i.lead ?? i.text}{i.detail && <span>. {i.detail}</span>}</p>
                {i.amount != null ? <b className={`v num ${tone(i.amount)}`}>{moneyShort(i.amount)}</b> : <span />}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── Month calendar ─────────────────────────────────────────────────────────
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function MonthCalendar({ trades }: { trades: Trade[] }) {
  const daily = useMemo(() => dailyPnl(trades), [trades]);
  const latest = useMemo(() => { const k = [...daily.keys()].sort().pop(); return k ? new Date(k + 'T12:00:00') : new Date(); }, [daily]);
  const [cursor, setCursor] = useState(() => new Date(latest.getFullYear(), latest.getMonth(), 1));
  const y = cursor.getFullYear(), m = cursor.getMonth();
  const first = new Date(y, m, 1), lead = (first.getDay() + 6) % 7, daysIn = new Date(y, m + 1, 0).getDate();
  const today = new Date();
  const key = (d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  let monthTotal = 0;
  for (let d = 1; d <= daysIn; d++) monthTotal += daily.get(key(d))?.pnl ?? 0;
  const cells: React.ReactNode[] = [];
  const prevDays = new Date(y, m, 0).getDate();
  for (let i = 0; i < lead; i++) cells.push(<div key={`p${i}`} className="d-day x"><span>{prevDays - lead + 1 + i}</span></div>);
  for (let d = 1; d <= daysIn; d++) {
    const e = daily.get(key(d));
    const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
    cells.push(
      <div key={d} data-has={e ? 1 : 0} className={`d-day ${e ? (e.pnl >= 0 ? 'w' : 'l') : ''} ${isToday ? 't' : ''}`}
        title={e ? `${e.n} trade${e.n === 1 ? '' : 's'} · ${money(e.pnl)}` : undefined}>
        <span>{d}</span>{e && <b className={`num ${tone(e.pnl)}`}><span className="f">{moneyShort(e.pnl)}</span><span className="c">{compact(e.pnl)}</span></b>}
      </div>,
    );
  }
  const trail = (7 - (cells.length % 7)) % 7;
  for (let i = 1; i <= trail; i++) cells.push(<div key={`n${i}`} className="d-day x"><span>{i}</span></div>);
  return (
    <section className="v3-card" aria-labelledby="d-cal-t" data-testid="month-calendar">
      <div className="v3-ch">
        <h3 id="d-cal-t">{first.toLocaleDateString('en-US', { month: 'long' })} <span>· {y}</span></h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>Month <b className={`num ${tone(monthTotal)}`}>{money(monthTotal)}</b></span>
          <div className="v3-seg sm" role="group" aria-label="Change month">
            <button aria-label="Previous month" onClick={() => setCursor(new Date(y, m - 1, 1))}>‹</button>
            <button aria-label="Next month" onClick={() => setCursor(new Date(y, m + 1, 1))}>›</button>
          </div>
        </div>
      </div>
      <div className="d-cal">
        <div className="d-cal-dow">{DOW.map(d => <span key={d}>{d}</span>)}</div>
        <div className="d-cal-grid">{cells}</div>
      </div>
    </section>
  );
}

// ── Recent trades ──────────────────────────────────────────────────────────
export function RecentTrades({ trades, total, loading }: { trades: Trade[]; total: number; loading: boolean }) {
  const router = useRouter();
  return (
    <section className="v3-card" aria-labelledby="d-rt-t" data-testid="recent-trades-card">
      <div className="v3-ch"><h3 id="d-rt-t">Recent trades</h3><Link href="/trades" data-testid="view-all-trades">View all {total} <IArrowRight size={14} /></Link></div>
      {loading ? (
        <div style={{ padding: 22, display: 'grid', gap: 12 }}>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skel d-sk" style={{ height: 22 }} />)}</div>
      ) : trades.length === 0 ? (
        <div className="d-empty" data-testid="recent-empty"><b>No closed positions yet</b>Once trades close on this account, they appear here.</div>
      ) : (
        <table className="d-table">
          <thead><tr><th>Symbol</th><th>Side</th><th className="r">Size</th><th>Closed</th><th className="r">Held</th><th className="r">P&amp;L</th></tr></thead>
          <tbody>
            {trades.map(t => (
              <tr key={t.positionId} onClick={() => router.push(`/trades/${t.positionId}`)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') router.push(`/trades/${t.positionId}`); }}>
                <td><div className="d-sym"><i>{t.symbol.slice(0, 2)}</i>{t.symbol}</div></td>
                <td><span className={`d-side ${t.direction === 'LONG' ? 'L' : 'S'}`}>{t.direction === 'LONG' ? 'Long' : 'Short'}</span></td>
                <td className="r num" style={{ color: 'var(--muted)' }}>{t.volume.toFixed(2)}</td>
                <td style={{ color: 'var(--muted)' }}>{t.closeTime ? new Date(t.closeTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                <td className="r num" style={{ color: 'var(--muted)' }}>{dur(t.durationSecs)}</td>
                <td className={`r num ${tone(t.netPnl)}`} style={{ fontWeight: 700 }}>{money(t.netPnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ── Behaviour ──────────────────────────────────────────────────────────────
export function BehaviourCard({ b }: { b: { winnersHold: number | null; losersHold: number | null; streak: number; streakWin: boolean | null; tilt: number; loggedCount: number } }) {
  const ratio = b.winnersHold && b.losersHold ? b.losersHold / b.winnersHold : null;
  const bad = ratio != null && ratio > 1;
  // Ring shows the share of hold time spent in winners (50% = balanced).
  const share = b.winnersHold != null && b.losersHold != null && b.winnersHold + b.losersHold > 0 ? b.winnersHold / (b.winnersHold + b.losersHold) : null;
  const C = 2 * Math.PI * 42;
  return (
    <section className="v3-card" aria-labelledby="d-beh-t" data-testid="behavior-card">
      <div className="v3-ch"><h3 id="d-beh-t">Behaviour <span>· discipline</span></h3><Link href="/notebook">Journal <IArrowRight size={14} /></Link></div>
      <div className="d-beh">
        <div className="d-beh-head">
          <div className="d-ring" aria-hidden>
            <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" stroke="#EFEEE9" strokeWidth="9" fill="none" />
              <circle className="v" cx="50" cy="50" r="42" stroke={bad ? '#F4435E' : '#6E4BFF'} strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (share ?? 0))} /></svg>
            <b className="num">{share == null ? '—' : `${Math.round(share * 100)}%`}</b>
          </div>
          <div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)' }}>Hold time in winners</div>
            <p style={{ fontSize: 15, fontWeight: 500, marginTop: 4, lineHeight: 1.4 }}>
              {ratio == null ? 'Not enough closed trades yet.' : bad
                ? <>Losers are held <span className="sh">{ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}× longer</span> than winners.</>
                : <>You let <span className="lg">winners run</span> longer than losers.</>}
            </p>
          </div>
        </div>
        <div className="d-sig">
          <div><span>Current streak<small>Consecutive outcomes</small></span><b className={b.streakWin === null ? '' : b.streakWin ? 'lg' : 'sh'}>{b.streakWin === null ? '—' : `${b.streak}${b.streakWin ? 'W' : 'L'}`}</b></div>
          <div><span>Tilt flags<small>{b.loggedCount === 0 ? 'No emotions logged yet' : 'FOMO · revenge · hesitant'}</small></span><b className={b.loggedCount === 0 ? '' : b.tilt > 0 ? 'am' : 'lg'}>{b.loggedCount === 0 ? '—' : b.tilt}</b></div>
          <div><span>Avg hold · winners<small>Time in winning trades</small></span><b className="num">{dur(b.winnersHold)}</b></div>
          <div><span>Avg hold · losers<small>Time in losing trades</small></span><b className={`num ${bad ? 'sh' : ''}`}>{dur(b.losersHold)}</b></div>
        </div>
      </div>
    </section>
  );
}

// ── P&L by weekday ─────────────────────────────────────────────────────────
export function DayBars({ data }: { data: { day: string; netPnl: number; trades: number }[] }) {
  const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const rows = order.map(d => data.find(x => x.day.slice(0, 3) === d) ?? { day: d, netPnl: 0, trades: 0 });
  const mx = Math.max(...rows.map(r => Math.abs(r.netPnl)), 1);
  const hasNeg = rows.some(r => r.netPnl < 0), hasPos = rows.some(r => r.netPnl > 0);
  const k = compact;
  return (
    <section className="v3-card" aria-labelledby="d-day-t" data-testid="byday-card">
      <div className="v3-ch"><h3 id="d-day-t">P&amp;L by day</h3><span style={{ fontSize: 13, color: 'var(--muted)' }}>{rows.reduce((n, r) => n + r.trades, 0)} trades</span></div>
      <div className={`d-bars ${!hasNeg ? 'pos' : !hasPos ? 'neg' : ''}`}>
        {rows.map((r, i) => {
          const h = r.netPnl ? Math.max((Math.abs(r.netPnl) / mx) * 100, 4) : 0;
          const st: CSSProperties = { height: `${h}%`, background: r.netPnl >= 0 ? 'var(--long-fill)' : 'var(--short-fill)', animation: `d-grow 800ms var(--ease-premium) ${i * 60}ms both`, transformOrigin: r.netPnl >= 0 ? 'bottom' : 'top' };
          return (
            <div key={r.day} className="d-col" title={`${r.day}: ${money(r.netPnl)} · ${r.trades} trades`}>
              <div className="t">{r.netPnl > 0 && <div className="stack"><small className="lg num">{k(r.netPnl)}</small><i style={{ ...st, animationName: 'd-growy' }} /></div>}</div>
              <div className="b">{r.netPnl < 0 && <div className="stack"><i style={{ ...st, animationName: 'd-growy' }} /><small className="sh num">{k(r.netPnl)}</small></div>}</div>
              <span>{r.day.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
      <style>{'@keyframes d-growy{from{transform:scaleY(0)}to{transform:none}}'}</style>
    </section>
  );
}

// ── Instruments ────────────────────────────────────────────────────────────
type SortKey = 'pnl' | 'win' | 'trades';
export function Instruments({ data }: { data: AccountStats['bySymbol'] }) {
  const [by, setBy] = useState<SortKey>('pnl');
  const rows = useMemo(() => [...data].sort((a, b) => by === 'pnl' ? b.netPnl - a.netPnl : by === 'win' ? b.winRate - a.winRate : b.trades - a.trades).slice(0, 6), [data, by]);
  const mx = Math.max(...data.map(r => Math.abs(r.netPnl)), 1);
  // Diverging axis only when both signs exist; otherwise use the full track.
  const mixed = data.some(r => r.netPnl < 0) && data.some(r => r.netPnl > 0);
  const half = mixed ? 50 : 100;
  return (
    <section className="v3-card" aria-labelledby="d-ins2-t" data-testid="bysymbol-card">
      <div className="v3-ch"><h3 id="d-ins2-t">Instruments <span className="d-opt">· {data.length} traded</span></h3>
        <div className="v3-seg sm" role="group" aria-label="Sort instruments">
          {([['pnl', 'P&L'], ['win', 'Win rate'], ['trades', 'Trades']] as [SortKey, string][]).map(([k, l]) => <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}>{l}</button>)}
        </div>
      </div>
      <div className="d-instr">
        {rows.map((r, i) => {
          // sqrt scale keeps small P&L visible next to large outliers
          const w = r.netPnl ? Math.max(Math.sqrt(Math.abs(r.netPnl) / mx) * half, 1.2) : 0;
          const anchor = mixed ? '50%' : '0%';
          return (
            <div key={r.symbol} className="d-ir">
              <div>{r.symbol}<small>{r.trades} trades · {(r.winRate * 100).toFixed(0)}% win</small></div>
              <div className={`track ${mixed ? 'mid' : ''}`}><i className={r.netPnl < 0 ? 'neg' : ''} style={{ [r.netPnl >= 0 ? 'left' : 'right']: anchor, width: `${w}%`, background: r.netPnl >= 0 ? 'var(--long-fill)' : 'var(--short-fill)', animationDelay: `${i * 60}ms` }} /></div>
              <b className={`num ${tone(r.netPnl)}`}>{money(r.netPnl)}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}
