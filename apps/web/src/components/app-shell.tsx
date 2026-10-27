'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BrokerAccount } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import NotificationBell from '@/components/notification-bell';
import { LoadingScreen } from '@/components/loader';
import { usePlatformAccess } from '@/lib/use-platform-access';
import { UsageTracker } from '@/components/usage-tracker';
import LocationGate from '@/components/location-gate';
import {
  IAdmin, IAnalytics, IBrokers, ICalendar, ICharts, IChevrons, IClose, ICoach, IDashboard, IJournal, IMacro, IMarkets, IMenu,
  IPartner, IPlus, IReplay, ISearch, ISettings, ISignalX, ITradeLog, ILink, IUsers,
} from '@/components/v3/icons';
import '@/styles/app-v3.css';
import '@/styles/app-v5-auto.css';
import '@/styles/app-v5.css';
import Logo from '@/components/logo';

interface Props {
  children: ReactNode;
  accounts?: BrokerAccount[];
  selectedAccount?: BrokerAccount | null;
  onSelectAccount?: (a: BrokerAccount) => void;
  onConnectClick?: () => void;
  /** Breadcrumb leaf (defaults to the nav label for the current route). */
  pageTitle?: string;
  /** Kept for API compatibility with older call sites; the v3 top bar doesn't render it. */
  pageSubtitle?: string;
  /** Breadcrumb parent (defaults to the nav group of the current route). */
  crumbParent?: string;
  /** Right-aligned top-bar actions (range selector, sync, primary CTA…). */
  actions?: ReactNode;
  /** 'v5' (default) = the black + signal-green theme; 'v3' = legacy light theme. */
  theme?: 'v5' | 'v3';
}

type NavItem = { href: string; label: string; icon: (p: { size?: number }) => ReactNode; badge?: string };
const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'Journal', items: [
    { href: '/dashboard', label: 'Dashboard', icon: IDashboard },
    { href: '/trades', label: 'Trade log', icon: ITradeLog },
    { href: '/analytics', label: 'Analytics', icon: IAnalytics },
    { href: '/calendar', label: 'Calendar', icon: ICalendar },
    { href: '/journal', label: 'Chart replay', icon: IReplay },
    { href: '/notebook', label: 'Journal', icon: IJournal },
  ] },
  { title: 'Markets', items: [
    { href: '/charts', label: 'Charts', icon: ICharts },
    { href: '/markets', label: 'Markets', icon: IMarkets },
    { href: '/macro', label: 'Macro', icon: IMacro },
  ] },
  { title: 'AI', items: [
    { href: '/trader', label: 'SignalX', icon: ISignalX, badge: 'New' },
    { href: '/coach', label: 'AI coach', icon: ICoach },
  ] },
];
// Shown only to active partners (access status `partnerStatus === "ACTIVE"`).
const PARTNER: NavItem[] = [
  { href: '/partner', label: 'Overview', icon: IPartner },
  { href: '/partner/link', label: 'My link', icon: ILink },
  { href: '/partner/clients', label: 'Clients', icon: IUsers },
];
const ADMIN: NavItem[] = [
  { href: '/admin', label: 'Admin', icon: IAdmin },
  { href: '/admin/partners', label: 'Partners', icon: IPartner },
];
const FOOT: NavItem[] = [
  { href: '/brokers', label: 'Brokers', icon: IBrokers },
  { href: '/settings', label: 'Settings', icon: ISettings },
];
const ALL: (NavItem & { group: string })[] = [
  ...GROUPS.flatMap(g => g.items.map(i => ({ ...i, group: g.title }))),
  ...PARTNER.map(i => ({ ...i, group: 'Partner' })),
  ...ADMIN.map(i => ({ ...i, group: 'Admin' })),
  ...FOOT.map(i => ({ ...i, group: 'Account' })),
];

/** "2 min ago" style relative time for sync stamps. */
export function timeAgo(iso?: string | null): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

const initials = (broker: string) => broker.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'MT';

