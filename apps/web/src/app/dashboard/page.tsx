'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, type BrokerAccount, type AccountStats, type Trade, type JournalEntry } from '@/lib/api';
import { statsForRange, rangeStart, RANGES, type RangeKey } from '@/lib/stats';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import EquityChart from '@/components/equity-chart';
import DrawdownChart from '@/components/drawdown-chart';
import DashboardCalendar from '@/components/dashboard-calendar';
import YearHeatmap from '@/components/year-heatmap';
import { StatCard, TwinBars } from '@/components/stat-card';
import AnimatedNumber from '@/components/animated-number';
import { useToast } from '@/components/toast';
import InsightsStrip from '@/components/insights-strip';
import EmptyState from '@/components/empty-state';
import { Receipt } from '@phosphor-icons/react';

const NEGATIVE_EMOTIONS = ['FOMO', 'Revenge', 'Hesitant'];

function fmtDur(s: number) {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}
function usd(v: number) { return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }

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
              <div className="w-full rounded-sm transition-all" style={{ height: `${h}%`, background: pos ? '#08C465' : '#FE3A31' }} />
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
  const toast = useToast();

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
      setSelected(accs[0] ?? null);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadStats = useCallback(async (acc: BrokerAccount, notify = false) => {
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
      if (notify) toast.success(`Synced · ${t.filter(x => x.status === 'CLOSED').length} positions loaded`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load account data';
      setError(msg);
      if (notify) toast.error(`Sync failed · ${msg}`);
    } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { if (selected) loadStats(selected); }, [selected, loadStats]);

  const behaviour = useMemo(() => {
    const closed = rangedTrades;
    const winners = closed.filter(t => t.netPnl > 0);
    const losers = closed.filter(t => t.netPnl <= 0);
    const avgHold = (arr: Trade[]) => {
      const withDur = arr.filter(t => t.durationSecs != null);
      return withDur.length ? withDur.reduce((s, t) => s + (t.durationSecs ?? 0), 0) / withDur.length : null;
    };
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
    return { winnersHold: avgHold(winners), losersHold: avgHold(losers), streak, streakWin, tilt, loggedCount: logged.length };
  }, [rangedTrades, rangedTradeIds, journal]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => {
      const e = prev.find(a => a.id === account.id);
      return e ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev];
    });
    setSelected(account);
    setShowConnect(false);
  }

  // ── derived values for the KPI cards ──
  const winPct = view ? view.winRate * 100 : 0;
  const expectancy = view && view.totalTrades > 0 ? view.netPnl / view.totalTrades : 0;
  const avgWin = view?.avgWin ?? 0;
  const avgLoss = view?.avgLoss ?? 0; // negative
  const awlMax = Math.max(avgWin, Math.abs(avgLoss), 1);
  const longPnl = view?.byDirection.long.netPnl ?? 0;
  const shortPnl = view?.byDirection.short.netPnl ?? 0;
  const lsMax = Math.max(Math.abs(longPnl), Math.abs(shortPnl), 1);
  // Cumulative net-P&L trend (equity above starting balance) for the KPI sparkline.
  const cumSpark = view ? view.equityCurve.map(p => p.equity - view.startingBalance) : undefined;
  const streakMax = Math.max(view?.maxWinStreak ?? 0, view?.maxLossStreak ?? 0, 1);
  const holdMax = Math.max(behaviour.winnersHold ?? 0, behaviour.losersHold ?? 0, 1);

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
            <div className="text-[10px] tracking-[0.2em] text-fg-3 truncate uppercase">{selected?.broker} · #{selected?.mt5Login}</div>
            <h1 className={`font-display font-black text-3xl sm:text-4xl lg:text-5xl tracking-tight mt-2 break-words numeric ${view ? (view.netPnl >= 0 ? 'text-profit' : 'text-loss') : 'text-fg'}`}>
              {view ? (
                <AnimatedNumber
                  value={view.netPnl}
                  format={n => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                />
              ) : '—'}
              <span className={`ml-3 text-sm sm:text-base align-middle font-sans font-semibold tracking-normal ${view && view.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                {view ? `${view.netPnl >= 0 ? '▲' : '▼'} NET P&L` : ''}
              </span>
            </h1>
            <div className="text-[10px] sm:text-[11px] text-fg-3 tracking-wide mt-1 numeric break-words uppercase">
              {view ? `Starting $${view.startingBalance.toLocaleString()} → Current $${view.currentEquity.toLocaleString()}` : 'Loading…'}
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button onClick={() => setShowConnect(true)} className="btn btn-ghost flex-1 sm:flex-none justify-center" data-testid="header-add-broker">+ ADD BROKER</button>
            <button onClick={() => selected && loadStats(selected, true)} disabled={loading || !selected} className={`btn btn-primary flex-1 sm:flex-none justify-center ${loading ? 'opacity-70 cursor-wait' : ''}`} data-testid="header-sync-now">
              {loading ? 'SYNCING…' : 'SYNC NOW'}
            </button>
          </div>
        </div>

        {error && (
          <div className="border border-loss/30 bg-loss/10 rounded-lg px-4 py-3 mb-4 flex items-center justify-between gap-3 text-[12px]" data-testid="dashboard-error">
            <span className="text-loss">{error}</span>
            <button onClick={() => selected && loadStats(selected)} className="btn btn-ghost py-1.5 text-[10px] shrink-0">RETRY</button>
          </div>
        )}

        {/* Range selector (segmented) */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Range</span>
          <div className="seg" data-testid="range-selector">
            {RANGES.map(r => (
              <button key={r} onClick={() => setRange(r)} data-testid={`range-${r}`} data-active={range === r} className="seg-item">{r}</button>
            ))}
          </div>
        </div>

        {/* KPI row — 5 rich cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-3">
          <StatCard testId="kpi-winrate" index={0} label="Win Rate" value={view ? `${winPct.toFixed(1)}%` : '—'} count={view ? winPct : undefined} format={n => `${n.toFixed(1)}%`} sub={view ? `${view.totalWins}W / ${view.totalLosses}L` : undefined} accent={view && view.winRate >= 0.5 ? 'profit' : 'loss'}>
            {view && <TwinBars rows={[
              { label: 'W', value: String(view.totalWins), pct: winPct, color: 'profit' },
              { label: 'L', value: String(view.totalLosses), pct: 100 - winPct, color: 'loss' },
            ]} />}
          </StatCard>

          <StatCard testId="kpi-avgwl" index={1} label="Avg Win / Loss" value={view ? usd(expectancy) : '—'} count={view ? expectancy : undefined} format={usd} sub="Per trade" accent={expectancy >= 0 ? 'profit' : 'loss'}>
            {view && <TwinBars rows={[
              { label: 'W', value: `$${avgWin.toFixed(0)}`, pct: (avgWin / awlMax) * 100, color: 'profit' },
              { label: 'L', value: `$${Math.abs(avgLoss).toFixed(0)}`, pct: (Math.abs(avgLoss) / awlMax) * 100, color: 'loss' },
            ]} />}
          </StatCard>

          <StatCard testId="kpi-longshort" index={2} label="Long vs Short" value={view ? usd(longPnl + shortPnl) : '—'} count={view ? longPnl + shortPnl : undefined} format={usd} sub="Total P&L" accent={longPnl + shortPnl >= 0 ? 'profit' : 'loss'} spark={cumSpark}>
            {view && <TwinBars rows={[
              { label: 'L', value: usd(longPnl), pct: (Math.abs(longPnl) / lsMax) * 100, color: longPnl >= 0 ? 'profit' : 'loss' },
              { label: 'S', value: usd(shortPnl), pct: (Math.abs(shortPnl) / lsMax) * 100, color: shortPnl >= 0 ? 'profit' : 'loss' },
            ]} />}
          </StatCard>

          <StatCard testId="kpi-streaks" index={3} label="Max Streaks" value={view ? `${view.maxWinStreak} / ${view.maxLossStreak}` : '—'} sub="Best win / loss run" accent="neutral">
            {view && <TwinBars rows={[
              { label: 'W', value: `${view.maxWinStreak}`, pct: (view.maxWinStreak / streakMax) * 100, color: 'profit' },
              { label: 'L', value: `${view.maxLossStreak}`, pct: (view.maxLossStreak / streakMax) * 100, color: 'loss' },
            ]} />}
          </StatCard>

          <StatCard testId="kpi-duration" index={4} label="Avg Duration" value={view ? fmtDur(view.avgDurationSecs) : '—'} sub="Avg per trade" accent="neutral">
            {view && behaviour.winnersHold != null && behaviour.losersHold != null && (
              <TwinBars rows={[
                { label: 'W', value: fmtDur(behaviour.winnersHold), pct: (behaviour.winnersHold / holdMax) * 100, color: 'profit' },
                { label: 'L', value: fmtDur(behaviour.losersHold), pct: (behaviour.losersHold / holdMax) * 100, color: 'loss' },
              ]} />
            )}
          </StatCard>
        </div>

        {/* Auto insights */}
        {view && <InsightsStrip stats={view} trades={rangedTrades} journal={journal} />}

        {/* Main grid */}
        <div className="grid grid-cols-12 gap-3">
          {/* Equity */}
          <div className="tcard col-span-12 lg:col-span-8 p-5" data-testid="equity-card">
            <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Equity curve</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-2">Account equity</div>
            {view && <EquityChart data={view.equityCurve} height={260} startingBalance={view.startingBalance} />}
          </div>

          {/* Drawdown (real widget replacing synthetic score) */}
          <div className="tcard col-span-12 lg:col-span-4 p-5 flex flex-col" data-testid="drawdown-card">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Drawdown</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1">Underwater curve</div>
              </div>
              <div className="text-right">
                <div className="font-display font-black text-2xl tracking-tight numeric text-loss">{view ? `${(view.maxDrawdownPct * 100).toFixed(1)}%` : '—'}</div>
                <div className="text-[9px] tracking-widest text-fg-3 uppercase">Max</div>
              </div>
            </div>
            <div className="mt-auto pt-4">{view && <DrawdownChart equityCurve={view.equityCurve} height={150} />}</div>
          </div>

          {/* Calendar with weekly column */}
          <div className="col-span-12">
            {view && <DashboardCalendar trades={rangedTrades} />}
          </div>

          {/* Year consistency heatmap */}
          <div className="col-span-12">
            {view && <YearHeatmap trades={trades} />}
          </div>

          {/* Recent fills */}
          <div className="tcard col-span-12 lg:col-span-8 p-0" data-testid="recent-trades-card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border-soft">
              <div>
                <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Recent fills</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1">Last {recent.length} positions</div>
              </div>
              <a href="/trades" className="text-[10px] tracking-[0.2em] text-fg-3 hover:text-fg focus-ring rounded px-1 uppercase" data-testid="view-all-trades">View all →</a>
            </div>
            <div>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="px-5 py-4 border-b border-border-soft last:border-0"><div className="h-3 w-32 shimmer" /></div>
                ))
              ) : recent.length === 0 ? (
                <EmptyState icon={Receipt} title="No closed positions yet" hint="Once trades close on this account, your latest fills appear here." testId="recent-empty" />
              ) : (
                recent.map(t => {
                  const pos = t.netPnl >= 0;
                  return (
                    <div key={t.positionId} className="row-interactive flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-5 py-3 border-b border-border-soft last:border-0" style={{ ['--row-accent' as string]: pos ? 'var(--color-profit)' : 'var(--color-loss)' }}>
                      <span className={`text-[10px] tracking-[0.2em] shrink-0 ${t.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}>{t.direction === 'LONG' ? '↗ L' : '↘ S'}</span>
                      <span className="font-semibold tracking-tight">{t.symbol}</span>
                      <span className="text-[11px] text-fg-2 numeric">{t.volume.toFixed(2)} lots</span>
                      <span className="text-[10px] sm:text-[11px] text-fg-3 numeric">{new Date(t.openTime).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })} · {fmtDur(t.durationSecs ?? 0)}</span>
                      <div className="ml-auto text-right">
                        <div className={`font-display font-bold text-[14px] sm:text-[15px] tracking-tight numeric ${pos ? 'text-profit' : 'text-loss'}`}>{pos ? '+' : ''}${t.netPnl.toFixed(2)}</div>
                        <div className="text-[9px] sm:text-[10px] text-fg-3 tracking-widest numeric">{t.entryPrice.toFixed(4)} → {t.exitPrice?.toFixed(4)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Behaviour */}
          <div className="tcard col-span-12 lg:col-span-4 p-5" data-testid="behavior-card">
            <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Behaviour</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-4">Discipline signals</div>
            <div className="space-y-3">
              {[
                { l: 'Current streak', v: behaviour.streakWin === null ? '—' : `${behaviour.streak}${behaviour.streakWin ? 'W' : 'L'}`, t: behaviour.streakWin === null ? 'neutral' : behaviour.streakWin ? 'profit' : 'loss', s: 'consecutive outcomes' },
                { l: 'Tilt flags', v: behaviour.loggedCount === 0 ? '—' : String(behaviour.tilt), t: behaviour.tilt > 0 ? 'warning' : 'profit', s: behaviour.loggedCount === 0 ? 'no emotions logged' : 'fomo · revenge · hesitant' },
                { l: 'Avg hold · winners', v: behaviour.winnersHold != null ? fmtDur(behaviour.winnersHold) : '—', t: 'neutral', s: 'time in winning trades' },
                { l: 'Avg hold · losers', v: behaviour.losersHold != null ? fmtDur(behaviour.losersHold) : '—', t: behaviour.winnersHold != null && behaviour.losersHold != null && behaviour.losersHold > behaviour.winnersHold ? 'loss' : 'neutral', s: 'time in losing trades' },
              ].map(row => (
                <div key={row.l} className="flex items-center justify-between border-b border-border-soft pb-3 last:border-0 last:pb-0">
                  <div>
                    <div className="text-[12px]">{row.l}</div>
                    <div className="text-[10px] text-fg-3 tracking-wide uppercase">{row.s}</div>
                  </div>
                  <div className={`font-display font-black text-2xl tracking-tight numeric ${row.t === 'profit' ? 'text-profit' : row.t === 'warning' ? 'text-warning' : row.t === 'loss' ? 'text-loss' : 'text-fg'}`}>{row.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Day of week */}
          <div className="tcard col-span-12 md:col-span-6 lg:col-span-4 p-5" data-testid="byday-card">
            <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">P&L by day</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-4">Day of week</div>
            {view && <MiniBars data={view.byDay} />}
          </div>

          {/* By symbol */}
          {view && view.bySymbol.length > 0 && (
            <div className="tcard col-span-12 md:col-span-6 lg:col-span-8 p-0" data-testid="bysymbol-card">
              <div className="px-5 py-4 border-b border-border-soft flex items-center justify-between">
                <div>
                  <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Performance by symbol</div>
                  <div className="font-display font-bold text-[16px] tracking-tight mt-1">Instrument breakdown</div>
                </div>
                <span className="text-[10px] tracking-widest text-fg-3 numeric">{view.bySymbol.length} INSTRUMENTS</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[12px]">
                  <thead>
                    <tr className="border-b border-border">
                      {['Symbol', 'Trades', 'Win Rate', 'Net P&L', 'Avg P&L'].map(h => (
                        <th key={h} className="px-5 py-2.5 text-left text-[10px] tracking-[0.18em] text-fg-3 uppercase font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.bySymbol.map(s => (
                      <tr key={s.symbol} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                        <td className="px-5 py-3 font-semibold tracking-tight">{s.symbol}</td>
                        <td className="px-5 py-3 numeric text-fg-2">{s.trades}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] tracking-widest border numeric ${s.winRate >= 0.5 ? 'text-profit border-profit/30 bg-profit/10' : 'text-loss border-loss/30 bg-loss/10'}`}>{(s.winRate * 100).toFixed(0)}%</span>
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
