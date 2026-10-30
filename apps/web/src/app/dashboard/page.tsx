'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, type BrokerAccount, type AccountStats, type Trade, type JournalEntry } from '@/lib/api';
import { statsForRange, rangeStart, type RangeKey } from '@/lib/stats';
import { useAccounts } from '@/lib/use-accounts';
import { authClient } from '@/lib/auth-client';
import AppShell, { timeAgo } from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { useToast } from '@/components/toast';
import { IPlus } from '@/components/v3/icons';
import {
  BreakdownCard, CoachReview, DailyCard, DeskSkeleton, EquityCard, KpiColumn, RecentTrades,
} from '@/components/v6/desk';

const RANGES: { key: RangeKey; short: string; label: string }[] = [
  { key: '1W', short: '7D', label: 'Last 7 days' },
  { key: '1M', short: '30D', label: 'Last 30 days' },
  { key: '3M', short: '90D', label: 'Last 90 days' },
  { key: '1Y', short: '1Y', label: 'Last 12 months' },
  { key: 'ALL', short: 'All', label: 'All time' },
];

export default function DashboardPage() {
  const { accounts, selected, select, setAccounts, loading: accountsLoading } = useAccounts();
  const { data: session } = authClient.useSession();
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [range, setRange] = useState<RangeKey>('3M');
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
    return trades.filter(t => t.status === 'CLOSED' && t.closeTime && (start === null || new Date(t.closeTime).getTime() >= start));
  }, [trades, range]);

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

  const rangeLabel = RANGES.find(o => o.key === range)!.label;
  const first = (session?.user?.name ?? '').trim().split(/\s+/)[0] || 'trader';
  const everTraded = trades.some(t => t.status === 'CLOSED');
  const subtitle = selected
    ? <>{selected.broker} <span className="m">·{selected.mt5Login.slice(-4)}</span> · {syncedAt ? `synced ${timeAgo(syncedAt)}` : loading ? 'loading…' : 'not synced yet'}</>
    : `Welcome, ${first}`;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => setShowConnect(true)}
      pageTitle="Dashboard" pageSubtitle={subtitle} onSync={() => selected && loadStats(selected, true)} syncing={syncing} syncedAt={syncedAt}
      actions={selected ? (
        <div className="x-seg" role="group" aria-label="Date range" data-testid="range-selector">
          {RANGES.map(r => <button key={r.key} aria-pressed={range === r.key} onClick={() => setRange(r.key)} title={r.label} data-testid={`range-${r.key}`}>{r.short}</button>)}
        </div>
      ) : null}>
      <div className="dk-grid" data-testid="dashboard-page">
        {error && (
          <div className="x-banner x-banner--err" role="alert" data-testid="dashboard-error">
            <span>{error}</span>
            <button className="x-btn x-btn--sm" onClick={() => selected && loadStats(selected)}>Retry</button>
          </div>
        )}

        {!selected && !accountsLoading ? (
          <section className="x-card dk-connect" data-testid="dashboard-empty">
            <div>
              <h2>Connect your MT5 account</h2>
              <p>Use your investor (read-only) password. TRADElogs can read your trades but can never place or close one.</p>
              <ul><li>History imports in about a minute</li><li>New trades sync on their own</li><li>Your dashboard, journal and coach fill in from real trades</li></ul>
              <button className="x-btn x-btn--hi x-btn--lg" onClick={() => setShowConnect(true)} data-testid="dashboard-connect"><IPlus size={15} />Connect MT5</button>
            </div>
            <div className="dk-connect-art" aria-hidden />
          </section>
        ) : !view ? (error ? null : <DeskSkeleton />) : !everTraded ? (
          <section className="x-card x-empty" data-testid="dashboard-waiting">
            <span className="x-ic"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 20h18M6 16v-5M11 16V7M16 16v-8M21 16V4" /></svg></span>
            <b>Waiting for your first closed trade</b>
            <p>{selected?.broker} is connected. As soon as a position closes it shows up here, usually within a few minutes.</p>
          </section>
        ) : (
          <>
            <div className="dk-row1">
              <EquityCard view={view} trades={rangedTrades} rangeLabel={rangeLabel} />
              <KpiColumn view={view} trades={rangedTrades} />
            </div>
            <div className="dk-row2">
              <DailyCard trades={rangedTrades} />
              <BreakdownCard trades={rangedTrades} />
            </div>
            <RecentTrades trades={rangedTrades} journal={journal} balance={view.currentEquity} />
            <CoachReview accountId={selected?.id ?? null} />
          </>
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
