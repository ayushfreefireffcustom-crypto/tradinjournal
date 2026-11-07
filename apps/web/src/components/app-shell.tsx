'use client';

// Signed-in app chrome: sends signed-out visitors to /login, waits for the
// platform-access check, then draws the v6 frame (components/v6/frame.tsx)
// around the page, plus the ⌘K palette (components/v6/command-palette.tsx).
import Logo from '@/components/logo';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BrokerAccount } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { LoadingScreen } from '@/components/loader';
import { usePlatformAccess } from '@/lib/use-platform-access';
import { PARTNERS_ENABLED, TRADING_ENABLED } from '@/lib/features';
import { UsageTracker } from '@/components/usage-tracker';
import LocationGate from '@/components/location-gate';
import Frame, { COPY, NAV, type FrameNavItem } from '@/components/v6/frame';
import { IAdmin, IBell, IBrokers, ILink, ILock, IPartner, ISettings, IStar, IUsers } from '@/components/v6/icons';
import CommandPalette from '@/components/v6/command-palette';
import '@/styles/v6/tokens.css';
import '@/styles/v6/components.css';
import Tour from '@/components/v6/tour';
import { useShellAccounts } from '@/lib/use-accounts';
import { perkFor, usePerks } from '@/lib/use-perks';
import { LockedFeature } from '@/components/v6/account/locked-feature';
import { getViewAs, type ViewAs } from '@/lib/view-as';
import { ibApi } from '@/lib/ib-api';

interface Props {
  children: ReactNode;
  accounts?: BrokerAccount[];
  selectedAccount?: BrokerAccount | null;
  onSelectAccount?: (a: BrokerAccount) => void;
  onConnectClick?: () => void;
  /** Page title in the top bar (defaults to the nav label for the current route). */
  pageTitle?: string;
  /** Muted line under the page title. */
  pageSubtitle?: ReactNode;
  /** @deprecated breadcrumbs were removed with the v6 frame. */
  crumbParent?: string;
  /** Right-aligned top-bar actions (range selector, primary CTA…). */
  actions?: ReactNode;
  /** @deprecated the legacy scope is always v5 now. */
  theme?: 'v5' | 'v3';
  /** @deprecated every page uses the v6 frame. */
  frame?: 'v6';
  /** @deprecated every page is on the v6 components; the legacy style scope is gone. */
  legacy?: boolean;
  /** Manual sync (shows a Sync button in the top bar). */
  onSync?: () => void;
  syncing?: boolean;
  syncedAt?: string | null;
}

