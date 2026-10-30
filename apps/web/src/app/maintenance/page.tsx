'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StatusCard, { SC_ICONS } from '@/components/v6/auth/status-card';
import { accessApi } from '@/lib/access-api';

export default function MaintenancePage() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    accessApi.maintenance().then(m => {
      setMessage(m.message);
      if (!m.enabled) window.location.href = '/';
    }).catch(() => setMessage('We are performing scheduled maintenance. Please check back soon.'));
  }, []);

  return (
    <StatusCard testId="maintenance-page" icon={SC_ICONS.tool} kicker="Scheduled maintenance"
      title="We’ll be right back"
      body={<>
        <p style={{ margin: 0 }}>{message ?? 'The platform is temporarily unavailable while we perform upgrades.'}</p>
        <p style={{ margin: '10px 0 0' }}>Your journal, trades and broker connections are safe. Syncing resumes automatically.</p>
      </>}>
      <div className="au-stacts"><Link href="/" className="x-btn x-btn--lg x-btn--full">Back to home</Link></div>
    </StatusCard>
  );
}
