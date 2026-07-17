'use client';

// Broker management — the "connections hub". A hero header with summary stat
// cards (total brokers / total balance / active connections), a searchable
// broker list with per-account balance/equity/P&L pulled from the stats API, a
// dashed add-new card, and a security reassurance strip. The account cap (2) is
// enforced by the backend; the UI disables adding once the limit is hit.

import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import ConfirmDialog from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { useAccounts } from '@/lib/use-accounts';
import { api, type BrokerAccount, type AccountStats } from '@/lib/api';
import {
  Bank, Wallet, Broadcast, MagnifyingGlass, Plus, ShieldCheck, DotsThree, Trash, ArrowSquareOut,
} from '@phosphor-icons/react';

const MAX_ACCOUNTS = 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtMoney = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtSigned = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
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
  const [deleting, setDeleting] = useState(false);
  const [query, setQuery] = useState('');
  const [figures, setFigures] = useState<Record<string, AccountFigures | null>>({});
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Close the row menu on outside click / Escape.
  useEffect(() => {
    if (!menuFor) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuFor(null); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [menuFor]);

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

  const SUMMARY = [
    {
      icon: Bank,
      label: 'TOTAL BROKERS',
      value: String(accounts.length),
      sub: 'Connected accounts',
      subClass: 'text-fg-3',
    },
    {
      icon: Wallet,
      label: 'TOTAL BALANCE',
      value: figuresReady ? fmtMoney(totalBalance) : accounts.length === 0 ? '$0.00' : '···',
      sub: 'Across all accounts',
      subClass: 'text-fg-3',
    },
    {
      icon: Broadcast,
      label: 'ACTIVE CONNECTIONS',
      value: `${activeCount}/${MAX_ACCOUNTS}`,
      sub: activeCount === accounts.length ? 'All systems operational' : 'Attention needed',
      subClass: activeCount === accounts.length ? 'text-profit' : 'text-warning',
    },
  ];

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={select}
      onConnectClick={() => { if (!atLimit) setShowConnect(true); }}
      pageTitle="Brokers"
      pageSubtitle="// MANAGE YOUR CONNECTIONS"
    >
      <div className="fade-up" data-testid="brokers-page">
        {/* ── Hero header ─────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden border-b border-border">
          {/* Atmosphere: soft green glow + faded grid, echoing the landing */}
          <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" aria-hidden />
          <div className="absolute -right-24 -top-24 w-[480px] h-[480px] glow-radial opacity-70" aria-hidden />
          <div className="relative max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 pb-8 flex items-end justify-between gap-6">
            <div>
              <div className="text-[10px] tracking-[0.25em] text-fg-3">[ BROKERS // MANAGE CONNECTIONS ]</div>
              <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2">BROKERS</h1>
              <p className="text-fg-2 text-[13px] mt-2">Manage your broker connections and account limits.</p>
            </div>
            {/* Decorative bank tile */}
            <div className="hidden sm:flex relative w-20 h-20 shrink-0 rounded-2xl border border-profit/25 bg-profit/[0.06] items-center justify-center" aria-hidden>
              <div className="absolute inset-0 rounded-2xl" style={{ boxShadow: '0 0 40px rgba(8,196,101,0.15)' }} />
              <Bank size={34} weight="duotone" className="text-profit" />
            </div>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex flex-col gap-5 sm:gap-6">
          {/* ── Summary stat cards ──────────────────────────────────────────── */}
          <div className="grid sm:grid-cols-3 gap-3 sm:gap-4" data-testid="brokers-summary">
            {SUMMARY.map(s => (
              <div key={s.label} className="tcard p-4 sm:p-5 flex items-center gap-4" style={{ boxShadow: 'var(--shadow-sm)' }}>
                <span className="w-11 h-11 shrink-0 rounded-xl bg-profit/10 border border-profit/25 flex items-center justify-center text-profit">
                  <s.icon size={20} weight="duotone" />
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] tracking-[0.2em] text-fg-3">{s.label}</div>
                  <div className="font-display font-black text-2xl tracking-tight numeric mt-0.5">{s.value}</div>
                  <div className={`text-[11px] mt-0.5 ${s.subClass}`}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Your brokers ────────────────────────────────────────────────── */}
          <div className="tcard p-4 sm:p-6" style={{ boxShadow: 'var(--shadow-md)' }} data-testid="brokers-list">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
              <div className="text-[11px] tracking-[0.25em] text-fg-3 mr-auto">YOUR BROKERS</div>
              <div className="relative sm:w-60">
                <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search brokers…"
                  data-testid="brokers-search"
                  className="tinput pl-9 py-2 text-[12px]"
                />
              </div>
              <button
                onClick={() => setShowConnect(true)}
                disabled={atLimit}
                data-testid="brokers-add"
                title={atLimit ? 'Account limit reached — remove one to add another' : undefined}
                className={`btn btn-primary gap-2 shrink-0 justify-center py-2 ${atLimit ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Plus size={14} weight="bold" /> ADD BROKER
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col gap-3">
                <div className="h-24 rounded-xl bg-surface-hover/60 animate-pulse" />
                <div className="h-24 rounded-xl bg-surface-hover/60 animate-pulse" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.length === 0 && accounts.length > 0 && (
                  <div className="py-10 text-center text-[12px] text-fg-3" data-testid="brokers-no-results">
                    No brokers match “{query}”.
                  </div>
                )}

                {filtered.map(acc => {
                  const fig = figures[acc.id];
                  const connected = acc.status?.toUpperCase() !== 'DISCONNECTED';
                  return (
                    <div
                      key={acc.id}
                      data-testid={`brokers-account-${acc.mt5Login}`}
                      className="group relative rounded-xl border border-border-soft bg-app/40 overflow-hidden transition-colors hover:border-border-strong"
                    >
                      {/* Green accent bar */}
                      <span className={`absolute left-0 top-0 bottom-0 w-0.5 ${connected ? 'bg-profit' : 'bg-loss'}`} aria-hidden />

                      <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 sm:p-5 pl-5">
                        {/* Identity */}
                        <div className="flex items-center gap-4 min-w-0 lg:w-[320px] lg:shrink-0">
                          <div className="w-12 h-12 shrink-0 rounded-xl bg-surface-hover border border-border flex items-center justify-center font-display font-black text-[15px]">
                            {monogram(acc.broker)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-display font-bold text-[14px] tracking-tight truncate">{acc.broker}</span>
                              <span className="text-[12px] text-fg-3 numeric shrink-0">#{acc.mt5Login}</span>
                              {connected && (
                                <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-profit/10 border border-profit/30 px-1.5 py-0.5 text-[9px] tracking-widest text-profit">
                                  <span className="w-1 h-1 rounded-full bg-profit" /> ACTIVE
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-fg-3 truncate mt-0.5">
                              {acc.server} · {acc.baseCurrency} · Real Account
                            </div>
                            <div className="text-[10px] text-fg-3/80 mt-0.5">Connected {timeAgo(acc.createdAt)}</div>
                          </div>
                        </div>

                        {/* Figures */}
                        <div className="grid grid-cols-3 gap-3 lg:flex lg:items-center lg:gap-0 lg:flex-1 border-t lg:border-t-0 border-border-soft pt-3 lg:pt-0">
                          {[
                            { l: 'BALANCE', v: fig ? fmtMoney(fig.balance) : fig === null ? '—' : '···', c: '' },
                            { l: 'EQUITY',  v: fig ? fmtMoney(fig.equity)  : fig === null ? '—' : '···', c: '' },
                            { l: 'P&L',     v: fig ? fmtSigned(fig.pnl)    : fig === null ? '—' : '···', c: fig ? (fig.pnl >= 0 ? 'text-profit' : 'text-loss') : '' },
                          ].map((col, i) => (
                            <div key={col.l} className={`min-w-0 lg:flex-1 lg:px-5 ${i > 0 ? 'lg:border-l lg:border-border-soft' : ''}`}>
                              <div className="text-[9px] tracking-[0.18em] text-fg-3">{col.l}</div>
                              <div className={`font-display font-bold text-[15px] sm:text-base tracking-tight numeric mt-0.5 truncate ${col.c}`}>{col.v}</div>
                            </div>
                          ))}
                          {/* Status */}
                          <div className="hidden lg:block lg:px-5 lg:border-l lg:border-border-soft lg:shrink-0">
                            <div className="text-[9px] tracking-[0.18em] text-fg-3">STATUS</div>
                            <div className={`flex items-center gap-1.5 text-[13px] mt-0.5 ${connected ? 'text-profit' : 'text-loss'}`}>
                              {connected ? 'Connected' : 'Disconnected'}
                              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-profit pulse-dot' : 'bg-loss'}`} />
                            </div>
                          </div>
                        </div>

                        {/* Row menu */}
                        <div className="absolute top-3 right-3 lg:static lg:shrink-0">
                          <div className="relative" ref={menuFor === acc.id ? menuRef : undefined}>
                            <button
                              onClick={() => setMenuFor(m => (m === acc.id ? null : acc.id))}
                              aria-label={`Options for ${acc.broker} #${acc.mt5Login}`}
                              data-testid={`brokers-menu-${acc.mt5Login}`}
                              className="w-8 h-8 rounded-lg border border-transparent text-fg-3 hover:text-fg hover:border-border flex items-center justify-center transition-colors focus-ring"
                            >
                              <DotsThree size={20} weight="bold" />
                            </button>
                            {menuFor === acc.id && (
                              <div className="absolute right-0 top-9 z-20 w-40 tcard p-1 fade-up" style={{ boxShadow: 'var(--shadow-md)' }}>
                                <button
                                  onClick={() => { setMenuFor(null); setPendingDelete(acc); }}
                                  data-testid={`brokers-delete-${acc.mt5Login}`}
                                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-[12px] text-loss hover:bg-loss/10 transition-colors"
                                >
                                  <Trash size={14} weight="bold" /> Remove broker
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Dashed add-new card (also the empty state) */}
                <button
                  onClick={() => { if (!atLimit) setShowConnect(true); }}
                  disabled={atLimit}
                  data-testid="brokers-add-card"
                  className={`rounded-xl border border-dashed border-border-strong/60 py-8 px-4 flex flex-col items-center gap-2 text-center transition-colors focus-ring ${
                    atLimit ? 'opacity-45 cursor-not-allowed' : 'hover:border-profit/50 hover:bg-profit/[0.03] cursor-pointer'
                  }`}
                >
                  <span className="w-10 h-10 rounded-full bg-profit/10 border border-profit/30 flex items-center justify-center text-profit">
                    <Plus size={18} weight="bold" />
                  </span>
                  <span className="font-display font-bold text-[14px] text-profit tracking-tight">
                    {atLimit ? 'Broker limit reached' : 'Add New Broker'}
                  </span>
                  <span className="text-[12px] text-fg-3 max-w-sm">
                    {atLimit
                      ? `You can connect up to ${MAX_ACCOUNTS} broker accounts. Remove one to add another.`
                      : 'Connect another broker account to track all your trades in one place.'}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* ── Security strip ──────────────────────────────────────────────── */}
          <div className="tcard p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4" style={{ boxShadow: 'var(--shadow-sm)' }} data-testid="brokers-security">
            <span className="w-11 h-11 shrink-0 rounded-full bg-profit/10 border border-profit/25 flex items-center justify-center text-profit">
              <ShieldCheck size={20} weight="duotone" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display font-bold text-[14px] tracking-tight">Your connections are secure</div>
              <div className="text-[12px] text-fg-2 mt-0.5">
                We use bank-level encryption and read-only MT5 logins — we can never place trades or withdraw funds.
              </div>
            </div>
            <a
              href="#"
              onClick={e => e.preventDefault()}
              className="btn btn-ghost gap-2 shrink-0 self-start sm:self-auto text-[11px] tracking-[0.16em]"
            >
              LEARN MORE <ArrowSquareOut size={13} weight="bold" />
            </a>
          </div>
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
