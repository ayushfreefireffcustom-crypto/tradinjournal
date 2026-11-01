'use client';

// v6 app frame ("desk"): labelled sidebar that collapses to an icon rail on
// tablets, a top bar with the page title and actions, and a bottom tab bar with
// an all-pages sheet on phones. Auth gating, ⌘K and the location gate stay in
// AppShell; this only draws the chrome.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { BrokerAccount } from '@/lib/api';
import NotificationBell from '@/components/notification-bell';
import Logo from '@/components/logo';
import { PARTNERS_ENABLED, TRADING_ENABLED } from '@/lib/features';
import { useTheme } from './use-theme';
import { useExchangeConnections } from '@/lib/use-exchange-connections';
import { venueName, type ExchangeConnection } from '@/lib/copy-api';
import {
  IAdmin, IAnalytics, IBell, IBrokers, ICalendar, ICharts, ICheck, IChevronDown, IClose, ICoach, IDashboard, IJournal, ILink, IMacro, IMarkets,
  IPartner, IPlus, IReplay, ISearch, ISettings, ISignalX, ISync, ITradeLog, IUsers, IMirror, IExchange, ILeader,
} from '@/components/v3/icons';
import '@/styles/v6/tokens.css';
import '@/styles/v6/components.css';
import '@/styles/v6/frame.css';

type Icon = (p: { size?: number }) => ReactNode;
export type FrameNavItem = { href: string; label: string; icon: Icon; badge?: string };

export const NAV: { title: string; items: FrameNavItem[] }[] = [
  { title: 'Journal', items: [
    { href: '/dashboard', label: 'Dashboard', icon: IDashboard },
    { href: '/trades', label: 'Trade log', icon: ITradeLog },
    { href: '/journal', label: 'Chart replay', icon: IReplay },
    { href: '/notebook', label: 'Journal', icon: IJournal },
    { href: '/analytics', label: 'Analytics', icon: IAnalytics },
    { href: '/calendar', label: 'Calendar', icon: ICalendar },
  ] },
  { title: 'Markets', items: [
    { href: '/charts', label: 'Charts', icon: ICharts },
    { href: '/markets', label: 'Markets', icon: IMarkets },
    { href: '/screener', label: 'Screener', icon: ISearch },
    { href: '/alerts', label: 'Alerts', icon: IBell },
    { href: '/macro', label: 'Macro', icon: IMacro },
  ] },
  { title: 'AI', items: [
    { href: '/trader', label: 'SignalX', icon: ISignalX, badge: 'New' },
    { href: '/coach', label: 'AI coach', icon: ICoach },
  ] },
];
const PARTNER: FrameNavItem[] = [
  { href: '/partner', label: 'Overview', icon: IPartner },
  { href: '/partner/link', label: 'My link', icon: ILink },
  { href: '/partner/clients', label: 'Clients', icon: IUsers },
];
/** Copy trading (behind NEXT_PUBLIC_TRADING). */
export const COPY: FrameNavItem[] = [
  { href: '/copy', label: 'Leaders', icon: ILeader, badge: 'Beta' },
  { href: '/copy/following', label: 'My copies', icon: IMirror },
  { href: '/trading', label: 'Positions', icon: ITradeLog },
  { href: '/trading/journal', label: 'Exchange journal', icon: IJournal },
  { href: '/trading/webhook', label: 'Webhooks', icon: ILink },
  { href: '/trading/api', label: 'API keys', icon: ISettings },
  { href: '/exchanges', label: 'Exchanges', icon: IExchange },
];
const TABS = ['/dashboard', '/trades', '/journal', '/coach'];

