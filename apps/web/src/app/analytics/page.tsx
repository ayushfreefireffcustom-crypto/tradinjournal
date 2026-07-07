'use client';

import { Fragment } from 'react';
import { useEffect, useState, useCallback } from 'react';
import { api, type BrokerAccount, type AccountStats, type Trade } from '@/lib/api';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import EquityChart from '@/components/equity-chart';

function stdev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length;
  return Math.sqrt(v);
}

function moneyShort(v: number): string {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return `${sign}$${Math.round(a)}`;
}

function Donut({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return <div className="text-fg-3 text-[12px]">No closed trades</div>;
  const winPct = (wins / total) * 100;
  const R = 56;
  const circ = 2 * Math.PI * R;
  const winDash = (winPct / 100) * circ;
  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5 sm:gap-6">
      <svg width={140} height={140} viewBox="0 0 140 140" className="shrink-0" data-testid="winloss-donut">
        <circle cx={70} cy={70} r={R} fill="none" stroke="#FF3B30" strokeWidth={14} />
        <circle
          cx={70} cy={70} r={R} fill="none" stroke="#00C566" strokeWidth={14}
          strokeDasharray={`${winDash} ${circ}`} strokeDashoffset={circ * 0.25}
          transform="rotate(-90 70 70)"
        />
        <text x={70} y={68} textAnchor="middle" style={{ fontFamily: 'var(--font-display)' }} fontWeight={900} fontSize="28" fill="#fff">{winPct.toFixed(0)}%</text>
        <text x={70} y={88} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)' }} fontSize="9" letterSpacing="2" fill="#71717A">WIN RATE</text>
      </svg>
      <div className="flex flex-col gap-2 text-[12px] w-full sm:w-auto sm:min-w-[160px]">
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-profit" /><span className="text-fg-2">Wins</span><span className="ml-auto font-mono numeric">{wins}</span></div>
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-loss" /><span className="text-fg-2">Losses</span><span className="ml-auto font-mono numeric">{losses}</span></div>
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 border border-border-strong" /><span className="text-fg-2">Total</span><span className="ml-auto font-mono numeric">{total}</span></div>
      </div>
    </div>
  );
}

