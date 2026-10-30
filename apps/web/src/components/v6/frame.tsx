'use client';

// v6 app frame: rounded canvas, icon rail in a pill, search pill, account pill
// and a theme/notifications/avatar pill. On phones the rail becomes a bottom tab
// bar with a "More" sheet. Auth gating, ⌘K and the location gate stay in AppShell;
// this only draws the chrome.
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { BrokerAccount } from '@/lib/api';
import NotificationBell from '@/components/notification-bell';
import { useTheme } from './use-theme';
import {
  IAdmin, IAnalytics, IBrokers, ICalendar, ICharts, ICheck, IChevronDown, IClose, ICoach, IDashboard, IJournal, IMacro, IMarkets,
  IPlus, IReplay, ISearch, ISettings, ISignalX, ISync, ITradeLog,
} from '@/components/v3/icons';
import '@/styles/v6/tokens.css';
import '@/styles/v6/frame.css';

type Icon = (p: { size?: number }) => ReactNode;
export type FrameNavItem = { href: string; label: string; icon: Icon };

export const RAIL: FrameNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: IDashboard },
  { href: '/trades', label: 'Trade log', icon: ITradeLog },
  { href: '/journal', label: 'Chart replay', icon: IReplay },
  { href: '/notebook', label: 'Journal', icon: IJournal },
  { href: '/analytics', label: 'Analytics', icon: IAnalytics },
  { href: '/calendar', label: 'Calendar', icon: ICalendar },
  { href: '/charts', label: 'Charts', icon: ICharts },
  { href: '/markets', label: 'Markets', icon: IMarkets },
  { href: '/macro', label: 'Macro', icon: IMacro },
  { href: '/trader', label: 'SignalX', icon: ISignalX },
  { href: '/coach', label: 'AI coach', icon: ICoach },
];
const RAIL_FOOT: FrameNavItem[] = [
  { href: '/brokers', label: 'Brokers', icon: IBrokers },
  { href: '/settings', label: 'Settings', icon: ISettings },
];
const TABS = ['/dashboard', '/trades', '/journal', '/coach'];

interface Props {
  children: ReactNode;
  activeHref?: string;
  pageTitle: string;
  user: { name?: string | null; email?: string | null } | undefined;
  isAdmin: boolean;
  accounts: BrokerAccount[];
  selected: BrokerAccount | null;
  onSelectAccount?: (a: BrokerAccount) => void;
  onConnectClick?: () => void;
  onSync?: () => void;
  syncing?: boolean;
  syncedLabel?: string | null;
  actions?: ReactNode;
  onOpenSearch: () => void;
  onSignOut: () => void;
}

