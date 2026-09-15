'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';
import { accessApi, type AccessStatusDto } from '@/lib/access-api';
import { invalidateAccessCache, primeAccessCache } from '@/lib/use-platform-access';
import Logo from '@/components/logo';
import { Warning, ArrowsClockwise } from '@phosphor-icons/react';
import { LoadingScreen } from '@/components/loader';

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
      <div className="h-dvh bg-app">
        <LoadingScreen />
      </div>
    );
  }

  const minTrades = status?.minTradesRequired ?? 2;
  const windowDays = status?.activityWindowDays ?? 7;
  const tradeCount = status?.tradeCount7d ?? 0;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-app" data-testid="access-inactive-page">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo height={36} />
        </div>
        <div className="tcard p-6 sm:p-8 border-l-4 border-l-warning">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.2em] text-warning">
            <Warning size={14} weight="fill" />
            // ACTIVITY REQUIRED
          </div>
          <h1 className="font-display font-black text-xl mt-2 text-fg">Keep trading to stay in</h1>
          <p className="text-sm text-fg-3 mt-2 leading-relaxed">
            Your Elefin account is verified. After your first{' '}
            <span className="text-fg numeric">{windowDays}</span> days from signup, platform access
            requires at least{' '}
            <span className="text-fg numeric">{minTrades}</span> closed Elefin trades in the last{' '}
            <span className="text-fg numeric">{windowDays}</span> days to stay active.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <div className="border border-border-soft rounded p-3 bg-surface/50">
              <div className="text-[9px] tracking-widest text-fg-3">YOUR TRADES</div>
              <div className="font-display font-black text-2xl numeric mt-1 text-warning">{tradeCount}</div>
              <div className="text-[10px] text-fg-3">last {windowDays}d</div>
            </div>
            <div className="border border-border-soft rounded p-3 bg-surface/50">
              <div className="text-[9px] tracking-widest text-fg-3">REQUIRED</div>
              <div className="font-display font-black text-2xl numeric mt-1 text-profit">{minTrades}</div>
              <div className="text-[10px] text-fg-3">closed Elefin</div>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-loss" role="alert">{error}</p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void recheck()}
              disabled={busy}
              className="btn btn-primary w-full py-2.5 text-[11px] tracking-widest flex items-center justify-center gap-2"
            >
              <ArrowsClockwise size={14} className={busy ? 'animate-spin' : ''} />
              {busy ? 'CHECKING…' : 'RECHECK ACTIVITY'}
            </button>
            <Link
              href="/brokers"
              className="btn btn-ghost border border-border-soft w-full py-2.5 text-[11px] tracking-widest text-center"
            >
              CONNECT / SYNC BROKER
            </Link>
          </div>

          <p className="text-[11px] text-fg-3 mt-4 text-center">
            <button
              type="button"
              onClick={() => void authClient.signOut().then(() => router.replace('/login'))}
              className="hover:text-fg underline-offset-2 hover:underline"
            >
              Sign out
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
