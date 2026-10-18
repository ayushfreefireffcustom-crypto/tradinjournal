'use client';

// Broker management — the "connections hub". A hero header with summary stat
// cards (total brokers / total balance / active connections), a searchable
// broker list with per-account balance/equity/P&L pulled from the stats API, a
// dashed add-new card, and a security reassurance strip. The account cap (2) is
// enforced by the backend; the UI disables adding once the limit is hit.

import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import UpdateBrokerPasswordModal from '@/components/update-broker-password-modal';
import ConfirmDialog from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { useAccounts } from '@/lib/use-accounts';
import { api, type BrokerAccount, type AccountStats } from '@/lib/api';
import { IPlus, ISearch, IClose } from '@/components/v3/icons';

const MAX_ACCOUNTS = 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtMoney = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtSigned = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 14) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

const monogram = (broker: string) =>
  broker.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'MT';

interface AccountFigures { balance: number; equity: number; pnl: number }

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BrokersPage() {
  const { accounts, selected, select, setAccounts, loading } = useAccounts();
  const toast = useToast();
  const [showConnect, setShowConnect] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BrokerAccount | null>(null);
  const [pendingPasswordUpdate, setPendingPasswordUpdate] = useState<BrokerAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState('');
  const [figures, setFigures] = useState<Record<string, AccountFigures | null>>({});

  const atLimit = accounts.length >= MAX_ACCOUNTS;

  // Fetch balance/equity/P&L for each connected account (parallel, tolerant of
  // per-account failures → that row simply shows em-dashes).
  useEffect(() => {
    let cancelled = false;
    accounts.forEach(acc => {
      if (figures[acc.id] !== undefined) return;
      api.trades.stats(acc.id)
        .then((s: AccountStats) => {
          if (cancelled) return;
          setFigures(prev => ({
            ...prev,
            [acc.id]: { balance: s.startingBalance + s.netPnl, equity: s.currentEquity, pnl: s.netPnl },
          }));
        })
        .catch(() => { if (!cancelled) setFigures(prev => ({ ...prev, [acc.id]: null })); });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => (prev.find(a => a.id === account.id) ? prev.map(a => (a.id === account.id ? account : a)) : [account, ...prev]));
    select(account);
    setShowConnect(false);
    toast.success(`Connected · ${account.broker} #${account.mt5Login}`);
  }

  function onCredentialsUpdated(account: BrokerAccount) {
    setAccounts(prev => prev.map(a => (a.id === account.id ? account : a)));
    // Re-fetch this account's figures now that syncing works again.
    setFigures(prev => { const next = { ...prev }; delete next[account.id]; return next; });
    setPendingPasswordUpdate(null);
    toast.success(`Password updated · ${account.broker} #${account.mt5Login}`);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.accounts.delete(pendingDelete.id);
      setAccounts(prev => prev.filter(a => a.id !== pendingDelete.id));
      toast.success(`Removed · ${pendingDelete.broker} #${pendingDelete.mt5Login}`);
      setPendingDelete(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Could not remove account');
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a =>
      a.broker.toLowerCase().includes(q) || a.mt5Login.includes(q) || a.server.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  const totalBalance = accounts.reduce((sum, a) => sum + (figures[a.id]?.balance ?? 0), 0);
  const figuresReady = accounts.length > 0 && accounts.every(a => figures[a.id] !== undefined);
  const activeCount = accounts.filter(a => a.status?.toUpperCase() !== 'DISCONNECTED').length;

  const allOk = activeCount === accounts.length;
  const KeyIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3" /></svg>;
  const BinIcon = () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></svg>;

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => { if (!atLimit) setShowConnect(true); }} crumbParent="Account" pageTitle="Brokers">
      <div className="v3-page" data-testid="brokers-page">
        <section className="br-hero">
          <div>
            <span>Manage connections</span>
            <h1><b>Your</b> <em>brokers.</em></h1>
            <p>Read-only MT5 connections and account limits.</p>
          </div>
          <button onClick={() => setShowConnect(true)} disabled={atLimit} data-testid="brokers-add" title={atLimit ? 'Account limit reached — remove one to add another' : undefined} className="br-add">
            <span>Add broker</span><span className="ar"><IPlus size={15} /></span>
          </button>
        </section>

        <div className="br-sum" data-testid="brokers-summary">
          <div className="v3-card"><span>Total brokers</span><b className="num">{accounts.length}</b><small>Connected account{accounts.length === 1 ? '' : 's'}</small></div>
          <div className="v3-card"><span>Total balance</span><b className="num">{figuresReady ? fmtMoney(totalBalance) : accounts.length === 0 ? '$0.00' : <span className="skel d-sk" style={{ display: 'inline-block', width: 160, height: 30 }} />}</b><small>Across all accounts</small></div>
          <div className="v3-card"><span>Active connections</span><b className="num">{activeCount} / {MAX_ACCOUNTS}</b><small className={accounts.length === 0 ? '' : allOk ? 'ok' : 'warn'}>{accounts.length === 0 ? 'No brokers yet' : allOk ? 'All systems operational' : 'Attention needed'}</small></div>
        </div>

        <section className="v3-card br-list" data-testid="brokers-list" aria-labelledby="br-t">
          <div className="br-list-hd">
            <h3 id="br-t">Your brokers</h3>
            {accounts.length > 1 && (
              <label className="v3-field br-search"><ISearch size={16} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search brokers…" data-testid="brokers-search" />
                {query && <button aria-label="Clear" onClick={() => setQuery('')}><IClose size={14} /></button>}
              </label>
            )}
          </div>
          {loading ? (
            <div style={{ padding: 22, display: 'grid', gap: 12 }}>{[0, 1].map(i => <div key={i} className="skel d-sk" style={{ height: 86, borderRadius: 16 }} />)}</div>
          ) : (
            <>
              {filtered.length === 0 && accounts.length > 0 && <div className="d-empty" data-testid="brokers-no-results">No brokers match “{query}”.</div>}
              {filtered.map(acc => {
                const fig = figures[acc.id];
                const connected = acc.status?.toUpperCase() !== 'DISCONNECTED';
                const val = (v: string | undefined) => (v ?? (fig === null ? '—' : <span className="skel d-sk" style={{ display: 'inline-block', width: 90, height: 18 }} />));
                return (
                  <div key={acc.id} className={`br-row ${connected ? '' : 'off'}`} data-testid={`brokers-account-${acc.mt5Login}`}>
                    <span className="br-mono">{monogram(acc.broker)}</span>
                    <div className="br-id">
                      <div className="t"><b>{acc.broker}</b><span className="num">#{acc.mt5Login}</span>{connected ? <span className="v3-pill g"><i />Active</span> : <span className="v3-pill r">Disconnected</span>}</div>
                      <small>{acc.server} · {acc.baseCurrency} · connected {timeAgo(acc.createdAt)}</small>
                    </div>
                    <div className="br-fig"><span>Balance</span><b className="num">{val(fig ? fmtMoney(fig.balance) : undefined)}</b></div>
                    <div className="br-fig"><span>Equity</span><b className="num">{val(fig ? fmtMoney(fig.equity) : undefined)}</b></div>
                    <div className="br-fig"><span>P&amp;L</span><b className={`num ${fig ? (fig.pnl >= 0 ? 'lg' : 'sh') : ''}`}>{val(fig ? fmtSigned(fig.pnl) : undefined)}</b></div>
                    <div className="br-fig br-st"><span>Status</span><b className={connected ? 'lg' : 'sh'}><i />{connected ? 'Connected' : 'Disconnected'}</b></div>
                    <div className="br-acts">
                      <button onClick={() => setPendingPasswordUpdate(acc)} aria-label={`Update password for ${acc.broker} #${acc.mt5Login}`} data-testid={`brokers-update-password-${acc.mt5Login}`} title="Update MT5 password"><KeyIcon /></button>
                      <button onClick={() => setPendingDelete(acc)} aria-label={`Remove ${acc.broker} #${acc.mt5Login}`} data-testid={`brokers-delete-${acc.mt5Login}`} title="Remove broker" className="del"><BinIcon /></button>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => { if (!atLimit) setShowConnect(true); }} disabled={atLimit} data-testid="brokers-add-card" className="br-new">
                <span className="pl"><IPlus size={18} /></span>
                <span><b>{atLimit ? 'Broker limit reached' : accounts.length === 0 ? 'Connect your first broker' : 'Add another broker'}</b>
                  <small>{atLimit ? `You're using ${accounts.length} of ${MAX_ACCOUNTS} broker slots. Remove one to connect another account.` : 'Investor (read-only) credentials — trades sync within a minute.'}</small></span>
              </button>
            </>
          )}
        </section>
      </div>

      {showConnect && (
        <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />
      )}
      {pendingPasswordUpdate && (
        <UpdateBrokerPasswordModal
          account={pendingPasswordUpdate}
          onClose={() => setPendingPasswordUpdate(null)}
          onUpdated={onCredentialsUpdated}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title="Remove this broker?"
          message={`${pendingDelete.broker} #${pendingDelete.mt5Login} will be disconnected and its synced data removed. You can re-connect it later.`}
          confirmLabel="Remove broker"
          danger
          loading={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </AppShell>
  );
}
