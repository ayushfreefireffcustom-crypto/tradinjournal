'use client';

// Settings › Activity (H7).
import AppShell from '@/components/app-shell';
import { ActivityList } from '@/components/v6/account/account-cards';
import SettingsNav from '@/components/v6/account/settings-nav';
import '@/styles/v6/account.css';

export default function ActivityPage() {
  return (
    <AppShell legacy={false} pageTitle="Settings" pageSubtitle="Profile, security and your data">
      <SettingsNav />
      <div className="ac-st1" data-testid="activity-page"><ActivityList /></div>
    </AppShell>
  );
}