interface Props {
  children: ReactNode;
  activeHref?: string;
  pageTitle: string;
  subtitle?: ReactNode;
  user: { name?: string | null; email?: string | null } | undefined;
  isAdmin: boolean;
  isPartner: boolean;
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

/** True below the phone breakpoint (so phone-only and desktop-only widgets mount once). */
function usePhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

export default function Frame(p: Props) {
  const [theme, toggleTheme] = useTheme();
  const phone = usePhone();
  const [more, setMore] = useState(false);
  const closeMore = useCallback(() => setMore(false), []);
  useEffect(() => { setMore(false); }, [p.activeHref]);
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [more]);

  const groups = [
    ...NAV,
    ...(TRADING_ENABLED ? [{ title: 'Copy trading', items: COPY }] : []),
    ...(PARTNERS_ENABLED && p.isPartner ? [{ title: 'Partner', items: PARTNER }] : []),
  ];
  const account: FrameNavItem[] = [
    { href: '/brokers', label: 'Brokers', icon: IBrokers },
    { href: '/settings', label: 'Settings', icon: ISettings },
    ...(p.isAdmin ? [{ href: '/admin', label: 'Admin', icon: IAdmin }] : []),
  ];
  const all = [...groups.flatMap(g => g.items), ...account];
  const tabs = TABS.map(h => all.find(i => i.href === h)!);

