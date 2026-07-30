'use client';

// Profile header for the Settings page — avatar, name, email, sign-out, and a
// couple of at-a-glance stats, over a tasteful decorative banner (a faint rising
// equity line + dot grid) that echoes the product without shouting.
import { authClient } from '@/lib/auth-client';
import { SignOut } from '@phosphor-icons/react';

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'T'
  );
}

export default function ProfileCard({ accountCount }: { accountCount: number }) {
  const { data: session } = authClient.useSession();
  const name = session?.user?.name ?? 'Trader';
  const email = session?.user?.email ?? '';

  return (
    <div className="tcard overflow-hidden" data-testid="profile-card">
      {/* Decorative banner */}
      <div className="relative h-24 bg-gradient-to-br from-profit/18 via-profit/5 to-app border-b border-border-soft overflow-hidden">
        <svg viewBox="0 0 600 120" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-70" aria-hidden>
          <defs>
            <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#08C465" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#08C465" stopOpacity="0" />
            </linearGradient>
            <pattern id="pc-dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.2" fill="rgba(255,255,255,0.05)" />
            </pattern>
          </defs>
          <rect width="600" height="120" fill="url(#pc-dots)" />
          <path d="M0,95 L80,88 L160,92 L240,72 L320,78 L400,52 L480,58 L560,34 L600,26 L600,120 L0,120 Z" fill="url(#pc-fill)" />
          <path d="M0,95 L80,88 L160,92 L240,72 L320,78 L400,52 L480,58 L560,34 L600,26" fill="none" stroke="#08C465" strokeWidth="2" strokeOpacity="0.55" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="px-5 pb-5">
        <div className="flex items-end gap-4 -mt-9">
          <span className="shrink-0 w-16 h-16 rounded-2xl bg-surface border border-border-strong flex items-center justify-center font-display font-black text-[22px] text-fg" style={{ boxShadow: 'var(--shadow-lg)' }}>
            {initialsOf(name)}
          </span>
          <div className="min-w-0 flex-1 pb-1">
            <div className="font-display font-bold text-[17px] tracking-tight truncate">{name}</div>
            <div className="text-[12px] text-fg-3 truncate">{email}</div>
          </div>
          <button
            onClick={() => authClient.signOut()}
            data-testid="profile-signout"
            className="btn btn-ghost py-2 px-3 text-[11px] shrink-0"
          >
            <SignOut size={14} weight="bold" /> Sign out
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          {[
            { l: 'Connected accounts', v: `${accountCount}`, sub: '/ 2' },
            { l: 'Plan', v: 'Free', c: 'text-profit' },
            { l: 'Data source', v: 'MT5', sub: 'auto-sync' },
          ].map(s => (
            <div key={s.l} className="rounded-lg border border-border-soft bg-surface/40 px-3.5 py-3">
              <div className="text-[9px] tracking-[0.18em] uppercase text-fg-3">{s.l}</div>
              <div className={`font-display font-bold text-[18px] mt-1 numeric ${s.c ?? ''}`}>
                {s.v}
                {s.sub && <span className="text-fg-3 text-[10px] font-normal ml-1">{s.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