function HBars({ data, maxLabelWidth = 56 }: { data: { label: string; value: number }[]; maxLabelWidth?: number }) {
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {data.map(d => {
        const pos = d.value >= 0;
        const w = (Math.abs(d.value) / max) * 100;
        return (
          <div key={d.label} className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-[12px]">
            <span className="text-fg-3 text-[10px] tracking-widest uppercase text-right shrink-0" style={{ width: maxLabelWidth }}>{d.label}</span>
            <div className="flex-1 h-5 bg-surface-hover relative min-w-0">
              <div className="h-full transition-all" style={{ width: `${w}%`, background: pos ? '#00C566' : '#FF3B30', opacity: 0.85 }} />
            </div>
            <span className={`numeric font-medium shrink-0 ${pos ? 'text-profit' : 'text-loss'}`} style={{ width: 72, textAlign: 'right' }}>
              {pos ? '+' : ''}${d.value.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PnlDist({ trades }: { trades: Trade[] }) {
  // Real per-trade net P&L distribution (symmetric $ buckets around break-even).
  const pnls = trades.filter(t => t.status === 'CLOSED').map(t => t.netPnl);
  if (pnls.length === 0) return <div className="text-fg-3 text-[12px]">No closed trades yet.</div>;

  const N = 8;
  const absMax = Math.max(...pnls.map(v => Math.abs(v)), 1);
  const lo = -absMax;
  const width = (2 * absMax) / N;
  const buckets = Array.from({ length: N }, (_, i) => {
    const center = lo + (i + 0.5) * width;
    return { l: moneyShort(center), v: 0, loss: center < 0 };
  });
  for (const v of pnls) {
    let idx = Math.floor((v - lo) / width);
    if (idx < 0) idx = 0; else if (idx >= N) idx = N - 1;
    buckets[idx]!.v += 1;
  }
  const total = pnls.length;
  const mode = buckets.reduce((m, b) => (b.v > m.v ? b : m), buckets[0]!);
  const maxV = Math.max(...buckets.map(b => b.v), 1);
  const zeroIdx = 3; // break-even sits on the boundary between bucket 3 and 4
  const expectancy = pnls.reduce((s, v) => s + v, 0) / total;
  const sd = stdev(pnls);
  const best = Math.max(...pnls);
  const worst = Math.min(...pnls);

  const W = 700, H = 240;
  const PAD = { top: 26, right: 14, bottom: 38, left: 14 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const gap = 8;
  const bw = (innerW - gap * (buckets.length - 1)) / buckets.length;
  const scaleY = (v: number) => (v / maxV) * innerH;

  // Gradient definitions for bars
  return (
    <div data-testid="r-distribution">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="barLoss" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#FF3B30" stopOpacity="1" />
            <stop offset="100%" stopColor="#FF3B30" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="barProfit" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#00C566" stopOpacity="1" />
            <stop offset="100%" stopColor="#00C566" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {/* horizontal grid lines */}
        {[0.25, 0.5, 0.75, 1].map(p => (
          <line key={p} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH - innerH * p} y2={PAD.top + innerH - innerH * p} stroke="#1E1E1E" strokeDasharray="2 5" />
        ))}

        {/* Bars */}
        {buckets.map((b, i) => {
          const x = PAD.left + i * (bw + gap);
          const h = scaleY(b.v);
          const y = PAD.top + innerH - h;
          const fill = b.loss ? 'url(#barLoss)' : 'url(#barProfit)';
          const stroke = b.loss ? '#FF3B30' : '#00C566';
          return (
            <g key={b.l}>
              {/* Bar */}
              <rect x={x} y={y} width={bw} height={h} fill={fill} />
              {/* Top edge accent */}
              <line x1={x} x2={x + bw} y1={y} y2={y} stroke={stroke} strokeWidth="1.5" />
              {/* Value label above bar */}
              <text x={x + bw / 2} y={y - 8} textAnchor="middle" fontSize="11" style={{ fontFamily: 'var(--font-mono)' }} fill="#A1A1AA">
                {b.v}
              </text>
              {/* X-axis label */}
              <text x={x + bw / 2} y={H - 18} textAnchor="middle" fontSize="10" style={{ fontFamily: 'var(--font-mono)' }} letterSpacing="1" fill={b.loss ? '#71717A' : '#A1A1AA'}>
                {b.l}
              </text>
              {/* Percentage of sample under label */}
              <text x={x + bw / 2} y={H - 5} textAnchor="middle" fontSize="9" style={{ fontFamily: 'var(--font-mono)' }} fill="#4A4A4A">
                {Math.round((b.v / total) * 100)}%
              </text>
            </g>
          );
        })}

        {/* Zero (break-even) line between losing and winning R buckets */}
        <line
          x1={PAD.left + (zeroIdx + 1) * bw + zeroIdx * gap + gap / 2}
          x2={PAD.left + (zeroIdx + 1) * bw + zeroIdx * gap + gap / 2}
          y1={PAD.top - 12}
          y2={PAD.top + innerH + 4}
          stroke="#FFFFFF" strokeDasharray="3 3" opacity="0.35"
        />
        <text
          x={PAD.left + (zeroIdx + 1) * bw + zeroIdx * gap + gap / 2}
          y={PAD.top - 16}
          textAnchor="middle" fontSize="9" letterSpacing="2" style={{ fontFamily: 'var(--font-mono)' }} fill="#71717A"
        >
          BREAK-EVEN
        </text>

      </svg>

      {/* Stats footer */}
      <div className="mt-4 pt-4 border-t border-border-soft grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { l: 'Expectancy', v: `${expectancy >= 0 ? '+' : '-'}$${Math.abs(expectancy).toFixed(2)}`, c: expectancy >= 0 ? 'text-profit' : 'text-loss' },
          { l: 'Std Dev',    v: `$${sd.toFixed(0)}`, c: '' },
          { l: 'Best',       v: `+$${best.toFixed(0)}`, c: 'text-profit' },
          { l: 'Worst',      v: `$${worst.toFixed(0)}`, c: 'text-loss' },
        ].map(s => (
          <div key={s.l}>
            <div className="text-[10px] tracking-[0.22em] text-fg-3 uppercase">{s.l}</div>
            <div className={`font-display font-black text-[18px] sm:text-xl tracking-tight mt-1 numeric ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] tracking-widest text-fg-3 numeric">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 bg-profit" /> WINNERS · {buckets.filter(b => !b.loss).reduce((s, b) => s + b.v, 0)}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 bg-loss" /> LOSERS · {buckets.filter(b => b.loss).reduce((s, b) => s + b.v, 0)}
        </span>
        <span>MODE · {mode.l}</span>
        <span>SAMPLE · {total} TRADES</span>
      </div>
    </div>
  );
}

function SessionHeatmap({ trades }: { trades: Trade[] }) {
  const sessions = ['ASIA', 'LON', 'NY'] as const;
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const;
  const closed = trades.filter(t => t.status === 'CLOSED');

  // Net P&L by session (UTC open hour) × weekday.
  const data: number[][] = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
  let mapped = 0;
  for (const t of closed) {
    const d = new Date(t.openTime);
    const wd = d.getUTCDay();          // 0 Sun .. 6 Sat
    if (wd < 1 || wd > 5) continue;    // weekday sessions only
    const h = d.getUTCHours();
    const sIdx = (h < 7 || h >= 22) ? 0 : (h < 13 ? 1 : 2);
    data[sIdx]![wd - 1]! += t.netPnl;
    mapped++;
  }
  if (mapped === 0) return <div className="text-fg-3 text-[12px]">No weekday trades to map.</div>;
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i]!.length; j++) data[i]![j] = Math.round(data[i]![j]!);
  }

  const flat = data.flat();
  const max = Math.max(...flat.map(v => Math.abs(v)), 1);
  const rowTotals = data.map(r => r.reduce((s, v) => s + v, 0));
  const colTotals = days.map((_, j) => data.reduce((s, r) => s + r[j]!, 0));
  const total = rowTotals.reduce((s, v) => s + v, 0);

  // Find best cell for callout
  let best = { s: 0, d: 0, v: -Infinity };
  data.forEach((row, i) => row.forEach((v, j) => { if (v > best.v) best = { s: i, d: j, v }; }));

  return (
    <div className="w-full max-w-[520px] mx-auto" data-testid="session-heatmap">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr)) 60px` }}
      >
        {/* Header row */}
        <div />
        {days.map(d => (
          <div key={d} className="text-center text-[9px] sm:text-[10px] tracking-widest text-fg-3 pb-1">{d}</div>
        ))}
        <div className="text-center text-[9px] sm:text-[10px] tracking-widest text-fg-3 pb-1">TOTAL</div>

        {/* Session rows */}
        {sessions.map((s, i) => (
          <Fragment key={s}>
            <div className="text-[10px] tracking-widest text-fg-3 self-center border-r border-border-soft pr-2">{s}</div>
            {data[i]!.map((v, j) => {
              const pos = v >= 0;
              const intensity = Math.min(1, Math.abs(v) / max);
              const bestCell = best.s === i && best.d === j;
              return (
                <div
                  key={j}
                  className={`h-11 sm:h-12 flex items-center justify-center border transition-colors ${bestCell ? 'border-profit' : 'border-border-soft'}`}
                  style={{
                    background: pos
                      ? `rgba(0, 197, 102, ${0.10 + intensity * 0.55})`
                      : `rgba(255, 59, 48, ${0.10 + intensity * 0.55})`,
                  }}
                >
                  <span className={`text-[10px] sm:text-[11px] numeric font-medium ${pos ? 'text-profit' : 'text-loss'}`}>
                    {pos ? '+' : ''}{v}
                  </span>
                </div>
              );
            })}
            {/* Row total */}
            <div className="h-11 sm:h-12 flex items-center justify-center border border-border-soft bg-surface-hover">
              <span className={`text-[11px] numeric font-semibold ${rowTotals[i]! >= 0 ? 'text-profit' : 'text-loss'}`}>
                {rowTotals[i]! >= 0 ? '+' : ''}{rowTotals[i]}
              </span>
            </div>
          </Fragment>
        ))}

        {/* Column totals row */}
        <div className="text-[10px] tracking-widest text-fg-3 self-center border-r border-border-soft pr-2 pt-1">TOT</div>
        {colTotals.map((v, j) => (
          <div key={j} className="h-9 flex items-center justify-center border border-border-soft bg-surface-hover">
            <span className={`text-[10px] sm:text-[11px] numeric font-semibold ${v >= 0 ? 'text-profit' : 'text-loss'}`}>
              {v >= 0 ? '+' : ''}{v}
            </span>
          </div>
        ))}
        <div className="h-9 flex items-center justify-center border border-fg bg-fg text-app">
          <span className="text-[11px] numeric font-bold">{total >= 0 ? '+' : ''}{total}</span>
        </div>
      </div>

      {/* Callouts */}
      <div className="mt-5 pt-4 border-t border-border-soft grid grid-cols-2 gap-3">
        <div className="border-l-2 border-profit pl-3">
          <div className="text-[9px] tracking-[0.22em] text-fg-3 uppercase">BEST SESSION</div>
          <div className="mt-1 font-display font-bold text-[13px] tracking-tight">{sessions[best.s]} · {days[best.d]}</div>
          <div className="text-[11px] text-profit numeric">+${best.v}</div>
        </div>
        <div className="border-l-2 border-loss pl-3">
          <div className="text-[9px] tracking-[0.22em] text-fg-3 uppercase">WORST SESSION</div>
          {(() => {
            let worst = { s: 0, d: 0, v: Infinity };
            data.forEach((row, i) => row.forEach((v, j) => { if (v < worst.v) worst = { s: i, d: j, v }; }));
            return (
              <>
                <div className="mt-1 font-display font-bold text-[13px] tracking-tight">{sessions[worst.s]} · {days[worst.d]}</div>
                <div className="text-[11px] text-loss numeric">${worst.v}</div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);

  const init = useCallback(async () => {
    try {
      const accs = await api.accounts.list();
      setAccounts(accs);
      setSelected(accs[0] ?? null);
    } catch {}
  }, []);
  useEffect(() => { init(); }, [init]);

  const loadStats = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      const [s, t] = await Promise.all([api.trades.stats(acc.id), api.trades.list(acc.id)]);
      setStats(s);
      setTrades(t);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load account data');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (selected) loadStats(selected); }, [selected, loadStats]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => prev.find(a => a.id === account.id) ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev]);
    setSelected(account);
    setShowConnect(false);
  }

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={setSelected}
      onConnectClick={() => setShowConnect(true)}
      pageTitle="Analytics"
      pageSubtitle="// EDGE DISCOVERY"
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto fade-up" data-testid="analytics-page">
        <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] tracking-[0.25em] text-fg-3">[ ANALYTICS // ALL TIME ]</div>
            <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2">DISSECT YOUR EDGE.</h1>
          </div>
        </div>

        {error && !loading ? (
          <div className="border border-loss/30 bg-loss/10 px-4 py-3 flex items-center justify-between gap-3 text-[12px]" data-testid="analytics-error">
            <span className="text-loss">{error}</span>
            <button onClick={() => selected && loadStats(selected)} className="btn btn-ghost py-1.5 text-[10px] shrink-0">RETRY</button>
          </div>
        ) : loading || !stats ? (
          <div className="grid grid-cols-12 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="tcard p-6 col-span-6 lg:col-span-4 h-40 animate-pulse bg-surface" />)}
          </div>
        ) : (
          <>
            {/* Top KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
              {[
                { l: 'NET P&L',        v: `${stats.netPnl >= 0 ? '+' : '-'}$${Math.abs(stats.netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, c: stats.netPnl >= 0 ? 'text-profit' : 'text-loss' },
                { l: 'PROFIT FACTOR',  v: stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2) },
                { l: 'GROSS PROFIT',   v: `+$${stats.grossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, c: 'text-profit' },
                { l: 'GROSS LOSS',     v: `-$${stats.grossLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, c: 'text-loss' },
                { l: 'MAX DD',         v: `${(stats.maxDrawdownPct * 100).toFixed(1)}%`, c: stats.maxDrawdownPct > 0.1 ? 'text-loss' : '' },
              ].map(k => (
                <div key={k.l} className="tcard p-4" data-testid={`kpi-${k.l.toLowerCase().replace(/[^a-z]/g, '')}`}>
                  <div className="text-[10px] tracking-[0.22em] text-fg-3 uppercase">{k.l}</div>
                  <div className={`font-display font-black text-2xl sm:text-3xl tracking-tighter mt-3 numeric ${k.c ?? ''}`}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* Donut + Day */}
            <div className="grid grid-cols-12 gap-3 mb-3">
              <div className="tcard col-span-12 lg:col-span-4 p-5">
                <div className="text-[10px] tracking-[0.25em] text-fg-3">WIN_LOSS_RATIO</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">Strike rate</div>
                <Donut wins={stats.totalWins} losses={stats.totalLosses} />
                <div className="grid grid-cols-2 gap-3 mt-6 pt-5 border-t border-border-soft">
                  {[
                    { l: 'Avg Win',  v: `+$${stats.avgWin.toFixed(2)}`, c: 'text-profit' },
                    { l: 'Avg Loss', v: `$${stats.avgLoss.toFixed(2)}`, c: 'text-loss' },
                    { l: 'Best Trade',  v: `+$${stats.bestTrade.toFixed(2)}`, c: 'text-profit' },
                    { l: 'Worst Trade', v: `$${stats.worstTrade.toFixed(2)}`, c: 'text-loss' },
                  ].map(m => (
                    <div key={m.l}>
                      <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{m.l}</div>
                      <div className={`font-display font-bold text-[18px] tracking-tight mt-0.5 numeric ${m.c}`}>{m.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="tcard col-span-12 lg:col-span-8 p-5">
                <div className="text-[10px] tracking-[0.25em] text-fg-3">PNL_BY_DAY</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">Day of week distribution</div>
                <HBars data={stats.byDay.map(d => ({ label: d.day, value: d.netPnl }))} />
              </div>
            </div>

            {/* R-mult + Session heatmap */}
            <div className="grid grid-cols-12 gap-3 mb-3">
              <div className="tcard col-span-12 lg:col-span-7 p-5">
                <div className="text-[10px] tracking-[0.25em] text-fg-3">PNL_DISTRIBUTION</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">Net P&L per trade</div>
                <PnlDist trades={trades} />
              </div>

              <div className="tcard col-span-12 lg:col-span-5 p-5">
                <div className="text-[10px] tracking-[0.25em] text-fg-3">SESSION_HEATMAP</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">P&L by session × weekday · UTC</div>
                <SessionHeatmap trades={trades} />
              </div>
            </div>

            {/* Drawdown curve */}
            <div className="tcard p-5 mb-3" data-testid="dd-card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.25em] text-fg-3">EQUITY_CURVE</div>
                  <div className="font-display font-bold text-[16px] tracking-tight mt-1">Realised equity vs starting balance</div>
                </div>
                <span className="text-[10px] tracking-widest text-fg-3 border border-border-soft px-2 py-1">
                  PEAK ${Math.max(...stats.equityCurve.map(e => e.equity)).toLocaleString()}
                </span>
              </div>
              <div className="mt-4">
                <EquityChart data={stats.equityCurve} height={260} startingBalance={stats.startingBalance} />
              </div>
            </div>

            {/* Symbol breakdown table */}
            <div className="tcard p-0">
              <div className="px-5 py-4 border-b border-border-soft flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.25em] text-fg-3">PERFORMANCE_BY_SYMBOL</div>
                  <div className="font-display font-bold text-[16px] tracking-tight mt-1">Instrument analytics</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-[12px]">
                  <thead>
                    <tr className="border-b border-border">
                      {['Symbol', 'Trades', 'Wins', 'Losses', 'Win Rate', 'Net P&L', 'Avg P&L'].map(h => (
                        <th key={h} className="px-5 py-2.5 text-left text-[10px] tracking-[0.22em] text-fg-3 uppercase font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.bySymbol.map(s => (
                      <tr key={s.symbol} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                        <td className="px-5 py-3 font-display font-bold tracking-tight">{s.symbol}</td>
                        <td className="px-5 py-3 numeric text-fg-2">{s.trades}</td>
                        <td className="px-5 py-3 numeric text-profit">{s.wins}</td>
                        <td className="px-5 py-3 numeric text-loss">{s.losses}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 text-[10px] tracking-widest border ${s.winRate >= 0.5 ? 'text-profit border-profit/30 bg-profit/10' : 'text-loss border-loss/30 bg-loss/10'}`}>
                            {(s.winRate * 100).toFixed(0)}%
                          </span>
                        </td>
                        <td className={`px-5 py-3 numeric font-medium ${s.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{s.netPnl >= 0 ? '+' : ''}${s.netPnl.toFixed(2)}</td>
                        <td className={`px-5 py-3 numeric ${s.avgPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{s.avgPnl >= 0 ? '+' : ''}${s.avgPnl.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
