'use client';

// Broker management: view connected MT5 accounts, add a new one, or remove an
// existing one. The account cap (2) is enforced by the backend; the UI reflects
// it with a clear disclaimer and disables "Add" once the limit is hit.

import { useState } from 'react';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import ConfirmDialog from '@/components/confirm-dialog';
import EmptyState from '@/components/empty-state';
import { useToast } from '@/components/toast';
import { useAccounts } from '@/lib/use-accounts';
import { api, type BrokerAccount } from '@/lib/api';
import { Bank, Trash, Plus, Info } from '@phosphor-icons/react';

const MAX_ACCOUNTS = 2;

export default function BrokersPage() {
  const { accounts, selected, select, setAccounts, loading } = useAccounts();
  const toast = useToast();
  const [showConnect, setShowConnect] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BrokerAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const atLimit = accounts.length >= MAX_ACCOUNTS;

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => (prev.find(a => a.id === account.id) ? prev.map(a => (a.id === account.id ? account : a)) : [account, ...prev]));
    select(account);
    setShowConnect(false);
    toast.success(`Connected · ${account.broker} #${account.mt5Login}`);
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

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={select}
      onConnectClick={() => { if (!atLimit) setShowConnect(true); }}
      pageTitle="Brokers"
      pageSubtitle="// CONNECTED ACCOUNTS"
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-[900px] mx-auto fade-up" data-testid="brokers-page">
        <div className="mb-6">
          <div className="text-[10px] tracking-[0.25em] text-fg-3">[ BROKERS // CONNECTED ACCOUNTS ]</div>
          <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2">BROKERS</h1>
        </div>

        {/* MT5 bridge status */}
        <div className="tcard p-4 mb-5 flex items-center gap-3" data-testid="brokers-bridge">
          <span className="w-2 h-2 rounded-full bg-profit pulse-dot shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] tracking-[0.22em] text-fg-3">MT5 BRIDGE</div>
            <div className="text-[12px] text-fg-2">Online · read-only sync</div>
          </div>
          <div className="ml-auto text-[10px] tracking-[0.2em] text-fg-3 numeric" data-testid="brokers-count">
            {accounts.length} / {MAX_ACCOUNTS} CONNECTED
          </div>
        </div>

        {/* Max-2 disclaimer */}
        <div
          className="mb-5 flex items-start gap-2.5 border border-border-soft bg-surface/50 px-4 py-3 text-[12px] text-fg-2"
          data-testid="brokers-disclaimer"
        >
          <Info size={16} weight="bold" className="text-profit shrink-0 mt-px" />
          <span>You can connect a maximum of <span className="text-fg font-semibold">2 broker accounts</span>. To link a different one once you&apos;re at the limit, remove an existing account first.</span>
        </div>

        {/* Connected brokers */}
        <div className="tcard p-5" data-testid="brokers-list">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">CONNECTED BROKERS</div>
            <button
              onClick={() => setShowConnect(true)}
              disabled={atLimit}
              data-testid="brokers-add"
              title={atLimit ? 'Account limit reached — remove one to add another' : undefined}
              className={`btn btn-primary flex items-center gap-2 shrink-0 ${atLimit ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Plus size={14} weight="bold" /> ADD BROKER
            </button>
          </div>

          {loading ? (
            <div className="h-20 rounded-md bg-surface animate-pulse" />
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={Bank}
              title="No brokers connected"
              hint="Connect your MT5 account to start importing trades. You can link up to two accounts."
              testId="brokers-empty"
              action={
                <button onClick={() => setShowConnect(true)} className="btn btn-primary" data-testid="brokers-empty-add">
                  + ADD BROKER
                </button>
              }
            />
          ) : (
            <div className="flex flex-col gap-2">
              {accounts.map(acc => (
                <div
                  key={acc.id}
                  data-testid={`brokers-account-${acc.mt5Login}`}
                  className="flex items-center gap-3 border border-border-soft p-3"
                >
                  <div className="w-9 h-9 bg-surface-hover border border-border flex items-center justify-center text-[11px] font-bold shrink-0">
                    {acc.broker.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'MT'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] truncate">{acc.broker} · #{acc.mt5Login}</div>
                    <div className="text-[10px] tracking-[0.16em] text-fg-3 uppercase truncate">
                      {acc.server} · {acc.baseCurrency} · {acc.status}
                    </div>
                  </div>
                  <button
                    onClick={() => setPendingDelete(acc)}
                    data-testid={`brokers-delete-${acc.mt5Login}`}
                    className="btn btn-ghost flex items-center gap-2 shrink-0 hover:border-loss hover:text-loss"
                  >
                    <Trash size={14} weight="bold" /> REMOVE
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showConnect && (
        <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />
      )}
      {pendingDelete && (
        <ConfirmDialog
          title="Remove this broker?"
          message={`${pendingDelete.broker} #${pendingDelete.mt5Login} will be disconnected and its synced data removed. You can re-connect it later.`}
          confirmLabel="REMOVE"
          danger
          loading={deleting}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </AppShell>
  );
}
