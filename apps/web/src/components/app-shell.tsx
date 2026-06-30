'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { type BrokerAccount } from '@/lib/api';

const { signOut, useSession } = authClient;

interface Props {
  children: React.ReactNode;
  accounts?: BrokerAccount[];
  selectedAccount?: BrokerAccount | null;
  onSelectAccount?: (a: BrokerAccount) => void;
  onConnectClick?: () => void;
  topbarExtra?: React.ReactNode;
}

const NAV = [
  {
    href: '/dashboard', label: 'Dashboard',
    icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="9" width="4" height="6" rx="1" fill="currentColor" opacity="0.5"/><rect x="6" y="5" width="4" height="10" rx="1" fill="currentColor" opacity="0.7"/><rect x="11" y="2" width="4" height="13" rx="1" fill="currentColor"/></svg>,
  },
  {
    href: '/trades', label: 'Trade Log',
    icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h8M2 12h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  },
  {
    href: '/analytics', label: 'Analytics',
    icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 13L5 8l3 3 3-4 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  {
    href: '/journal', label: 'Journal',
    icon: <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="3" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M6 5h4M6 8h4M6 11h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  },
];

export default function AppShell({ children, accounts = [], selectedAccount, onSelectAccount, onConnectClick, topbarExtra }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push('/login');
  }

  return (
    <div className="flex min-h-screen bg-surface-container-lowest font-sora text-on-surface">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-outline-variant/30 flex flex-col p-6 bg-surface">
        {/* Logo */}
        <div className="flex items-center gap-3 px-2 mb-10">
          <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center shrink-0">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 12L6 7L9 10L13 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-headline-md text-body-md tracking-tighter text-on-surface">TradinX</span>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-2">
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} className="no-underline">
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-label-md transition-colors cursor-pointer ${
                    active
                      ? 'bg-surface-container-low text-on-surface font-semibold'
                      : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                  }`}
                >
                  {icon}
                  {label}
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                </div>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <div className="h-16 border-b border-outline-variant/30 flex items-center px-8 gap-4 shrink-0 bg-surface-container-lowest/80 backdrop-blur-md sticky top-0 z-10">
          {/* Account tabs */}
          {accounts.length > 0 && (
            <div className="flex items-center gap-3 flex-1 overflow-hidden">
              {accounts.map(acc => {
                const active = selectedAccount?.id === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => onSelectAccount?.(acc)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-label-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-outline-variant/30 bg-transparent text-on-surface-variant hover:border-outline-variant hover:text-on-surface'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-primary' : 'bg-on-surface-variant'}`} />
                    {acc.broker} <span className="opacity-60">#{acc.mt5Login}</span>
                  </button>
                );
              })}
            </div>
          )}

          {topbarExtra && <div className="ml-auto">{topbarExtra}</div>}

          <div className={`flex items-center gap-3 ${accounts.length === 0 && !topbarExtra ? 'ml-auto' : 'ml-auto'}`}>
            {/* Connect Broker button — visible when no accounts connected */}
            {accounts.length === 0 && (
              <button
                onClick={onConnectClick}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-container text-white text-label-sm font-semibold hover:bg-primary-container/90 transition-all cursor-pointer border-none active:scale-95 shrink-0"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                </svg>
                Connect Broker
              </button>
            )}

            {/* Notification bell */}
            <button className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white/5 transition-colors relative cursor-pointer border-none bg-transparent text-on-surface-variant">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-[#0e0e0e] absolute top-1.5 right-1.5"></span>
            </button>

            {/* Profile avatar + dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm cursor-pointer hover:bg-primary/30 transition-colors border border-primary/30 ml-1 shrink-0"
              >
                {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : 'U'}
              </button>

              {isProfileOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsProfileOpen(false)}></div>
                  <div className="absolute right-0 mt-2 w-56 bg-surface border border-[#27272a] rounded-xl shadow-xl z-50 py-2">
                    <div className="px-4 py-2">
                      <p className="font-headline-md text-sm text-on-surface font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
                        {session?.user?.name || 'User'}
                      </p>
                      <p className="font-body-md text-xs text-on-surface-variant overflow-hidden text-ellipsis whitespace-nowrap mt-0.5">
                        {session?.user?.email}
                      </p>
                    </div>
                    <div className="h-px bg-outline-variant/30 my-1" />
                    <button
                      onClick={handleSignOut}
                      disabled={signingOut}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-surface-container-low hover:text-red-400 text-sm text-on-surface-variant transition-colors cursor-pointer text-left border-none bg-transparent"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M5 12H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h2M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {signingOut ? 'Signing out…' : 'Sign out'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Page content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
