'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, type BrokerAccount, type AccountStats, type Trade, type JournalEntry } from '@/lib/api';
import { statsForRange, rangeStart, type RangeKey } from '@/lib/stats';
import { buildInsights } from '@/lib/insights';
import { useAccounts } from '@/lib/use-accounts';
import { authClient } from '@/lib/auth-client';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { useToast } from '@/components/toast';
import {
  CoachReview, DashSkeleton, EdgeCard, HelloCard, PerformanceCard, RangeMenu, WeekCard,
} from '@/components/v6/dashboard';

const RANGE_OPTIONS: { key: RangeKey; label: string; short: string }[] = [
  { key: '1W', label: 'Last 7 days', short: '7D' },
  { key: '1M', label: 'Last 30 days', short: '30D' },
  { key: '3M', label: 'Last 3 months', short: '3M' },
  { key: '1Y', label: 'Last 12 months', short: '1Y' },
  { key: 'ALL', label: 'All time', short: 'All' },
];

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
  const [syncing, setSyncing] = useState(false);
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
    if (notify) setSyncing(true);
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
    } finally { setLoading(false); setSyncing(false); }
  }, [toast]);
  // No account (brand-new user): stop loading once accounts settle.
  useEffect(() => {
    if (selected) loadStats(selected);
    else if (!accountsLoading) setLoading(false);
  }, [selected, accountsLoading, loadStats]);
  // Keep "Synced X ago" fresh.
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 30_000); return () => clearInterval(id); }, []);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => (prev.some(a => a.id === account.id) ? prev.map(a => (a.id === account.id ? account : a)) : [account, ...prev]));
    select(account);
    setShowConnect(false);
  }

  const first = (session?.user?.name ?? '').trim().split(/\s+/)[0] || 'trader';
  const rangeLabel = RANGE_OPTIONS.find(o => o.key === range)!.label;
  const hasTrades = !!view && view.totalTrades > 0;

  return (
    <AppShell frame="v6" accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)}
      pageTitle="Dashboard" onSync={() => selected && loadStats(selected, true)} syncing={syncing} syncedAt={syncedAt}
      actions={selected ? <RangeMenu value={range} options={RANGE_OPTIONS} onChange={setRange} /> : null}>
      <div data-testid="dashboard-page">
        {error && (
          <div className="x-err" role="alert" data-testid="dashboard-error">
            <span>{error}</span>
            <button className="x-btn" onClick={() => selected && loadStats(selected)}>Retry</button>
          </div>
        )}

        {selected && !view && !error ? <DashSkeleton /> : (
          <div className="x-grid">
            <HelloCard wide={!hasTrades} greeting={greeting()} name={first} account={selected} view={view} trades={trades} journal={journal}
              rangeLabel={rangeLabel} onConnect={() => setShowConnect(true)} />
            {hasTrades && view && selected && (
              <>
                <WeekCard trades={trades} insight={insights[0] ?? null} />
                <EdgeCard trades={rangedTrades} rangeLabel={rangeLabel} />
                <PerformanceCard view={view} trades={rangedTrades} broker={selected.broker} rangeLabel={rangeLabel} />
                <CoachReview accountId={selected.id} />
              </>
            )}
          </div>
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
