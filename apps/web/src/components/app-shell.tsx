'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Gauge, Table, ChartLineUp, CalendarBlank, FilmSlate, NotePencil, type Icon } from '@phosphor-icons/react';
import type { BrokerAccount } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import Logo from '@/components/logo';

interface Props {
  children: React.ReactNode;
  accounts?: BrokerAccount[];
  selectedAccount?: BrokerAccount | null;
  onSelectAccount?: (a: BrokerAccount) => void;
  onConnectClick?: () => void;
  pageTitle?: string;
  pageSubtitle?: string;
}

const NAV: { href: string; label: string; icon: Icon }[] = [
  { href: '/dashboard', label: 'DASHBOARD',    icon: Gauge },
  { href: '/trades',    label: 'TRADE LOG',    icon: Table },
  { href: '/analytics', label: 'ANALYTICS',    icon: ChartLineUp },
  { href: '/calendar',  label: 'CALENDAR',     icon: CalendarBlank },
  { href: '/journal',   label: 'CHART REPLAY', icon: FilmSlate },
  { href: '/notebook',  label: 'JOURNAL',      icon: NotePencil },
];

export default function AppShell({
  children, accounts = [], selectedAccount, onSelectAccount, onConnectClick, pageTitle, pageSubtitle,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [clock, setClock] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!isPending && !session?.session) router.replace('/login');
  }, [isPending, session, router]);

  useEffect(() => {
    const tick = () => setClock(new Date().toUTCString().split(' ').slice(1, 5).join(' '));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (drawerOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [drawerOpen]);

  if (isPending || !session?.session) return null;

  const SidebarBody = (
    <>
      <div className="px-5 h-14 flex items-center gap-2.5 border-b border-border">
        <span className="w-2 h-2 bg-profit pulse-dot shrink-0" />
        <Logo height={20} />
        <span className="ml-auto text-[9px] tracking-[0.22em] text-fg-3">v2.6</span>
        <button
          onClick={() => setDrawerOpen(false)}
          aria-label="Close menu"
          data-testid="drawer-close"
          className="lg:hidden ml-2 w-7 h-7 rounded-md border border-border text-fg-3 hover:text-fg hover:border-border-strong flex items-center justify-center press focus-ring"
        >
          ×
        </button>
      </div>

      <nav className="px-2 py-4 flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-md text-[11px] tracking-[0.22em] transition-colors duration-[var(--dur-hover)] focus-ring ${
                active ? 'bg-surface text-fg border-l-2 border-profit pl-[10px]' : 'text-fg-3 hover:text-fg hover:bg-surface'
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon size={16} weight={active ? 'fill' : 'regular'} className={active ? 'text-profit' : 'text-fg-3 group-hover:text-fg'} />
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
            onClick={() => { onConnectClick?.(); setDrawerOpen(false); }}
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
              className="text-[10px] text-fg-3 hover:text-loss tracking-widest transition-colors duration-[var(--dur-hover)] focus-ring rounded"
            >
              SIGN OUT
            </button>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-app text-fg" data-testid="app-shell">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 border-r border-border bg-app flex-col" data-testid="sidebar">
        {SidebarBody}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-app/80 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside
            className="lg:hidden fixed inset-y-0 left-0 z-50 w-[78%] max-w-[280px] border-r border-border bg-app flex flex-col fade-up"
            data-testid="mobile-drawer"
          >
            {SidebarBody}
          </aside>
        </>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-14 border-b border-border bg-app/80 backdrop-blur-xl flex items-center gap-3 px-3 sm:px-5 lg:px-6 sticky top-0 z-30">
          {/* Mobile hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            data-testid="drawer-open"
            className="lg:hidden w-9 h-9 rounded-md border border-border flex flex-col items-center justify-center gap-1 text-fg-3 hover:text-fg hover:border-border-strong shrink-0 press focus-ring"
          >
            <span className="block w-3.5 h-px bg-current" />
            <span className="block w-3.5 h-px bg-current" />
            <span className="block w-3.5 h-px bg-current" />
          </button>

          {/* Mobile logo */}
          <Link href="/dashboard" className="lg:hidden flex items-center gap-2 shrink-0">
            <Logo height={18} />
          </Link>

          <div className="flex flex-col min-w-0">
            {pageTitle && <span className="font-display font-bold text-[12px] sm:text-[13px] tracking-tight truncate">{pageTitle}</span>}
            {pageSubtitle && <span className="hidden xl:inline text-[10px] text-fg-3 tracking-[0.22em] uppercase truncate">{pageSubtitle}</span>}
          </div>

          {/* Account switcher — desktop inline, tablet/mobile use the dedicated row below */}
          {accounts.length > 0 && (
            <div
              className="hidden lg:flex ml-4 items-center gap-1.5 overflow-x-auto no-scrollbar"
              data-testid="account-switcher"
            >
              {accounts.map(acc => {
                const active = selectedAccount?.id === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => onSelectAccount?.(acc)}
                    data-testid={`account-tab-${acc.mt5Login}`}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-[11px] tracking-[0.15em] border transition-colors duration-[var(--dur-hover)] press focus-ring ${
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

          <div className="ml-auto flex items-center gap-3 lg:gap-4 text-[10px] tracking-[0.22em] text-fg-3 shrink-0">
            <span className="hidden xl:inline">SESSION · LONDON</span>
            <span className="hidden lg:inline numeric">{clock} UTC</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" /> LIVE</span>
          </div>
        </header>

        {/* Mobile account switcher row (only when present) */}
        {accounts.length > 0 && (
          <div
            className="lg:hidden border-b border-border bg-app overflow-x-auto no-scrollbar"
            data-testid="account-switcher-mobile"
          >
            <div className="flex items-center gap-1.5 px-3 py-2 w-max">
              {accounts.map(acc => {
                const active = selectedAccount?.id === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => onSelectAccount?.(acc)}
                    data-testid={`account-tab-mobile-${acc.mt5Login}`}
                    className={`shrink-0 px-3 py-1.5 rounded-md text-[10px] tracking-[0.15em] border transition-colors duration-[var(--dur-hover)] press focus-ring whitespace-nowrap ${
                      active ? 'border-fg text-fg bg-surface' : 'border-border-soft text-fg-3'
                    }`}
                  >
                    <span className={`inline-block w-1.5 h-1.5 mr-2 align-middle ${active ? 'bg-profit' : 'bg-border-strong'}`} />
                    {acc.broker.toUpperCase()} · #{acc.mt5Login}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto bg-app">{children}</main>
      </div>
    </div>
  );
}
