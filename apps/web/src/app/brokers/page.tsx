'use client';

// Broker connections: one card per MT5 account (status, last sync, balance /
// equity / P&L from the stats API, update-password and remove actions), plus an
// "add broker" slot that explains itself once the account cap (2) is reached.
// The cap is enforced by the backend; the UI only mirrors it.

import { useEffect, useMemo, useState } from 'react';
import AppShell, { timeAgo as syncAgo } from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import UpdateBrokerPasswordModal from '@/components/update-broker-password-modal';
import ConfirmDialog from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { useAccounts } from '@/lib/use-accounts';
import { api, type BrokerAccount, type AccountStats } from '@/lib/api';
import { IPlus, ISearch, IClose, ILock } from '@/components/v3/icons';
import '@/styles/v6/account.css';

const MAX_ACCOUNTS = 2;

const fmtMoney = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtSigned = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function connectedAgo(iso: string): string {
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

const IKey = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l3 3" /></svg>;
const IBin = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></svg>;

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
  // per-account failures → that card simply shows em-dashes).
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
  const allFailed = accounts.length > 0 && accounts.every(a => figures[a.id] === null);
  const activeCount = accounts.filter(a => a.status?.toUpperCase() !== 'DISCONNECTED').length;
  const allOk = activeCount === accounts.length;
  const limitNote = `You're using ${accounts.length} of ${MAX_ACCOUNTS} broker slots. Remove an account to connect another.`;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} onConnectClick={() => { if (!atLimit) setShowConnect(true); }}
      pageTitle="Brokers" pageSubtitle="Read-only MT5 connections"
      actions={
        <button onClick={() => setShowConnect(true)} disabled={atLimit} data-testid="brokers-add" title={atLimit ? 'Account limit reached. Remove one to add another.' : undefined} className="x-btn x-btn--hi">
          <IPlus size={15} />Add broker
        </button>
      }>
      <div className="x-page" data-testid="brokers-page">
        <div className="x-strip x-strip--card ac-br-sum" data-testid="brokers-summary">
          <div><span>Broker slots</span><b className="m">{accounts.length} / {MAX_ACCOUNTS}</b></div>
          <div><span>Total balance</span><b className="m">{accounts.length === 0 || allFailed ? '—' : figuresReady ? fmtMoney(totalBalance) : <i className="x-skel x-skel--in ac-skel-num" />}</b></div>
          <div><span>Connections</span>
            <b className="ac-br-state">{accounts.length === 0 ? <><i className="x-dot x-dot--off" />None yet</> : allOk ? <><i className="x-dot" />All connected</> : <><i className="x-dot x-dot--r" />Needs attention</>}</b>
          </div>
        </div>

        {atLimit && (
          <div className="x-banner ac-br-limit" data-testid="brokers-limit">
            <ILock size={15} />
            <span>{limitNote}</span>
          </div>
        )}

        <section className="ac-br" data-testid="brokers-list" aria-label="Your brokers">
          {accounts.length > 1 && (
            <div className="ac-br-tools">
              <label className="x-search ac-br-search">
                <ISearch size={15} />
                <input className="x-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search brokers" aria-label="Search brokers" data-testid="brokers-search" />
                {query && <button type="button" className="ac-search-x" aria-label="Clear" onClick={() => setQuery('')}><IClose size={13} /></button>}
              </label>
            </div>
          )}
          {loading ? (
            <div className="ac-br-grid">{[0, 1].map(i => <div key={i} className="x-skel ac-br-skel" />)}</div>
          ) : (
            <>
              {filtered.length === 0 && accounts.length > 0 && <div className="x-card x-empty" data-testid="brokers-no-results"><p>No brokers match &ldquo;{query}&rdquo;.</p></div>}
              <div className="ac-br-grid">
                {filtered.map(acc => {
                  const fig = figures[acc.id];
                  const connected = acc.status?.toUpperCase() !== 'DISCONNECTED';
                  const failing = connected && !!acc.lastSyncError;
                  const val = (v: string | undefined) => (v ?? (fig === null ? '—' : <i className="x-skel x-skel--in ac-skel-fig" />));
                  return (
                    <article key={acc.id} className={`x-card ac-acct ${connected ? '' : 'off'}`} data-testid={`brokers-account-${acc.mt5Login}`}>
                      <header className="ac-acct-h">
                        <span className="x-mk ac-acct-mk">{monogram(acc.broker)}</span>
                        <div className="ac-acct-id">
                          <b>{acc.broker} <span className="m x-muted">#{acc.mt5Login}</span></b>
                          <small>{acc.server} · {acc.baseCurrency}</small>
                        </div>
                        <span className={`x-tag ${connected && !failing ? 'x-tag--g' : 'x-tag--r'} ac-acct-st`}>
                          <i className={`x-dot ${connected && !failing ? '' : 'x-dot--r'}`} />{!connected ? 'Disconnected' : failing ? 'Sync failing' : 'Connected'}
                        </span>
                      </header>
                      <div className="x-strip ac-figs">
                        <div><span>Balance</span><b className="m">{val(fig ? fmtMoney(fig.balance) : undefined)}</b></div>
                        <div><span>Equity</span><b className="m">{val(fig ? fmtMoney(fig.equity) : undefined)}</b></div>
                        <div><span>Net P&amp;L</span><b className={`m ${fig ? (fig.pnl >= 0 ? 'pos' : 'neg') : ''}`}>{val(fig ? fmtSigned(fig.pnl) : undefined)}</b></div>
                      </div>
                      {acc.lastSyncError && <p className="ac-acct-err" role="status">{acc.lastSyncError}</p>}
                      <footer className="ac-acct-f">
                        <span className="ac-acct-sync">Synced {syncAgo(acc.lastSyncAt)} · connected {connectedAgo(acc.createdAt)}</span>
                        <span className="ac-acct-acts">
                          <button className="x-btn x-btn--sm" onClick={() => setPendingPasswordUpdate(acc)} aria-label={`Update password for ${acc.broker} #${acc.mt5Login}`} data-testid={`brokers-update-password-${acc.mt5Login}`} title="Update MT5 password"><IKey />Password</button>
                          <button className="x-btn x-btn--sm x-btn--ghost ac-del" onClick={() => setPendingDelete(acc)} aria-label={`Remove ${acc.broker} #${acc.mt5Login}`} data-testid={`brokers-delete-${acc.mt5Login}`} title="Remove broker"><IBin />Remove</button>
                        </span>
                      </footer>
                    </article>
                  );
                })}
                <button onClick={() => { if (!atLimit) setShowConnect(true); }} disabled={atLimit} aria-disabled={atLimit} data-testid="brokers-add-card" className={`ac-br-new ${atLimit ? 'full' : ''}`}>
                  <span className="ac-br-new-ic">{atLimit ? <ILock size={18} /> : <IPlus size={18} />}</span>
                  <b>{atLimit ? 'Broker limit reached' : accounts.length === 0 ? 'Connect your first broker' : 'Add another broker'}</b>
                  <small>{atLimit ? `${accounts.length} of ${MAX_ACCOUNTS} slots used` : 'Investor (read-only) credentials. Trades sync within a minute.'}</small>
                </button>
              </div>
            </>
          )}
        </section>

        <p className="ac-br-note"><ILock size={14} />TRADElogs only reads your MT5 history. It can never place trades or move funds.</p>
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
