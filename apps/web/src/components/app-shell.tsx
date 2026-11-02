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
import { IAdmin, IBell, IBrokers, ILink, IPartner, ISettings, IUsers } from '@/components/v6/icons';
import CommandPalette from '@/components/v6/command-palette';
import '@/styles/v6/tokens.css';
import '@/styles/v6/components.css';
import Tour from '@/components/v6/tour';

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
  { href: '/admin', label: 'Admin', icon: IAdmin, group: 'Admin' },
  ...(PARTNERS_ENABLED ? [{ href: '/admin/partners', label: 'Partners', icon: IPartner, group: 'Admin' }] : []),
  ...(TRADING_ENABLED ? [{ href: '/admin/copy', label: 'Copy trading admin', icon: IAdmin, group: 'Admin' }] : []),
  { href: '/brokers', label: 'Brokers', icon: IBrokers, group: 'Account' },
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
  children, accounts = [], selectedAccount, onSelectAccount, onConnectClick, pageTitle, pageSubtitle, actions,
  onSync, syncing, syncedAt,
}: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const { status: accessStatus, loading: accessLoading, blocked: accessBlocked } = usePlatformAccess();
  const [cmdk, setCmdk] = useState(false);

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
  const sel = selectedAccount ?? accounts[0] ?? null;
  const isAdmin = !!accessStatus?.isAdmin;
  const isPartner = PARTNERS_ENABLED && accessStatus?.partnerStatus === 'ACTIVE';
  const pages = ALL.filter(x => (x.group !== 'Partner' || isPartner) && (x.group !== 'Admin' || isAdmin));

  return (
    <>
      <UsageTracker />
      <LocationGate />
      <Frame
        activeHref={current?.href} pageTitle={pageTitle ?? current?.label ?? ''} subtitle={pageSubtitle} user={user}
        isAdmin={isAdmin} isPartner={isPartner}
        accounts={accounts} selected={sel} onSelectAccount={onSelectAccount} onConnectClick={onConnectClick}
        onSync={onSync} syncing={syncing} syncedLabel={syncedAt ? `Synced ${timeAgo(syncedAt)}` : sel?.lastSyncAt ? `Synced ${timeAgo(sel.lastSyncAt)}` : null}
        actions={actions} onOpenSearch={() => setCmdk(true)} onSignOut={() => authClient.signOut()}
      >
        {children}
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
