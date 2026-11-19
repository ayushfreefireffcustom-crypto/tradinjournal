'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from '@/components/v6/ui/link';
import { authClient } from '@/lib/auth-client';
import { accessApi, type AccessStatusDto } from '@/lib/access-api';
import { invalidateAccessCache, primeAccessCache } from '@/lib/use-platform-access';
import { LoadingScreen } from '@/components/loader';
import StatusCard, { SC_ICONS } from '@/components/v6/auth/status-card';
import { ActivityArt } from '@/components/v6/auth/access-art';
import { AuthError, AuthSubmit } from '@/components/v6/auth/auth-shell';
import { mockStay } from '@/lib/use-redirect-if-authed';

const trades = (n: number) => `${n} closed trade${n === 1 ? '' : 's'}`;

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
        `Need ${trades(s.minTradesRequired)} on Elefin in the last ${s.activityWindowDays} days. You have ${result.tradeCount7d}.`,
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

  const minTrades = status?.minTradesRequired ?? 1;
  const windowDays = status?.activityWindowDays ?? 30;
  const tradeCount = status?.tradeCount7d ?? 0;

  return (
    <StatusCard testId="access-inactive-page" icon={SC_ICONS.warn} art={<ActivityArt days={status?.activityWindowDays ?? 30} />} kicker="Activity required"
      title="Keep trading to keep access"
      body={<>Full access needs at least <b>{trades(minTrades)}</b> on Elefin in the last <b>{windowDays} days</b>. Trade, then recheck; it updates straight away.</>}
      onSignOut={() => void authClient.signOut().then(() => router.replace('/login'))}>
      <div className="x-strip" style={{ ['--n' as string]: 2 }}>
        <div><span>Your trades</span><b className="m">{status ? tradeCount : '—'}</b><small>last {windowDays} days</small></div>
        <div><span>Required</span><b className="m">{minTrades}</b><small>closed on Elefin</small></div>
      </div>
      <form className="au-stacts" onSubmit={e => { e.preventDefault(); void recheck(); }}>
        {error && <AuthError>{error}</AuthError>}
        <AuthSubmit loading={busy}>{busy ? 'Checking…' : 'Recheck activity'}</AuthSubmit>
        <Link href="/brokers" className="x-link au-stlink">Connect or sync your broker</Link>
      </form>
    </StatusCard>
  );
}
