'use client';

// Admin pages render a clear "no access" state for non-admins instead of an empty
// admin shell (the API already refuses them; this is the UI half).
import Link from '@/components/v6/ui/link';
import type { ReactNode } from 'react';
import { usePlatformAccess } from '@/lib/use-platform-access';
import { ILock } from '@/components/v6/icons';

export default function AdminOnly({ children }: { children: ReactNode }) {
  const { status } = usePlatformAccess();
  if (status && !status.isAdmin) {
    return (
      <section className="x-card x-empty" data-testid="admin-only">
        <span className="x-ic"><ILock size={22} /></span>
        <b>This page is for admins</b>
        <p>You don&rsquo;t have access to the admin tools.</p>
        <Link href="/dashboard" className="x-btn">Back to your dashboard</Link>
      </section>
    );
  }
  return <>{children}</>;
}
