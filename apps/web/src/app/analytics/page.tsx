'use client';

import { Fragment } from 'react';
import { useEffect, useState, useCallback } from 'react';
import { api, type BrokerAccount, type AccountStats } from '@/lib/api';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import EquityChart from '@/components/equity-chart';

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
        <text x={70} y={68} textAnchor="middle" fontFamily="Cabinet Grotesk" fontWeight={900} fontSize="28" fill="#fff">{winPct.toFixed(0)}%</text>
        <text x={70} y={88} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" letterSpacing="2" fill="#71717A">WIN RATE</text>
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

function RDist() {
  // Synthetic R-multiple distribution
  const buckets = [
    { l: '-3R', v: 2,  loss: true },
    { l: '-2R', v: 5,  loss: true },
    { l: '-1R', v: 14, loss: true },
    { l:  '0R', v: 4,  loss: true },
    { l: '+1R', v: 18, loss: false },
    { l: '+2R', v: 16, loss: false },
    { l: '+3R', v: 11, loss: false },
    { l: '+4R', v: 6,  loss: false },
    { l: '+5R', v: 2,  loss: false },
  ];
  const max = Math.max(...buckets.map(b => b.v));
  return (
    <div className="flex items-end gap-2 h-44" data-testid="r-distribution">
      {buckets.map(b => (
        <div key={b.l} className="flex-1 flex flex-col items-center justify-end gap-2">
          <span className="text-[10px] text-fg-2 numeric">{b.v}</span>
          <div className="w-full" style={{ height: `${(b.v / max) * 100}%`, background: b.loss ? '#FF3B30' : '#00C566', opacity: 0.85 }} />
          <span className="text-[9px] tracking-widest text-fg-3 numeric">{b.l}</span>
        </div>
      ))}
    </div>
  );
}

function SessionGrid() {
  const sessions = ['ASIA', 'LON', 'NY'];
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  // Deterministic synthetic grid
  const data = [
    [120, 240, -80, 180, 60],
    [-40, 320, 410, 220, 90],
    [180, -120, 280, 150, 340],
  ];
  const max = 410;
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `32px repeat(${days.length}, minmax(0, 1fr))` }} data-testid="session-heatmap">
      <div />
      {days.map(d => <div key={d} className="text-center text-[9px] sm:text-[10px] tracking-widest text-fg-3">{d}</div>)}
      {sessions.map((s, i) => (
        <Fragment key={s}>
          <div className="text-[9px] sm:text-[10px] tracking-widest text-fg-3 self-center">{s}</div>
          {data[i]!.map((v, j) => {
            const pos = v >= 0;
            const intensity = Math.min(1, Math.abs(v) / max);
            return (
              <div key={j} className="aspect-square flex items-center justify-center border border-border-soft" style={{
                background: pos
                  ? `rgba(0, 197, 102, ${0.12 + intensity * 0.6})`
                  : `rgba(255, 59, 48, ${0.12 + intensity * 0.6})`,
              }}>
                <span className={`text-[9px] sm:text-[11px] numeric font-medium ${pos ? 'text-profit' : 'text-loss'}`}>{pos ? '+' : ''}{v}</span>
              </div>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(false);

  const init = useCallback(async () => {
    try {
      const accs = await api.accounts.list();
      setAccounts(accs);
      setSelected(accs[0] ?? null);
    } catch {}
  }, []);
  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      setLoading(true);
      try { setStats(await api.trades.stats(selected.id)); }
      finally { setLoading(false); }
    })();
  }, [selected]);

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
          <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 w-full sm:w-auto">
            {['1W', '1M', '3M', '1Y', 'ALL'].map((t, i) => (
              <button key={t} className={`shrink-0 px-3 py-1.5 text-[10px] tracking-[0.22em] border ${i === 4 ? 'border-fg text-fg bg-surface' : 'border-border-soft text-fg-3 hover:text-fg hover:border-border-strong'}`}>{t}</button>
            ))}
          </div>
        </div>

        {loading || !stats ? (
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
                <div className="text-[10px] tracking-[0.25em] text-fg-3">R_MULTIPLE_DISTRIBUTION</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">Edge in R-multiples</div>
                <RDist />
                <div className="mt-3 flex items-center justify-between text-[10px] tracking-widest text-fg-3 numeric">
                  <span>EXPECTANCY · +0.78R</span>
                  <span>SAMPLE · {stats.totalTrades} TRADES</span>
                </div>
              </div>

              <div className="tcard col-span-12 lg:col-span-5 p-5">
                <div className="text-[10px] tracking-[0.25em] text-fg-3">SESSION_HEATMAP</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">P&L by session × day</div>
                <SessionGrid />
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
