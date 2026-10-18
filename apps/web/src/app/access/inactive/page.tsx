'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { accessApi, type AccessStatusDto } from '@/lib/access-api';
import { invalidateAccessCache, primeAccessCache } from '@/lib/use-platform-access';
import { LoadingScreen } from '@/components/loader';
import StatusCard, { SC_ICONS } from '@/components/v3/status-card';
import { AuthSubmit } from '@/components/v3/auth-shell';

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
    return (
      <div className="h-dvh"><LoadingScreen /></div>
    );
  }

  const minTrades = status?.minTradesRequired ?? 2;
  const windowDays = status?.activityWindowDays ?? 7;
  const tradeCount = status?.tradeCount7d ?? 0;

  return (
    <StatusCard testId="access-inactive-page" icon={SC_ICONS.warn} tone="a" bar kicker="Activity required"
      title={<><b>Keep trading to</b> <em>stay in.</em></>}
      body={<>Full access needs at least <b>{minTrades}</b> closed trades on your Elefin account in the last <b>{windowDays}</b> days. Trade, then recheck — it updates instantly.</>}
      onSignOut={() => void authClient.signOut().then(() => router.replace('/login'))}>
      <div className="sc-tiles">
        <div className="a"><span>Your trades</span><b className="num">{tradeCount}</b><small>last {windowDays} days</small></div>
        <div className="g"><span>Required</span><b className="num">{minTrades}</b><small>closed on Elefin</small></div>
      </div>
      {error && <div className="au-err" role="alert" style={{ marginTop: 16 }}>{error}</div>}
      <form className="sc-actions" onSubmit={e => { e.preventDefault(); void recheck(); }}>
        <AuthSubmit loading={busy}>{busy ? 'Checking…' : 'Recheck activity'}</AuthSubmit>
        <Link href="/brokers" className="sc-ghost">Connect / sync broker</Link>
      </form>
    </StatusCard>
  );
}