type Item = FrameNavItem & { group: string };
const ALL: Item[] = [
  ...NAV.flatMap(g => g.items.map(i => ({ ...i, group: g.title }))),
  ...(TRADING_ENABLED ? COPY.map(i => ({ ...i, group: 'Copy trading' })) : []),
  ...(TRADING_ENABLED ? [{ href: '/copy/lead', label: 'Become a leader', icon: COPY[0]!.icon, group: 'Copy trading' }] : []),
  { href: '/partner', label: 'Partner overview', icon: IPartner, group: 'Partner' },
  { href: '/partner/link', label: 'My link', icon: ILink, group: 'Partner' },
  { href: '/partner/clients', label: 'Clients', icon: IUsers, group: 'Partner' },
  { href: '/partner/brokers', label: 'Partner brokers', icon: IBrokers, group: 'Partner' },
  { href: '/partner/packages', label: 'Packages', icon: IStar, group: 'Partner' },
  { href: '/partner/tools', label: 'Partner tools', icon: IStar, group: 'Partner' },
  { href: '/partner/earnings', label: 'Partner earnings', icon: IStar, group: 'Partner' },
  { href: '/partner/reports', label: 'Partner reports', icon: IStar, group: 'Partner' },
  { href: '/admin', label: 'Admin', icon: IAdmin, group: 'Admin' },
  ...(PARTNERS_ENABLED ? [
    { href: '/admin/partners', label: 'Partners', icon: IPartner, group: 'Admin' },
    { href: '/admin/partners/program', label: 'Partner programme', icon: IPartner, group: 'Admin' },
    { href: '/admin/partners/reviews', label: 'Partner reviews', icon: IPartner, group: 'Admin' },
    { href: '/admin/partners/settings', label: 'Partner settings', icon: ISettings, group: 'Admin' },
  ] : []),
  ...(TRADING_ENABLED ? [{ href: '/admin/copy', label: 'Copy trading admin', icon: IAdmin, group: 'Admin' }] : []),
  { href: '/brokers', label: 'Brokers', icon: IBrokers, group: 'Account' },
  ...(PARTNERS_ENABLED ? [{ href: '/access', label: 'Partner access', icon: ILock, group: 'Account' }] : []),
  { href: '/notifications', label: 'Notifications', icon: IBell, group: 'Account' },
  { href: '/settings', label: 'Settings', icon: ISettings, group: 'Account' },
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

export default function AppShell({
  children, accounts: pageAccounts, selectedAccount, onSelectAccount, onConnectClick, pageTitle, pageSubtitle, actions,
  onSync, syncing, syncedAt,
}: Props) {
  // Pages that don't pass accounts still show the real account pill, not "Connect MT5".
  const shellAccounts = useShellAccounts(pageAccounts === undefined);
  const accounts = pageAccounts ?? shellAccounts.accounts;
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { status: accessStatus, loading: accessLoading, blocked: accessBlocked } = usePlatformAccess();
  const [cmdk, setCmdk] = useState(false);
  const perks = usePerks(!!session?.session);

  // Send signed-out visitors to sign in, remembering where they were headed.
  useEffect(() => {
    if (!isPending && !session?.session) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }, [isPending, session, router]);
  useEffect(() => { setCmdk(false); }, [pathname]);

  // ⌘K / Ctrl-K opens the page switcher anywhere in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdk(v => !v); }
      if (e.key === 'Escape') setCmdk(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = useMemo(() => ALL.find(i => pathname === i.href)
    ?? [...ALL].sort((a, b) => b.href.length - a.href.length).find(i => pathname.startsWith(i.href + '/')), [pathname]);

  // An admin viewing as a partner gets the partner section too (read-only, see lib/view-as).
  const [viewAs, setViewAsState] = useState<ViewAs | null>(null);
  useEffect(() => { const u = () => setViewAsState(getViewAs()); u(); window.addEventListener('tl:view-as', u); return () => window.removeEventListener('tl:view-as', u); }, []);
  // Hooks above the early returns below (rules of hooks).
  const partnerTodo = usePartnerTodo(PARTNERS_ENABLED && !!accessStatus?.isAdmin);

  const gatePending = isPending || (!session?.session && !isPending) || (accessLoading && !accessStatus);
  if (gatePending) {
    return <div className="h-dvh w-full" data-testid="app-shell-loading"><LoadingScreen /></div>;
  }
  if (accessBlocked) {
    return (
      <div className="v6 f-gate">
        <div className="x-card f-gate-card">
          <Logo height={24} className="mx-auto" />
          <h1>We couldn&rsquo;t verify your access.</h1>
          <p className="x-lead">Check your connection and try again.</p>
          <button type="button" onClick={() => window.location.reload()} className="x-btn x-btn--hi x-btn--lg x-btn--full">Retry</button>
          <a href="/" className="x-link">Go home</a>
        </div>
      </div>
    );
  }

  const user = session?.user;
  const sel = selectedAccount ?? (pageAccounts === undefined ? shellAccounts.selected : accounts[0]) ?? null;
  const isAdmin = !!accessStatus?.isAdmin;
  const isPartner = PARTNERS_ENABLED && (accessStatus?.partnerStatus === 'ACTIVE' || (isAdmin && !!viewAs));
  const pages = ALL.filter(x => (x.group !== 'Partner' || isPartner) && (x.group !== 'Admin' || isAdmin));
  // Features the admin locked to partner-package holders (none by default).
  const guard = perkFor(pathname);
  const lockedPerk = guard && perks && perks.locked.includes(guard.key) && !perks.mine.includes(guard.key) && !isAdmin ? guard : null;

  return (
    <>
      <UsageTracker />
      <LocationGate />
      <Frame
        activeHref={current?.href} pageTitle={pageTitle ?? current?.label ?? ''} subtitle={pageSubtitle} user={user}
        isAdmin={isAdmin} isPartner={isPartner} partnerTodo={partnerTodo}
        accounts={accounts} selected={sel} onSelectAccount={onSelectAccount ?? (pageAccounts === undefined ? shellAccounts.select : undefined)} onConnectClick={onConnectClick}
        onSync={onSync} syncing={syncing} syncedLabel={syncedAt ? `Synced ${timeAgo(syncedAt)}` : sel?.lastSyncAt ? `Synced ${timeAgo(sel.lastSyncAt)}` : null}
        actions={actions} onOpenSearch={() => setCmdk(true)} onSignOut={() => authClient.signOut()}
      >
        {lockedPerk ? <LockedFeature label={lockedPerk.label} /> : children}
      </Frame>
      <Tour />
      {cmdk && (
        <CommandPalette
          pages={pages} accountId={sel?.id} onClose={() => setCmdk(false)} onGo={href => { setCmdk(false); router.push(href); }}
          onSync={onSync} onConnect={onConnectClick} onSignOut={() => authClient.signOut()}
        />
      )}
    </>
  );
}

// Admin sidebar badge: partner-programme items waiting. Cached for a minute across pages.
let todoCache: { n: number; at: number } | null = null;
function usePartnerTodo(on: boolean): number {
  const [n, setN] = useState(() => (todoCache ? todoCache.n : 0));
  useEffect(() => {
    if (!on) return;
    if (todoCache && Date.now() - todoCache.at < 60_000) { setN(todoCache.n); return; }
    let live = true;
    ibApi.programSummary().then(s => { todoCache = { n: s.todo.total, at: Date.now() }; if (live) setN(s.todo.total); }).catch(() => {});
    return () => { live = false; };
  }, [on]);
  return on ? n : 0;
}

/** Forget the cached badge count (after approving or reviewing something). */
export function refreshPartnerTodo(): void { todoCache = null; }
