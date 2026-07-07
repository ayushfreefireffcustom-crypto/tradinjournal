'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, type BrokerAccount, type AccountStats, type Trade, type JournalEntry } from '@/lib/api';
import { statsForRange, rangeStart, RANGES, type RangeKey } from '@/lib/stats';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import EquityChart from '@/components/equity-chart';

const NEGATIVE_EMOTIONS = ['FOMO', 'Revenge', 'Hesitant'];

function fmtDur(s: number) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}

function KpiTile({
  label, value, sub, accent, testId,
}: { label: string; value: string; sub?: string; accent?: 'profit' | 'loss' | 'warning'; testId?: string }) {
  const color = accent === 'profit' ? 'text-profit' : accent === 'loss' ? 'text-loss' : accent === 'warning' ? 'text-warning' : 'text-fg';
  return (
    <div className="tcard tcard-hover p-4" data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.22em] text-fg-3 uppercase">{label}</span>
        <span className="text-fg-3 text-[10px]">●</span>
      </div>
      <div className={`font-display font-black text-2xl sm:text-3xl tracking-tighter mt-3 numeric ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-fg-3 tracking-widest mt-1 numeric">{sub}</div>}
    </div>
  );
}

function MiniBars({ data }: { data: { day: string; netPnl: number }[] }) {
  const max = Math.max(...data.map(d => Math.abs(d.netPnl)), 1);
  return (
    <div className="flex items-end gap-2 h-24">
      {data.map(d => {
        const pos = d.netPnl >= 0;
        const h = Math.max(2, (Math.abs(d.netPnl) / max) * 100);
        return (
          <div key={d.day} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full relative flex items-end h-20">
              <div
                className="w-full transition-all"
                style={{ height: `${h}%`, background: pos ? '#00C566' : '#FF3B30' }}
              />
            </div>
            <div className="text-[9px] tracking-widest text-fg-3 uppercase">{d.day}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function DashboardPage() {
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [range, setRange] = useState<RangeKey>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);

  // Range-filtered view drives the KPIs, equity curve and behaviour signals.
  const view = useMemo(
    () => (stats ? statsForRange(trades, stats.startingBalance, range) : null),
    [stats, trades, range],
  );
  const rangedTrades = useMemo(() => {
    const start = rangeStart(range);
    return trades.filter(t => t.status === 'CLOSED' && t.closeTime && (start === null || new Date(t.closeTime).getTime() >= start));
  }, [trades, range]);
  const rangedTradeIds = useMemo(() => new Set(rangedTrades.map(t => t.positionId)), [rangedTrades]);
  const recent = useMemo(() => rangedTrades.slice(0, 6), [rangedTrades]);

  const load = useCallback(async () => {
    try {
      const accs = await api.accounts.list();
      setAccounts(accs);
      const first = accs[0] ?? null;
      setSelected(first);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadStats = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      const [s, t, j] = await Promise.all([
        api.trades.stats(acc.id),
        api.trades.list(acc.id),
        api.journal.list(acc.id),
      ]);
      setStats(s);
      setTrades(t);
      setJournal(j);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load account data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (selected) loadStats(selected); }, [selected, loadStats]);

  // Real behavioural signals derived from the range's closed trades + logged
  // journal entries linked to those trades.
  const behaviour = useMemo(() => {
    const closed = rangedTrades;
    const winners = closed.filter(t => t.netPnl > 0);
    const losers = closed.filter(t => t.netPnl <= 0);
    const avgHold = (arr: Trade[]) => {
      const withDur = arr.filter(t => t.durationSecs != null);
      return withDur.length ? withDur.reduce((s, t) => s + (t.durationSecs ?? 0), 0) / withDur.length : null;
    };

    // Current win/loss streak, most-recent close first
    const byClose = [...closed].sort((a, b) => +new Date(b.closeTime!) - +new Date(a.closeTime!));
    let streak = 0;
    let streakWin: boolean | null = null;
    for (const t of byClose) {
      const win = t.netPnl > 0;
      if (streakWin === null) { streakWin = win; streak = 1; }
      else if (win === streakWin) { streak++; }
      else break;
    }

    const logged = journal.filter(e => e.emotion && (!e.tradeId || rangedTradeIds.has(e.tradeId)));
    const tilt = logged.filter(e => NEGATIVE_EMOTIONS.includes(e.emotion!)).length;

    return {
      winnersHold: avgHold(winners),
      losersHold: avgHold(losers),
      streak,
      streakWin,
      tilt,
      loggedCount: logged.length,
    };
  }, [rangedTrades, rangedTradeIds, journal]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => {
      const e = prev.find(a => a.id === account.id);
      return e ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev];
    });
    setSelected(account);
    setShowConnect(false);
  }

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={setSelected}
      onConnectClick={() => setShowConnect(true)}
      pageTitle="Dashboard"
      pageSubtitle="// SESSION OVERVIEW"
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto fade-up" data-testid="dashboard-page">
        {/* Header strip */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.25em] text-fg-3 truncate">[ ACCOUNT // {selected?.broker.toUpperCase()} · #{selected?.mt5Login} ]</div>
            <h1 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl tracking-tighter mt-2 break-words">
              {view ? (view.netPnl >= 0 ? '+' : '') + `$${Math.abs(view.netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
              <span className={`ml-3 text-sm sm:text-base align-middle ${view && view.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                {view ? `${view.netPnl >= 0 ? '▲' : '▼'} NET P&L` : ''}
              </span>
            </h1>
            <div className="text-[10px] sm:text-[11px] text-fg-3 tracking-widest mt-1 numeric break-words">
              {view ? `STARTING $${view.startingBalance.toLocaleString()} → CURRENT $${view.currentEquity.toLocaleString()}` : 'Loading...'}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button onClick={() => setShowConnect(true)} className="btn btn-ghost flex-1 sm:flex-none justify-center" data-testid="header-add-broker">+ ADD BROKER</button>
            <button className="btn btn-primary flex-1 sm:flex-none justify-center" data-testid="header-sync-now">SYNC NOW</button>
          </div>
        </div>

        {error && (
          <div className="border border-loss/30 bg-loss/10 px-4 py-3 mb-4 flex items-center justify-between gap-3 text-[12px]" data-testid="dashboard-error">
            <span className="text-loss">{error}</span>
            <button onClick={() => selected && loadStats(selected)} className="btn btn-ghost py-1.5 text-[10px] shrink-0">RETRY</button>
          </div>
        )}

        {/* Range selector */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] tracking-[0.22em] text-fg-3">RANGE</span>
          <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1" data-testid="range-selector">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                data-testid={`range-${r}`}
                className={`shrink-0 px-3 py-1 text-[10px] tracking-[0.22em] border ${range === r ? 'border-fg text-fg bg-surface' : 'border-border-soft text-fg-3 hover:text-fg hover:border-border-strong'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <KpiTile testId="kpi-winrate" label="Win Rate" value={view ? `${(view.winRate * 100).toFixed(1)}%` : '—'} sub={view ? `${view.totalWins}W / ${view.totalLosses}L` : undefined} accent={view && view.winRate >= 0.5 ? 'profit' : 'loss'} />
          <KpiTile testId="kpi-pf"      label="Profit Factor" value={view ? (view.profitFactor >= 999 ? '∞' : view.profitFactor.toFixed(2)) : '—'} sub={view ? `GROSS +$${view.grossProfit.toLocaleString()}` : undefined} accent={view && view.profitFactor >= 1.5 ? 'profit' : view && view.profitFactor >= 1 ? undefined : 'loss'} />
          <KpiTile testId="kpi-dd"      label="Max Drawdown" value={view ? `${(view.maxDrawdownPct * 100).toFixed(1)}%` : '—'} sub={view ? `WORST $${view.worstTrade.toFixed(0)}` : undefined} accent={view && view.maxDrawdownPct > 0.1 ? 'loss' : undefined} />
          <KpiTile
            testId="kpi-expectancy"
            label="Expectancy"
            value={view && view.totalTrades > 0 ? `${view.netPnl / view.totalTrades >= 0 ? '+' : '-'}$${Math.abs(view.netPnl / view.totalTrades).toFixed(2)}` : '—'}
            sub="AVG NET / TRADE"
            accent={view && view.netPnl >= 0 ? 'profit' : 'loss'}
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-12 gap-3">
          {/* Equity */}
          <div className="tcard col-span-12 lg:col-span-8 p-5" data-testid="equity-card">
            <div className="flex items-center justify-between mb-1">
              <div>
                <div className="text-[10px] tracking-[0.25em] text-fg-3">EQUITY_CURVE</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1">Account equity</div>
              </div>
            </div>
            {view && <EquityChart data={view.equityCurve} height={260} startingBalance={view.startingBalance} />}
          </div>

          {/* Behavioural panel — derived from real trades + journal entries */}
          <div className="tcard col-span-12 lg:col-span-4 p-5" data-testid="behavior-card">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">BEHAVIOUR</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-4">Discipline signals</div>

            <div className="space-y-3">
              {[
                {
                  l: 'Current streak',
                  v: behaviour.streakWin === null ? '—' : `${behaviour.streak}${behaviour.streakWin ? 'W' : 'L'}`,
                  t: behaviour.streakWin === null ? 'neutral' : behaviour.streakWin ? 'profit' : 'loss',
                  s: 'consecutive outcomes',
                },
                {
                  l: 'Tilt flags',
                  v: behaviour.loggedCount === 0 ? '—' : String(behaviour.tilt),
                  t: behaviour.tilt > 0 ? 'warning' : 'profit',
                  s: behaviour.loggedCount === 0 ? 'no emotions logged' : 'fomo · revenge · hesitant',
                },
                {
                  l: 'Avg hold · winners',
                  v: behaviour.winnersHold != null ? fmtDur(behaviour.winnersHold) : '—',
                  t: 'neutral',
                  s: 'time in winning trades',
                },
                {
                  l: 'Avg hold · losers',
                  v: behaviour.losersHold != null ? fmtDur(behaviour.losersHold) : '—',
                  t: behaviour.winnersHold != null && behaviour.losersHold != null && behaviour.losersHold > behaviour.winnersHold ? 'loss' : 'neutral',
                  s: 'time in losing trades',
                },
              ].map(row => (
                <div key={row.l} className="flex items-center justify-between border-b border-border-soft pb-3 last:border-0 last:pb-0">
                  <div>
                    <div className="text-[12px]">{row.l}</div>
                    <div className="text-[10px] text-fg-3 tracking-widest uppercase">{row.s}</div>
                  </div>
                  <div className={`font-display font-black text-2xl tracking-tight numeric ${row.t === 'profit' ? 'text-profit' : row.t === 'warning' ? 'text-warning' : row.t === 'loss' ? 'text-loss' : 'text-fg'}`}>
                    {row.v}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By day */}
          <div className="tcard col-span-12 md:col-span-6 lg:col-span-4 p-5" data-testid="byday-card">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">P&L_BY_DAY</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-4">Day of week</div>
            {view && <MiniBars data={view.byDay} />}
          </div>

          {/* Recent trades */}
          <div className="tcard col-span-12 lg:col-span-8 p-0" data-testid="recent-trades-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
              <div>
                <div className="text-[10px] tracking-[0.25em] text-fg-3">RECENT_FILLS</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1">Last {recent.length} positions</div>
              </div>
              <a href="/trades" className="text-[10px] tracking-[0.22em] text-fg-3 hover:text-fg" data-testid="view-all-trades">VIEW ALL →</a>
            </div>
            <div>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="px-5 py-4 border-b border-border-soft last:border-0">
                    <div className="h-3 w-32 bg-surface-hover" />
                  </div>
                ))
              ) : recent.length === 0 ? (
                <div className="px-5 py-10 text-center text-fg-3 text-[12px]">No closed positions yet.</div>
              ) : (
                recent.map(t => {
                  const pos = t.netPnl >= 0;
                  return (
                    <div key={t.positionId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-3 border-b border-border-soft last:border-0 hover:bg-surface-hover transition-colors">
                      <span className={`text-[10px] tracking-[0.22em] shrink-0 ${t.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}>
                        {t.direction === 'LONG' ? '↗ L' : '↘ S'}
                      </span>
                      <span className="font-display font-bold tracking-tight">{t.symbol}</span>
                      <span className="text-[11px] text-fg-2 numeric">{t.volume.toFixed(2)} lots</span>
                      <span className="text-[10px] sm:text-[11px] text-fg-3 numeric">
                        {new Date(t.openTime).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} · {fmtDur(t.durationSecs ?? 0)}
                      </span>
                      <div className="ml-auto text-right">
                        <div className={`font-display font-bold text-[14px] sm:text-[15px] tracking-tight numeric ${pos ? 'text-profit' : 'text-loss'}`}>
                          {pos ? '+' : ''}${t.netPnl.toFixed(2)}
                        </div>
                        <div className="text-[9px] sm:text-[10px] text-fg-3 tracking-widest numeric">
                          {t.entryPrice.toFixed(4)} → {t.exitPrice?.toFixed(4)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* By symbol */}
          {view && view.bySymbol.length > 0 && (
            <div className="tcard col-span-12 p-0" data-testid="bysymbol-card">
              <div className="px-5 py-4 border-b border-border-soft flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.25em] text-fg-3">PERFORMANCE_BY_SYMBOL</div>
                  <div className="font-display font-bold text-[16px] tracking-tight mt-1">Instrument breakdown</div>
                </div>
                <span className="text-[10px] tracking-widest text-fg-3">{view.bySymbol.length} INSTRUMENTS</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[12px]">
                  <thead>
                    <tr className="border-b border-border">
                      {['Symbol', 'Trades', 'Win Rate', 'Net P&L', 'Avg P&L'].map(h => (
                        <th key={h} className="px-5 py-2.5 text-left text-[10px] tracking-[0.22em] text-fg-3 uppercase font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.bySymbol.map(s => (
                      <tr key={s.symbol} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                        <td className="px-5 py-3 font-display font-bold tracking-tight">{s.symbol}</td>
                        <td className="px-5 py-3 numeric text-fg-2">{s.trades}</td>
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
          )}
        </div>
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
