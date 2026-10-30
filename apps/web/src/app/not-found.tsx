'use client';

import Link from 'next/link';
import StatusCard, { SC_ICONS } from '@/components/v6/auth/status-card';

export default function NotFound() {
  return (
    <StatusCard testId="not-found-page" icon={SC_ICONS.search} kicker="Error 404" title="Page not found"
      body="The link may be broken, or the page may have moved.">
      <div className="au-stacts">
        <Link href="/dashboard" className="x-btn x-btn--hi x-btn--lg x-btn--full">Go to dashboard</Link>
        <Link href="/" className="x-btn x-btn--lg x-btn--full x-btn--ghost">Back to home</Link>
      </div>
    </StatusCard>
  );
}