  return (
    <div className="v6 f-page" data-testid="app-shell">
      <aside className="f-sb" aria-label="Sidebar" data-testid="sidebar">
        <Link href="/dashboard" className="f-brand" aria-label="TRADElogs dashboard">
          <span className="f-brand-full"><Logo height={24} /></span>
          <span className="f-brand-mark" aria-hidden>TL</span>
        </Link>
        <button className="f-search" onClick={p.onOpenSearch} aria-label="Search pages (⌘K)">
          <ISearch size={15} /><span>Search</span><kbd>⌘K</kbd>
        </button>
        <nav className="f-nav" aria-label="Primary">
          {groups.map(g => (
            <div key={g.title} className="f-grp">
              <small>{g.title}</small>
              {g.items.map(i => <NavLink key={i.href} item={i} active={p.activeHref === i.href} />)}
            </div>
          ))}
          <div className="f-grp f-grp--foot">
            {account.map(i => <NavLink key={i.href} item={i} active={p.activeHref === i.href} />)}
          </div>
        </nav>
        <UserCard user={p.user} theme={theme} onToggleTheme={toggleTheme} onSignOut={p.onSignOut} />
      </aside>

      <div className="f-main">
        <header className="f-top">
          <div className="f-title">
            <Link href="/dashboard" className="f-mlogo" aria-label="TRADElogs dashboard">TL</Link>
            <div style={{ minWidth: 0 }}>
              <h1 data-testid="crumb">{p.pageTitle}</h1>
              {p.subtitle && <p>{p.subtitle}</p>}
            </div>
            <div className="f-mtools">
              <button className="f-ib" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}>
                {theme === 'light' ? <ISunIcon /> : <IMoonIcon />}
              </button>
              {phone && <span className="f-bell"><NotificationBell /></span>}
            </div>
          </div>
          <div className="f-tools">
            {p.actions}
            <AccountPill {...p} />
            {p.onSync && p.selected && (
              <button className="x-btn f-sync" onClick={p.onSync} disabled={p.syncing} aria-busy={p.syncing} data-testid="header-sync-now" title={p.syncedLabel ?? undefined}>
                <ISync size={15} className={p.syncing ? 'x-spin' : undefined} /><span>{p.syncing ? 'Syncing' : 'Sync'}</span>
              </button>
            )}
            <button className="f-ib f-dtool" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} data-testid="theme-toggle">
              {theme === 'light' ? <ISunIcon /> : <IMoonIcon />}
            </button>
            {!phone && <span className="f-bell f-dtool"><NotificationBell /></span>}
          </div>
        </header>

        <main className="f-content">{p.children}</main>
      </div>

      <nav className="f-tabbar" aria-label="Primary">
        {tabs.map(i => {
          const Icon = i.icon;
          return (
            <Link key={i.href} href={i.href} className={p.activeHref === i.href ? 'on' : ''} aria-label={i.label} aria-current={p.activeHref === i.href ? 'page' : undefined}>
              <Icon size={19} />
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} aria-label="All pages" aria-expanded={more} data-testid="drawer-open">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" /></svg>
        </button>
      </nav>

      {more && (
        <div className="f-sheet-scrim" onClick={closeMore}>
          <div className="f-sheet" role="dialog" aria-label="All pages" onClick={e => e.stopPropagation()}>
            <div className="f-sheet-hd">
              <b>All pages</b>
              <button className="f-ib" onClick={closeMore} aria-label="Close"><IClose size={18} /></button>
            </div>
            <div className="f-sheet-grid">
              {all.map(i => {
                const Icon = i.icon;
                return (
                  <Link key={i.href} href={i.href} className={p.activeHref === i.href ? 'on' : ''} onClick={closeMore}>
                    <span><Icon size={19} /></span>{i.label}
                  </Link>
                );
              })}
            </div>
            <div className="f-sheet-foot">
              <button className="x-btn" onClick={() => { p.onOpenSearch(); closeMore(); }}><ISearch size={15} />Search</button>
              <button className="x-btn" onClick={p.onSignOut} data-testid="signout-btn-m">Sign out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavLink({ item, active }: { item: FrameNavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className={`f-nv ${active ? 'on' : ''}`} aria-current={active ? 'page' : undefined} data-tip={item.label} title={item.label}
      data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
      <Icon size={17} /><span className="f-nv-l">{item.label}</span>{item.badge && <em>{item.badge}</em>}
    </Link>
  );
}

function AccountPill({ accounts, selected, onSelectAccount, onConnectClick, syncedLabel }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const exchanges = useExchangeConnections();
  if (!selected && exchanges.length) {
    // Exchange-only user: the pill shows their first exchange account instead of a Connect MT5 call.
    const x = exchanges[0]!;
    return (
      <div className="f-popwrap" ref={ref}>
        <button className="x-btn f-acct" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="account-switcher">
          <span className={`x-dot ${x.status === 'ACTIVE' ? '' : 'x-dot--r'}`} aria-hidden />
          <b>{x.label}</b>
          <span className="m f-acct-id">·{x.keyLast4}</span>
          <IChevronDown size={14} />
        </button>
        {open && (
          <div className="x-pop f-pop" role="menu">
            <ExchangeGroup rows={exchanges} onPick={close} />
            <hr />
            {onConnectClick
              ? <button onClick={() => { setOpen(false); onConnectClick(); }} data-testid="header-add-broker"><IPlus size={16} /><span className="f-pop-main"><b>Connect MT5</b><small>Journal your MT5 trades too</small></span></button>
              : <Link href="/brokers" onClick={() => setOpen(false)}><IPlus size={16} /><span className="f-pop-main"><b>Connect MT5</b><small>Journal your MT5 trades too</small></span></Link>}
          </div>
        )}
      </div>
    );
  }
  if (!selected) {
    return onConnectClick
      ? <button className="x-btn x-btn--hi f-acct-cta" onClick={onConnectClick} data-testid="account-connect"><IPlus size={15} />Connect MT5</button>
      : <Link className="x-btn x-btn--hi f-acct-cta" href="/brokers" data-testid="account-connect"><IPlus size={15} />Connect MT5</Link>;
  }
  const ok = /CONNECT|ACTIVE|OK/i.test(selected.status);
  const atLimit = accounts.length >= 2;
  return (
    <div className="f-popwrap" ref={ref}>
      <button className="x-btn f-acct" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} data-testid="account-switcher">
        <span className={`x-dot ${ok ? '' : 'x-dot--r'}`} aria-hidden />
        <b>{selected.broker}</b>
        <span className="m f-acct-id">·{selected.mt5Login.slice(-4)}</span>
        <IChevronDown size={14} />
      </button>
      {open && (
        <div className="x-pop f-pop" role="menu">
          <div className="f-pop-lbl">{exchanges.length ? 'MT5 accounts' : 'Accounts'}</div>
          {accounts.map(a => (
            <button key={a.id} role="menuitemradio" aria-checked={a.id === selected.id} data-testid={`account-tab-${a.mt5Login}`}
              onClick={() => { onSelectAccount?.(a); setOpen(false); }}>
              <span className="f-pop-main"><b>{a.broker}</b><small className="m">#{a.mt5Login} · {a.server}</small></span>
              {a.id === selected.id && <span className="f-pop-ok"><ICheck size={16} /></span>}
            </button>
          ))}
          {exchanges.length > 0 && <><hr /><ExchangeGroup rows={exchanges} onPick={close} /></>}
          <hr />
          {!ok && <div className="f-pop-note">MT5 status: {selected.status.toLowerCase()}. Check the password in Brokers.</div>}
          {syncedLabel && ok && <div className="f-pop-note">{syncedLabel}</div>}
          {onConnectClick && !atLimit
            ? <button onClick={() => { setOpen(false); onConnectClick(); }} data-testid="header-add-broker"><IPlus size={16} /><span className="f-pop-main"><b>Add broker</b></span></button>
            : <Link href="/brokers" onClick={() => setOpen(false)}><IBrokers size={16} /><span className="f-pop-main"><b>Manage brokers</b>{atLimit && <small>2 of 2 accounts connected</small>}</span></Link>}
        </div>
      )}
    </div>
  );
}

/** Exchange connections in the switcher. They power copy trading, not the journal, so they link out instead of switching. */
function ExchangeGroup({ rows, onPick }: { rows: ExchangeConnection[]; onPick: () => void }) {
  return (
    <>
      <div className="f-pop-lbl">Exchange accounts</div>
      {rows.map(x => (
        <Link key={x.id} href={x.isLeader ? '/copy/lead' : x.activeFollows ? '/copy/following' : '/exchanges'} role="menuitem" onClick={onPick} data-testid={`account-exchange-${x.id}`}>
          <IExchange size={16} />
          <span className="f-pop-main">
            <b>{x.label}</b>
            <small className="m">{venueName(x.exchange)}{x.environment === 'TESTNET' ? ' testnet' : ''} · key …{x.keyLast4}{x.isLeader ? ' · leader' : x.activeFollows ? ` · copying ${x.activeFollows}` : ''}</small>
          </span>
          {x.status !== 'ACTIVE' && <span className="x-tag x-tag--r">Key error</span>}
        </Link>
      ))}
    </>
  );
}

function UserCard({ user, theme, onToggleTheme, onSignOut }: {
  user: Props['user']; theme: 'dark' | 'light'; onToggleTheme: () => void; onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);
  const name = user?.name?.trim() || 'Trader';
  return (
    <div className="f-popwrap f-me-wrap" ref={ref}>
      <button className="f-me" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" data-testid="user-profile">
        <span className="f-av">{name.charAt(0).toUpperCase()}</span>
        <span className="f-me-l"><b>{name}</b><small>Free plan</small></span>
      </button>
      {open && (
        <div className="x-pop f-pop f-pop--me" role="menu">
          {user?.email && <div className="f-pop-note">{user.email}</div>}
          <button onClick={onToggleTheme}>{theme === 'light' ? <IMoonIcon /> : <ISunIcon />}<span className="f-pop-main"><b>{theme === 'light' ? 'Dark theme' : 'Light theme'}</b></span></button>
          <Link href="/settings" onClick={close}><ISettings size={16} /><span className="f-pop-main"><b>Settings</b></span></Link>
          <hr />
          <button onClick={onSignOut} data-testid="signout-btn"><span className="f-pop-main"><b>Sign out</b></span></button>
        </div>
      )}
    </div>
  );
}

function ISunIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></svg>;
}
function IMoonIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" /></svg>;
}
