'use client';

// Settings › Your data (H6): download it, or delete the account.
import AppShell from '@/components/app-shell';
import { DeleteCard, ExportCard } from '@/components/v6/account/account-cards';
import { useProfile } from '@/components/v6/account/security';
import SettingsNav from '@/components/v6/account/settings-nav';
import '@/styles/v6/account.css';
import '@/styles/v6/copy.css';

export default function DataPage() {
  const { profile } = useProfile();
  return (
    <AppShell legacy={false} pageTitle="Settings" pageSubtitle="Profile, security and your data">
      <SettingsNav />
      <div className="ac-st1" data-testid="data-page">
        <ExportCard />
        <DeleteCard email={profile?.email ?? null} />
      </div>
    </AppShell>
  );
}
