'use client';

// Settings › Security (H4, H5): password, two-factor sign-in, devices.
import { useState } from 'react';
import AppShell from '@/components/app-shell';
import { DevicesCard, PasswordCard, TwoFactorCard, useProfile } from '@/components/v6/account/security';
import SettingsNav from '@/components/v6/account/settings-nav';
import ErrorCard from '@/components/v6/ui/error-card';
import '@/styles/v6/account.css';

export default function SecurityPage() {
  const { profile, error, reload } = useProfile();
  const [rev, setRev] = useState(0);
  return (
    <AppShell legacy={false} pageTitle="Settings" pageSubtitle="Profile, security and your data">
      <SettingsNav />
      <div className="ac-st1" data-testid="security-page">
        {error && !profile ? <ErrorCard message={error} onRetry={reload} /> : (
          <>
            <TwoFactorCard profile={profile} onChange={() => { reload(); setRev((n) => n + 1); }} />
            <PasswordCard profile={profile} onChanged={() => setRev((n) => n + 1)} />
            <DevicesCard refreshKey={rev} />
          </>
        )}
      </div>
    </AppShell>
  );
}
