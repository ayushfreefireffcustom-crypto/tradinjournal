'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, type BrokerAccount, type AccountStats, type Trade, type JournalEntry } from '@/lib/api';
import { statsForRange, rangeStart, RANGES, type RangeKey } from '@/lib/stats';
import { buildInsights } from '@/lib/insights';
import { useAccounts } from '@/lib/use-accounts';
import { authClient } from '@/lib/auth-client';
import AppShell, { timeAgo } from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { useToast } from '@/components/toast';
import AiReportCard from '@/components/ai-report-card';
import { IPlus, ISync } from '@/components/v3/icons';
import {
  HeroPnl, ReviewCard, KpiStrip, InsightList, MonthCalendar, RecentTrades, BehaviourCard, DayBars, Instruments,
} from '@/components/v3/dashboard-parts';

const NEGATIVE_EMOTIONS = ['FOMO', 'Revenge', 'Hesitant'];
const RANGE_LABEL: Record<RangeKey, string> = { '1W': 'last 7 days', '1M': 'last 30 days', '3M': 'last 3 months', '1Y': 'last 12 months', ALL: 'all time' };

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function DashboardPage() {
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const { data: session } = authClient.useSession();
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [range, setRange] = useState<RangeKey>('ALL');
  const [loading, setLoading] = useState(true);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [, tick] = useState(0);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const toast = useToast();

  const view = useMemo(() => (stats ? statsForRange(trades, stats.startingBalance, range) : null), [stats, trades, range]);
  const rangedTrades = useMemo(() => {
    const start = rangeStart(range);
    return trades
      .filter(t => t.status === 'CLOSED' && t.closeTime && (start === null || new Date(t.closeTime).getTime() >= start))
      .sort((a, b) => +new Date(b.closeTime!) - +new Date(a.closeTime!));
  }, [trades, range]);
  const rangedTradeIds = useMemo(() => new Set(rangedTrades.map(t => t.positionId)), [rangedTrades]);
  const insights = useMemo(() => (view ? buildInsights(view, rangedTrades, journal) : []), [view, rangedTrades, journal]);

  const loadStats = useCallback(async (acc: BrokerAccount, notify = false) => {
    setLoading(true);
    setError('');
    try {
      // Manual "Sync" pulls new deals from MT5 first; normal loads read stored data
      // (the server refreshes it in the background when it's a few minutes old).
      let syncedAccount = acc;
      let still = false;
      if (notify) {
        const r = await api.accounts.sync(acc.id);
        syncedAccount = r.account;
        still = r.result === 'running';
      }
      const { stats: s, trades: t, journal: j, syncedAt: at } = await api.trades.dashboard(acc.id);
      setStats(s); setTrades(t); setJournal(j);
      setSyncedAt(at ?? syncedAccount.lastSyncAt ?? new Date().toISOString());
      if (notify && still) toast.success('Still importing your history — this can take a minute on large accounts');
      else if (notify) toast.success(`Synced · ${t.filter(x => x.status === 'CLOSED').length} positions loaded`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load account data';
      setError(msg);
      if (notify) toast.error(`Sync failed · ${msg}`);
    } finally { setLoading(false); }
  }, [toast]);
  // No account (brand-new user): stop loading once accounts settle.
  useEffect(() => {
    if (selected) loadStats(selected);
    else if (!accountsLoading) setLoading(false);
  }, [selected, accountsLoading, loadStats]);
  // Keep "Synced X ago" fresh.
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(id); }, []);

  const behaviour = useMemo(() => {
    const winners = rangedTrades.filter(t => t.netPnl > 0);
    const losers = rangedTrades.filter(t => t.netPnl <= 0);
    const avgHold = (arr: Trade[]) => {
      const d = arr.filter(t => t.durationSecs != null);
      return d.length ? d.reduce((s, t) => s + (t.durationSecs ?? 0), 0) / d.length : null;
    };
    let streak = 0;
    let streakWin: boolean | null = null;
    for (const t of rangedTrades) {
      const win = t.netPnl > 0;
      if (streakWin === null) { streakWin = win; streak = 1; } else if (win === streakWin) streak++; else break;
    }
    const logged = journal.filter(e => e.emotion && (!e.tradeId || rangedTradeIds.has(e.tradeId)));
    const tilt = logged.filter(e => NEGATIVE_EMOTIONS.includes(e.emotion!)).length;
    return { winnersHold: avgHold(winners), losersHold: avgHold(losers), streak, streakWin, tilt, loggedCount: logged.length };
  }, [rangedTrades, rangedTradeIds, journal]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => (prev.some(a => a.id === account.id) ? prev.map(a => (a.id === account.id ? account : a)) : [account, ...prev]));
    select(account);
    setShowConnect(false);
  }

  const first = (session?.user?.name ?? '').trim().split(/\s+/)[0] || 'trader';
  const atLimit = accounts.length >= 2;

  const rangeSeg = (where: 'top' | 'page') => (
    <div className={`v3-seg d-range d-range--${where}`} role="group" aria-label="Date range" data-testid={where === 'top' ? 'range-selector' : 'range-selector-m'}>
      {RANGES.map(r => (
        <button key={r} aria-pressed={range === r} onClick={() => setRange(r)} data-testid={where === 'top' ? `range-${r}` : undefined}>{r === 'ALL' ? 'All' : r}</button>
      ))}
    </div>
  );

  const actions = (
    <>
      {rangeSeg('top')}
      {syncedAt && <span className="d-synced">Synced {timeAgo(syncedAt).toLowerCase()}</span>}
      <button className="v3-btn v3-btn--o d-sync" onClick={() => selected && loadStats(selected, true)} disabled={loading || !selected} aria-busy={loading} data-testid="header-sync-now">
        <ISync size={16} className={loading ? 'spin' : undefined} /><span>{loading ? 'Syncing' : 'Sync'}</span>
      </button>
      <button className="v3-btn v3-btn--ink d-add" onClick={() => setShowConnect(true)} disabled={atLimit}
        title={atLimit ? 'Account limit reached — remove one in Brokers' : undefined} data-testid="header-add-broker">
        <span>Add broker</span><span className="ar"><IPlus size={14} /></span>
      </button>
    </>
  );

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)} pageTitle="Dashboard" actions={actions}>
      <div className="v3-page" data-testid="dashboard-page">
        <header className="d-head">
          <h1 className="v3-h1"><b>{greeting()}, {first}.</b> Here&rsquo;s how your trading is <em>really</em> going.</h1>
          <p className="v3-sub">
            {selected ? `${selected.broker} · ` : ''}
            {view ? `${view.totalTrades} closed trade${view.totalTrades === 1 ? '' : 's'} · ${RANGE_LABEL[range]}` : loading ? 'Loading your account…' : 'No broker connected yet'}
          </p>
          {rangeSeg('page')}
        </header>

        {error && (
          <div className="d-err" role="alert" data-testid="dashboard-error">
            <span>{error}</span>
            <button className="v3-btn v3-btn--o" onClick={() => selected && loadStats(selected)}>Retry</button>
          </div>
        )}

        {!selected && !accountsLoading ? (
          <section className="v3-card d-empty d-empty--lg" data-testid="dashboard-empty">
            <b>Connect your MT5 account</b>
            Your trades sync automatically and your dashboard fills in within a minute.
            <button className="v3-btn v3-btn--ink" style={{ marginTop: 18 }} onClick={() => setShowConnect(true)}><span>Connect MT5</span><span className="ar"><IPlus size={14} /></span></button>
          </section>
        ) : !view ? (
          <div className="d-grid">
            <div className="d-grid d-r1"><div className="skel d-sk" style={{ height: 400, borderRadius: 24 }} /><div className="skel d-sk" style={{ height: 400, borderRadius: 20 }} /></div>
            <div className="skel d-sk" style={{ height: 150, borderRadius: 20 }} />
            <div className="d-grid d-r3"><div className="skel d-sk" style={{ height: 420, borderRadius: 20 }} /><div className="skel d-sk" style={{ height: 420, borderRadius: 20 }} /></div>
          </div>
        ) : (
          <div className="d-grid">
            <div className="d-grid d-r1">
              <HeroPnl view={view} trades={rangedTrades} />
              <ReviewCard view={view} insights={insights} rangeLabel={RANGE_LABEL[range][0]!.toUpperCase() + RANGE_LABEL[range].slice(1)} />
            </div>
            <KpiStrip view={view} />
            <div className="d-grid d-r3">
              <InsightList insights={insights} />
              <MonthCalendar trades={rangedTrades} />
            </div>
            <AiReportCard accountId={selected?.id ?? null} />
            <div className="d-grid d-r4">
              <RecentTrades trades={rangedTrades.slice(0, 6)} total={rangedTrades.length} loading={loading && !rangedTrades.length} />
              <BehaviourCard b={behaviour} />
            </div>
            <div className="d-grid d-r5">
              <DayBars data={view.byDay} />
              <Instruments data={view.bySymbol} />
            </div>
          </div>
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
