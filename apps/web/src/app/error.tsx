'use client';

import { useEffect } from 'react';
import Link from '@/components/v6/ui/link';
import StatusCard, { SC_ICONS } from '@/components/v6/auth/status-card';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <StatusCard testId="error-page" tone="r" icon={SC_ICONS.warn} kicker="Something went wrong" title="This page hit an error"
      body={<>Your data is safe. Try again, and if it keeps happening, reload the app.{error.digest && <><br /><span className="m x-dim">Ref {error.digest}</span></>}</>}>
      <div className="au-stacts">
        <button type="button" onClick={reset} className="x-btn x-btn--hi x-btn--lg x-btn--full">Try again</button>
        <Link href="/dashboard" className="x-btn x-btn--lg x-btn--full x-btn--ghost">Go to dashboard</Link>
      </div>
    </StatusCard>
  );
}
