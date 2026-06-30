'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { BrokerAccount } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

interface Props {
  children: React.ReactNode;
  accounts?: BrokerAccount[];
  selectedAccount?: BrokerAccount | null;
  onSelectAccount?: (a: BrokerAccount) => void;
  onConnectClick?: () => void;
  pageTitle?: string;
  pageSubtitle?: string;
}

const NAV = [
  { href: '/dashboard', label: 'DASHBOARD' },
  { href: '/trades',    label: 'TRADE LOG' },
  { href: '/analytics', label: 'ANALYTICS' },
  { href: '/journal',   label: 'CHART REPLAY' },
];

export default function AppShell({
  children, accounts = [], selectedAccount, onSelectAccount, onConnectClick, pageTitle, pageSubtitle,
}: Props) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const [clock, setClock] = useState('');
  useEffect(() => {
    const tick = () => setClock(new Date().toUTCString().split(' ').slice(1, 5).join(' '));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex min-h-screen bg-app text-fg" data-testid="app-shell">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-border bg-app flex flex-col" data-testid="sidebar">
        <div className="px-5 h-14 flex items-center gap-2.5 border-b border-border">
          <span className="w-2.5 h-2.5 bg-profit pulse-dot" />
          <span className="font-display font-black text-[14px] tracking-tighter">TRADIN<span className="text-fg-2">X</span></span>
          <span className="ml-auto text-[9px] tracking-[0.22em] text-fg-3">v2.6</span>
        </div>

        <nav className="px-2 py-4 flex flex-col gap-0.5">
          {NAV.map(({ href, label }, i) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
                className={`group flex items-center justify-between px-3 py-2.5 text-[11px] tracking-[0.22em] transition-colors ${
                  active ? 'bg-surface text-fg border-l-2 border-profit pl-[10px]' : 'text-fg-3 hover:text-fg hover:bg-surface'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="text-fg-3/60">{String(i + 1).padStart(2, '0')}</span>
                  {label}
                </span>
                {active && <span className="w-1 h-1 rounded-full bg-profit" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto p-4 border-t border-border space-y-3">
          <div className="border border-border-soft p-3">
            <div className="flex items-center gap-2 text-[10px] tracking-[0.22em] text-fg-3 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
              MT5 BRIDGE
            </div>
            <div className="text-[11px] text-fg-2">Online · 38ms latency</div>
            <button
              onClick={onConnectClick}
              data-testid="sidebar-connect-broker"
              className="mt-3 btn btn-ghost w-full justify-center py-1.5 text-[10px]"
            >
              + ADD BROKER
            </button>
          </div>
          <div className="flex items-center gap-2 px-1">
            <div className="w-7 h-7 rounded-sm bg-surface-hover border border-border flex items-center justify-center font-bold text-[11px]">
              {session?.user?.name?.charAt(0) ?? 'A'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] truncate">{session?.user?.name}</div>
              <button
                onClick={() => authClient.signOut()}
                data-testid="signout-btn"
                className="text-[10px] text-fg-3 hover:text-loss tracking-widest"
              >
                SIGN OUT
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 border-b border-border bg-app/80 backdrop-blur-xl flex items-center gap-4 px-6 sticky top-0 z-30">
          <div className="flex flex-col">
            {pageTitle && <span className="font-display font-bold text-[13px] tracking-tight">{pageTitle}</span>}
            {pageSubtitle && <span className="text-[10px] text-fg-3 tracking-[0.22em] uppercase">{pageSubtitle}</span>}
          </div>

          {accounts.length > 0 && (
            <div className="ml-6 flex items-center gap-1.5" data-testid="account-switcher">
              {accounts.map(acc => {
                const active = selectedAccount?.id === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => onSelectAccount?.(acc)}
                    data-testid={`account-tab-${acc.mt5Login}`}
                    className={`px-3 py-1.5 text-[11px] tracking-[0.15em] border transition-colors ${
                      active ? 'border-fg text-fg bg-surface' : 'border-border-soft text-fg-3 hover:text-fg hover:border-border-strong'
                    }`}
                  >
                    <span className={`inline-block w-1.5 h-1.5 mr-2 align-middle ${active ? 'bg-profit' : 'bg-border-strong'}`} />
                    {acc.broker.toUpperCase()} · #{acc.mt5Login}
                  </button>
                );
              })}
            </div>
          )}

          <div className="ml-auto flex items-center gap-4 text-[10px] tracking-[0.22em] text-fg-3">
            <span className="hidden md:inline">SESSION · LONDON</span>
            <span className="hidden md:inline numeric">{clock} UTC</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> LIVE</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-app">{children}</main>
      </div>
    </div>
  );
}