export default function AppShell({
  children, accounts = [], selectedAccount, onSelectAccount, onConnectClick, pageTitle, crumbParent, actions, theme,
}: Props) {
  const tv = theme === 'v3' ? '' : ' v5';
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { status: accessStatus, loading: accessLoading, blocked: accessBlocked } = usePlatformAccess();
  const [drawer, setDrawer] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const [cmdk, setCmdk] = useState(false);
  const acctRef = useRef<HTMLDivElement>(null);

  // Send signed-out visitors to sign in, remembering where they were headed.
  useEffect(() => {
    if (!isPending && !session?.session) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [isPending, session, router]);
  // Portalled UI (modals, toasts, popovers) renders under <body>, outside the shell —
  // put the theme class there too so it inherits the same tokens.
  useEffect(() => {
    if (!tv) return;
    document.body.classList.add('v5');
    return () => document.body.classList.remove('v5');
  }, [tv]);
  useEffect(() => { setDrawer(false); setAcctOpen(false); }, [pathname]);

  // ⌘K / Ctrl-K opens the page switcher anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk(v => !v); }
      if (e.key === 'Escape') { setCmdk(false); setAcctOpen(false); setDrawer(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!acctOpen) return;
    const onDown = (e: MouseEvent) => { if (!acctRef.current?.contains(e.target as Node)) setAcctOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [acctOpen]);

  const current = useMemo(() => ALL.find(i => pathname === i.href)
    ?? [...ALL].sort((a, b) => b.href.length - a.href.length).find(i => pathname.startsWith(i.href + '/')), [pathname]);

  const gatePending = isPending || (!session?.session && !isPending) || (accessLoading && !accessStatus);
  if (gatePending) {
    return <div className={`v3${tv} h-dvh w-full`} data-testid="app-shell-loading"><LoadingScreen /></div>;
  }
  if (accessBlocked) {
    return (
      <div className={`v3${tv} min-h-dvh flex items-center justify-center p-6`}>
        <div className="v3-card" style={{ padding: 32, maxWidth: 400, textAlign: 'center' }}>
          <Logo height={26} className="mx-auto" />
          <h1 className="v3-h1" style={{ fontSize: 24, marginTop: 16 }}>We couldn&rsquo;t verify your access.</h1>
          <p className="v3-sub" style={{ marginTop: 8 }}>Check your connection and try again.</p>
          <button type="button" onClick={() => window.location.reload()} className="v3-btn v3-btn--acc" style={{ marginTop: 20, width: '100%', justifyContent: 'center' }}>Retry</button>
          <a href="/" className="v3-link" style={{ marginTop: 14 }}>Go home</a>
        </div>
      </div>
    );
  }

  const user = session?.user;
  const sel = selectedAccount ?? accounts[0] ?? null;
  const connected = sel ? /CONNECT|ACTIVE|OK/i.test(sel.status) : false;

  return (
    <div className={`v3${tv} v3-shell`} data-testid="app-shell">
      <UsageTracker />
      <LocationGate />
      {drawer && <div className="v3-drawer-scrim" onClick={() => setDrawer(false)} aria-hidden />}

      <aside className={`v3-sb ${drawer ? 'is-open' : ''}`} data-testid="sidebar" aria-label="Sidebar">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Link href="/dashboard" className="v3-wm" aria-label="TRADElogs dashboard"><Logo height={27} /></Link>
          <button className="v3-burger" style={{ marginLeft: 'auto', background: 'transparent', color: '#fff', borderColor: '#2A2932', display: drawer ? 'grid' : 'none' }} onClick={() => setDrawer(false)} aria-label="Close menu"><IClose size={16} /></button>
        </div>

        {sel ? (
          <div className="v3-acct" ref={acctRef}>
            <button className="v3-acct-btn" onClick={() => setAcctOpen(o => !o)} aria-haspopup="menu" aria-expanded={acctOpen} data-testid="account-switcher">
              <span className="v3-acct-mono">{initials(sel.broker)}</span>
              <span style={{ minWidth: 0 }}><b>{sel.broker}</b><small>…{sel.mt5Login.slice(-4)} · {!connected ? sel.status.toLowerCase() : sel.lastSyncAt ? 'synced' : 'not synced yet'}</small></span>
              <IChevrons size={16} />
            </button>
            {acctOpen && (
              <div className="v3-acct-menu" role="menu">
                {accounts.map(a => (
                  <button key={a.id} role="menuitemradio" aria-checked={a.id === sel.id} className={a.id === sel.id ? 'on' : ''} data-testid={`account-tab-${a.mt5Login}`}
                    onClick={() => { onSelectAccount?.(a); setAcctOpen(false); }}>
                    <span className="v3-acct-mono" style={{ background: 'var(--paper)', color: 'var(--ink)' }}>{initials(a.broker)}</span>
                    <span><b style={{ fontWeight: 500 }}>{a.broker}</b><small>#{a.mt5Login} · {a.server}</small></span>
                  </button>
                ))}
                <hr />
                {onConnectClick
                  ? <button onClick={() => { setAcctOpen(false); onConnectClick(); }}><IPlus size={16} /> Add broker</button>
                  : <Link href="/brokers"><IPlus size={16} /> Manage brokers</Link>}
              </div>
            )}
          </div>
        ) : (
          <button className="v3-acct-btn" onClick={() => (onConnectClick ? onConnectClick() : router.push('/brokers'))} data-testid="account-connect">
            <span className="v3-acct-mono"><IPlus size={16} /></span>
            <span><b>Connect MT5</b><small>Read-only · 90 seconds</small></span>
          </button>
        )}

        <nav aria-label="Primary" style={{ display: 'grid', gap: 18 }}>
          {GROUPS.map(g => (
            <div key={g.title} className="v3-grp">
              <small>{g.title}</small>
              {g.items.map(i => <NavLink key={i.href} item={i} active={current?.href === i.href} />)}
            </div>
          ))}
          {accessStatus?.partnerStatus === 'ACTIVE' && (
            <div className="v3-grp">
              <small>Partner</small>
              {PARTNER.map(i => <NavLink key={i.href} item={i} active={current?.href === i.href} />)}
            </div>
          )}
        </nav>

        <div className="v3-sb-foot">
          {sel && (
            <div className="v3-sync" data-testid="sync-status">
              <b><span className={`v3-dot ${connected ? '' : 'warn'}`} />{!connected ? 'MT5 needs attention' : sel.lastSyncAt ? 'MT5 sync online' : 'Waiting for first sync'}</b>
              {sel.lastSyncAt ? `Last sync ${timeAgo(sel.lastSyncAt)}` : 'Your history imports on the first sync'}
            </div>
          )}
          {accessStatus?.isAdmin && ADMIN.map(i => <NavLink key={i.href} item={i} active={current?.href === i.href} />)}
          {FOOT.map(i => <NavLink key={i.href} item={i} active={current?.href === i.href} />)}
          <div className="v3-me" data-testid="user-profile">
            <span className="a">{(user?.name ?? 'T').charAt(0).toUpperCase()}</span>
            <span style={{ minWidth: 0 }}><b>{user?.name ?? 'Trader'}</b><small>Free plan</small></span>
            <button onClick={() => authClient.signOut()} data-testid="signout-btn">Sign out</button>
          </div>
        </div>
      </aside>

      <div className="v3-main">
        <header className="v3-top">
          <button className="v3-burger" onClick={() => setDrawer(true)} aria-label="Open menu" data-testid="drawer-open"><IMenu size={18} /></button>
          <div className="v3-crumb" data-testid="crumb">
            <span className="grp">{crumbParent ?? current?.group ?? 'TRADElogs'} / </span><b>{pageTitle ?? current?.label ?? ''}</b>
          </div>
          <button className="v3-search" onClick={() => setCmdk(true)} aria-label="Search pages (⌘K)">
            <ISearch size={16} /><span>Jump to a page…</span><kbd>⌘K</kbd>
          </button>
          <div className="v3-top-r">
            {actions}
            <NotificationBell />
          </div>
        </header>
        <main className="v3-scroll">{children}</main>
      </div>

      {cmdk && <CommandPalette onClose={() => setCmdk(false)} onGo={href => { setCmdk(false); router.push(href); }} isAdmin={!!accessStatus?.isAdmin} isPartner={accessStatus?.partnerStatus === 'ACTIVE'} />}
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link href={item.href} className="v3-nv" aria-current={active ? 'page' : undefined} data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
      <Icon size={17} />{item.label}{item.badge && <em>{item.badge}</em>}
    </Link>
  );
}

function CommandPalette({ onClose, onGo, isAdmin, isPartner }: { onClose: () => void; onGo: (href: string) => void; isAdmin: boolean; isPartner: boolean }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const items = useMemo(() => {
    const list = ALL.filter(x => (x.group !== 'Partner' || isPartner) && (x.group !== 'Admin' || isAdmin));
    const n = q.trim().toLowerCase();
    return n ? list.filter(x => x.label.toLowerCase().includes(n) || x.group.toLowerCase().includes(n)) : list;
  }, [q, isAdmin, isPartner]);
  useEffect(() => { setI(0); }, [q]);
  return (
    <div className="v3 v3-cmdk-scrim" onMouseDown={onClose}>
      <div className="v3-cmdk" role="dialog" aria-label="Jump to a page" onMouseDown={e => e.stopPropagation()}>
        <input autoFocus placeholder="Jump to a page…" value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setI(v => Math.min(items.length - 1, v + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setI(v => Math.max(0, v - 1)); }
            if (e.key === 'Enter' && items[i]) onGo(items[i].href);
          }} />
        {items.length === 0 ? <div className="empty">No pages match &ldquo;{q}&rdquo;.</div> : (
          <ul>
            {items.map((x, k) => {
              const Icon = x.icon;
              return (
                <li key={x.href}>
                  <a href={x.href} data-on={k === i} onMouseEnter={() => setI(k)} onClick={e => { e.preventDefault(); onGo(x.href); }}>
                    <Icon size={17} />{x.label}<small>{x.group}</small>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
