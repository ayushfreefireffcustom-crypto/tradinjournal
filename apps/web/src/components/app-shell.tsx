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

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push('/login');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <aside style={{ width: 216, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', padding: '18px 10px', background: 'var(--surface)' }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '2px 8px', marginBottom: 24 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2 12L6 7L9 10L13 4" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.2px' }}>TradingJournal</span>
        </div>

        {/* Nav links */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {NAV.map(({ href, label, icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8,
                    background: active ? 'var(--surface-2)' : 'transparent',
                    color: active ? 'var(--text)' : 'var(--text-muted)',
                    fontSize: 13, fontWeight: active ? 500 : 400, transition: 'all 0.12s', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (!active) { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLDivElement).style.color = 'var(--text)'; } }}
                  onMouseLeave={e => { if (!active) { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; (e.currentTarget as HTMLDivElement).style.color = 'var(--text-muted)'; } }}
                >
                  {icon}
                  {label}
                  {active && <span style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ marginTop: 'auto' }}>
          <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />
          <div style={{ padding: '6px 10px', marginBottom: 4 }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session?.user.name || 'User'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
              {session?.user.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8,
              background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 13,
              cursor: 'pointer', transition: 'all 0.12s', width: '100%',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--red)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 12H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h2M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Topbar */}
        <div style={{ height: 52, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 10, flexShrink: 0 }}>
          {/* Account tabs */}
          {accounts.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflow: 'hidden' }}>
              {accounts.map(acc => {
                const active = selectedAccount?.id === acc.id;
                return (
                  <button
                    key={acc.id}
                    onClick={() => onSelectAccount?.(acc)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 7,
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'rgba(99,102,241,0.1)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-muted)',
                      fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text)'; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--text-subtle)', flexShrink: 0 }} />
                    {acc.broker} <span style={{ opacity: 0.6 }}>#{acc.mt5Login}</span>
                  </button>
                );
              })}
            </div>
          )}

          {topbarExtra && <div style={{ marginLeft: 'auto' }}>{topbarExtra}</div>}

          <button
            onClick={onConnectClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 13px', borderRadius: 8,
              background: 'var(--accent)', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'background 0.12s, transform 0.1s', marginLeft: accounts.length === 0 ? 'auto' : 0, flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-hover)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)'; }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
            Connect Broker
          </button>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
