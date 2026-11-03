'use client';

// A switched-off feature's page: the app frame and one designed empty state.
import AppShell from '@/components/app-shell';
import Link from '@/components/v6/ui/link';
import EmptyState, { type EmptyIcon } from './empty-state';

export default function ComingSoon({ title, what, icon = 'plug' }: { title: string; what: string; icon?: EmptyIcon }) {
  return (
    <AppShell legacy={false} pageTitle={title}>
      <div className="x-page">
        <div className="x-card">
          <EmptyState icon={icon} ghost="cards" title="Coming soon" testId="coming-soon"
            actions={<Link className="x-btn" href="/dashboard">Back to your dashboard</Link>}>
            {what} isn&rsquo;t switched on yet. Your journal, markets and strategy tools all work today.
          </EmptyState>
        </div>
      </div>
    </AppShell>
  );
}
