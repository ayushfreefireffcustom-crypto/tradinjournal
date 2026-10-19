'use client';

// Admin pages render a clear "no access" state for non-admins instead of an empty
// admin shell (the API already refuses them; this is the UI half).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePlatformAccess } from '@/lib/use-platform-access';

export default function AdminOnly({ children }: { children: ReactNode }) {
  const { status } = usePlatformAccess();
  if (status && !status.isAdmin) {
    return (
      <section className="v3-card pt-gate" data-testid="admin-only">
        <span className="pt-gate-ic r">!</span>
        <h2>This page is for admins.</h2>
        <p>You don&rsquo;t have access to the admin tools. <Link href="/dashboard">Back to your dashboard</Link></p>
      </section>
    );
  }
  return <>{children}</>;
}
