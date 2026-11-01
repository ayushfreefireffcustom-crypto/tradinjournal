'use client';

// Settings: profile, location and notifications (event/news alerts plus the
// opt-in weekly review email — nothing is sent until the trader turns it on).
import AppShell from '@/components/app-shell';
import { LocationSection, NotificationsSection, ProfileSection, SettingsAside } from '@/components/v6/account/settings';
import { PlanCard, ProfileEditCard } from '@/components/v6/account/account-cards';
import { useProfile } from '@/components/v6/account/security';
import SettingsNav from '@/components/v6/account/settings-nav';
import { useAccounts } from '@/lib/use-accounts';
import type { BrokerAccount } from '@/lib/api';
import '@/styles/v6/account.css';

export default function SettingsPage() {
  const { accounts, selected, select } = useAccounts();
  const { profile, setProfile } = useProfile();
  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="Settings" pageSubtitle="Profile, security and your data">
      <SettingsNav />
      <div className="ac-st" data-testid="settings-page">
        <div className="ac-st-main">
          <ProfileSection accountCount={accounts.length} />
          <ProfileEditCard profile={profile} onSaved={setProfile} />
          <PlanCard />
          <LocationSection />
          <NotificationsSection />
        </div>
        <SettingsAside />
      </div>
    </AppShell>
  );
}