/** Close a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

export default function Frame(p: Props) {
  const [theme, toggleTheme] = useTheme();
  const [more, setMore] = useState(false);
  const isAdmin = p.isAdmin;
  const foot = isAdmin ? [...RAIL_FOOT, { href: '/admin', label: 'Admin', icon: IAdmin }] : RAIL_FOOT;
  const tabs = TABS.map(h => RAIL.find(i => i.href === h)!);

  return (
    <div className="v6 f-page" data-testid="app-shell-v6">
      <div className="f-app">
        <aside className="f-side" aria-label="Sidebar">
          <Link href="/dashboard" className="f-logo" aria-label="TRADElogs dashboard">TL</Link>
          <nav className="f-rail" aria-label="Primary" data-testid="sidebar">
            {RAIL.map(i => <RailLink key={i.href} item={i} active={p.activeHref === i.href} />)}
          </nav>
          <nav className="f-rail f-rail--foot" aria-label="Account">
            {foot.map(i => <RailLink key={i.href} item={i} active={p.activeHref === i.href} />)}
          </nav>
        </aside>

        <div className="f-content">
          <header className="f-top">
            <Link href="/dashboard" className="f-logo f-logo--m" aria-label="TRADElogs dashboard">TL</Link>
            <h1 className="f-mtitle">{p.pageTitle}</h1>
            <button className="f-search" onClick={p.onOpenSearch} aria-label="Search pages (⌘K)">
              <ISearch size={16} /><span>Search</span><kbd>⌘K</kbd>
            </button>
            <div className="f-sp" />
            {p.actions}
            <AccountPill {...p} />
            <div className="f-tr">
              <button className="f-tbtn f-hide-m" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} data-testid="theme-toggle">
                {theme === 'light' ? <ISunIcon /> : <IMoonIcon />}
              </button>
              <span className="f-bell"><NotificationBell /></span>
              <AvatarMenu user={p.user} theme={theme} onToggleTheme={toggleTheme} onSignOut={p.onSignOut} isAdmin={isAdmin} />
            </div>
          </header>

          <main className="f-main">{p.children}</main>

          <nav className="f-tabbar" aria-label="Primary">
            {tabs.map(i => {
              const Icon = i.icon;
              return (
                <Link key={i.href} href={i.href} className={p.activeHref === i.href ? 'on' : ''} aria-label={i.label} aria-current={p.activeHref === i.href ? 'page' : undefined}>
                  <Icon size={19} />
                </Link>
              );
            })}
            <button onClick={() => setMore(true)} aria-label="More pages" aria-expanded={more} className={more ? 'on' : ''} data-testid="drawer-open">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></svg>
            </button>
          </nav>
        </div>
      </div>

      {more && (
        <div className="f-sheet-scrim" onClick={() => setMore(false)}>
          <div className="f-sheet" role="dialog" aria-label="All pages" onClick={e => e.stopPropagation()}>
            <div className="f-sheet-hd"><b>All pages</b><button className="f-tbtn" onClick={() => setMore(false)} aria-label="Close"><IClose size={18} /></button></div>
            <div className="f-sheet-grid">
              {[...RAIL, ...foot].map(i => {
                const Icon = i.icon;
                return (
                  <Link key={i.href} href={i.href} className={p.activeHref === i.href ? 'on' : ''} onClick={() => setMore(false)}>
                    <span><Icon size={19} /></span>{i.label}
                  </Link>
                );
              })}
            </div>
            <button className="f-btn f-btn--full" onClick={toggleTheme}>{theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RailLink({ item, active }: { item: FrameNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={active ? 'on' : ''} aria-label={item.label} aria-current={active ? 'page' : undefined} data-tip={item.label}
      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
      <Icon size={18} />
    </Link>
  );
}

function AccountPill({ accounts, selected, onSelectAccount, onConnectClick, onSync, syncing, syncedLabel }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  if (!selected) {
    return onConnectClick
      ? <button className="f-acct" onClick={onConnectClick} data-testid="account-connect"><IPlus size={15} /><b>Connect MT5</b></button>
      : <Link className="f-acct" href="/brokers" data-testid="account-connect"><IPlus size={15} /><b>Connect MT5</b></Link>;
  }
  const ok = /CONNECT|ACTIVE|OK/i.test(selected.status);
  const atLimit = accounts.length >= 2;
  return (
    <div className="f-pop-wrap" ref={ref}>
      <button className="f-acct" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="account-switcher">
        <span className={`f-dot ${ok ? '' : 'warn'}`} aria-hidden />
        <b>{selected.broker}</b>
        <span className="num f-acct-id">·{selected.mt5Login.slice(-4)}</span>
        <IChevronDown size={14} />
      </button>
      {open && (
        <div className="f-pop f-pop--acct" role="menu">
          <div className="f-pop-lbl">Accounts</div>
          {accounts.map(a => (
            <button key={a.id} role="menuitemradio" aria-checked={a.id === selected.id} data-testid={`account-tab-${a.mt5Login}`}
              onClick={() => { onSelectAccount?.(a); setOpen(false); }}>
              <span className="f-pop-main"><b>{a.broker}</b><small className="num">#{a.mt5Login} · {a.server}</small></span>
              {a.id === selected.id && <ICheck size={16} />}
            </button>
          ))}
          <hr />
          {onSync && (
            <button onClick={() => { onSync(); setOpen(false); }} disabled={syncing} data-testid="header-sync-now">
              <ISync size={16} className={syncing ? 'spin' : undefined} />
              <span className="f-pop-main"><b>{syncing ? 'Syncing…' : 'Sync now'}</b>{syncedLabel && <small>{ok ? syncedLabel : `MT5 ${selected.status.toLowerCase()}`}</small>}</span>
            </button>
          )}
          {onConnectClick && !atLimit
            ? <button onClick={() => { setOpen(false); onConnectClick(); }} data-testid="header-add-broker"><IPlus size={16} /><span className="f-pop-main"><b>Add broker</b></span></button>
            : <Link href="/brokers" onClick={() => setOpen(false)}><IBrokers size={16} /><span className="f-pop-main"><b>Manage brokers</b>{atLimit && <small>2 of 2 accounts connected</small>}</span></Link>}
        </div>
      )}
    </div>
  );
}

function AvatarMenu({ user, theme, onToggleTheme, onSignOut, isAdmin }: {
  user: Props['user']; theme: 'dark' | 'light'; onToggleTheme: () => void; onSignOut: () => void; isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const name = user?.name?.trim() || 'Trader';
  return (
    <div className="f-pop-wrap" ref={ref}>
      <button className="f-av" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" data-testid="user-profile">
        {name.charAt(0).toUpperCase()}
      </button>
      {open && (
        <div className="f-pop f-pop--me" role="menu">
          <div className="f-pop-me"><b>{name}</b>{user?.email && <small>{user.email}</small>}<small>Free plan</small></div>
          <hr />
          <button onClick={onToggleTheme}>{theme === 'light' ? <IMoonIcon /> : <ISunIcon />}<span className="f-pop-main"><b>{theme === 'light' ? 'Dark theme' : 'Light theme'}</b></span></button>
          <Link href="/settings" onClick={() => setOpen(false)}><ISettings size={16} /><span className="f-pop-main"><b>Settings</b></span></Link>
          <Link href="/brokers" onClick={() => setOpen(false)}><IBrokers size={16} /><span className="f-pop-main"><b>Brokers</b></span></Link>
          {isAdmin && <Link href="/admin" onClick={() => setOpen(false)}><IAdmin size={16} /><span className="f-pop-main"><b>Admin</b></span></Link>}
          <hr />
          <button onClick={onSignOut} data-testid="signout-btn"><span className="f-pop-main"><b>Sign out</b></span></button>
        </div>
      )}
    </div>
  );
}

function ISunIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>;
}
function IMoonIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" /></svg>;
}
