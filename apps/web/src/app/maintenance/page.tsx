'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StatusCard, { SC_ICONS } from '@/components/v3/status-card';
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
    <StatusCard testId="maintenance-page" icon={SC_ICONS.tool} tone="v" kicker="Scheduled maintenance"
      title={<><b>We’ll be right</b> <em>back.</em></>}
      body={message ?? 'The platform is temporarily unavailable while we perform upgrades.'}>
      <p className="sc-body" style={{ fontSize: 15 }}>Your journal, trades and broker connections are safe — syncing resumes automatically.</p>
      <div className="sc-actions"><Link href="/" className="sc-ghost">Back to home</Link></div>
    </StatusCard>
  );
}
