'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Logo from '@/components/logo';
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
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-app" data-testid="maintenance-page">
      <div className="w-full max-w-lg text-center">
        <div className="flex justify-center mb-8">
          <Logo height={40} />
        </div>
        <div className="tcard p-8">
          <div className="text-[10px] tracking-[0.24em] text-warning">// MAINTENANCE</div>
          <h1 className="font-display font-black text-2xl mt-3 text-fg">We&apos;ll be right back</h1>
          <p className="text-sm text-fg-3 mt-3 leading-relaxed">
            {message ?? 'The platform is temporarily unavailable while we perform upgrades.'}
          </p>
          <Link href="/" className="btn btn-ghost mt-6 inline-flex text-[11px]">
            BACK TO HOME
          </Link>
        </div>
      </div>
    </div>
  );
}
