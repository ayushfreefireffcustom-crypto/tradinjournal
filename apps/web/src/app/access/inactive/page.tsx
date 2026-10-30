'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { accessApi, type AccessStatusDto } from '@/lib/access-api';
import { invalidateAccessCache, primeAccessCache } from '@/lib/use-platform-access';
import { LoadingScreen } from '@/components/loader';
import StatusCard, { SC_ICONS } from '@/components/v6/auth/status-card';
import { AuthError, AuthSubmit } from '@/components/v6/auth/auth-shell';
import { mockStay } from '@/lib/use-redirect-if-authed';

export default function InactiveAccessPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [status, setStatus] = useState<AccessStatusDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isPending && !session?.session) router.replace('/login');
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session?.session) return;
    accessApi.status().then(s => {
      setStatus(s);
      if (mockStay()) return;
      if (s.status === 'FULL_ACCESS') router.replace('/dashboard');
      if (s.status === 'ELEFIN_REQUIRED') router.replace('/access/elefin');
      if (s.status === 'MAINTENANCE' && !s.isAdmin) router.replace('/maintenance');
    }).catch(() => {});
  }, [session, router]);

  async function recheck() {
    setBusy(true);
    setError('');
    try {
      const result = await accessApi.checkActivity();
      invalidateAccessCache();
      if (result.active) {
        const s = await accessApi.status();
        primeAccessCache(s);
        router.replace('/dashboard');
        return;
      }
      const s = await accessApi.status();
      primeAccessCache(s);
      setStatus(s);
      setError(
        `Need ${s.minTradesRequired} closed Elefin trades in the last ${s.activityWindowDays} days. You have ${result.tradeCount7d}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activity check failed');
    } finally {
      setBusy(false);
    }
  }

  if (isPending || !session?.session) {
    return <LoadingScreen />;
  }

  const minTrades = status?.minTradesRequired ?? 2;
  const windowDays = status?.activityWindowDays ?? 7;
  const tradeCount = status?.tradeCount7d ?? 0;

  return (
    <StatusCard testId="access-inactive-page" icon={SC_ICONS.warn} tone="r" kicker="Activity required"
      title="Keep trading to keep access"
      body={<>Full access needs at least <b>{minTrades}</b> closed trades on your Elefin account in the last <b>{windowDays}</b> days. Trade, then recheck; it updates instantly.</>}
      onSignOut={() => void authClient.signOut().then(() => router.replace('/login'))}>
      <div className="x-strip" style={{ ['--n' as string]: 2 }}>
        <div><span>Your trades</span><b className="m">{status ? tradeCount : '—'}</b><small>last {windowDays} days</small></div>
        <div><span>Required</span><b className="m">{minTrades}</b><small>closed on Elefin</small></div>
      </div>
      <form className="au-stacts" onSubmit={e => { e.preventDefault(); void recheck(); }}>
        {error && <AuthError>{error}</AuthError>}
        <AuthSubmit loading={busy}>{busy ? 'Checking…' : 'Recheck activity'}</AuthSubmit>
        <Link href="/brokers" className="x-btn x-btn--lg x-btn--full">Connect or sync broker</Link>
      </form>
    </StatusCard>
  );
}
