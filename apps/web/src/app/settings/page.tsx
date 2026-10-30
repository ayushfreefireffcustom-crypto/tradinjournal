'use client';

// Settings: profile, location and notifications (event/news alerts plus the
// opt-in weekly review email — nothing is sent until the trader turns it on).
import AppShell from '@/components/app-shell';
import { LocationSection, NotificationsSection, ProfileSection, SettingsAside } from '@/components/v6/account/settings';
import { useAccounts } from '@/lib/use-accounts';
import type { BrokerAccount } from '@/lib/api';
import '@/styles/v6/account.css';

export default function SettingsPage() {
  const { accounts, selected, select } = useAccounts();
  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="Settings" pageSubtitle="Profile, location and notifications">
      <div className="ac-st" data-testid="settings-page">
        <div className="ac-st-main">
          <ProfileSection accountCount={accounts.length} />
          <LocationSection />
          <NotificationsSection />
        </div>
        <SettingsAside />
      </div>
    </AppShell>
  );
}
