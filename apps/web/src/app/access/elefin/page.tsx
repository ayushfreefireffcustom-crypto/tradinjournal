'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { accessApi } from '@/lib/access-api';
import { invalidateAccessCache, primeAccessCache } from '@/lib/use-platform-access';
import Logo from '@/components/logo';
import { Loader, LoadingScreen } from '@/components/loader';

export default function ElefinAccessPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [mt5Login, setMt5Login] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isPending && !session?.session) router.replace('/login');
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session?.session) return;
    accessApi.status().then(s => {
      if (s.status === 'FULL_ACCESS') router.replace('/dashboard');
      if (s.status === 'INACTIVE') router.replace('/access/inactive');
      if (s.status === 'MAINTENANCE' && !s.isAdmin) router.replace('/maintenance');
    }).catch(() => {});
  }, [session, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await accessApi.verifyElefin({
        email: session?.user?.email,
        mt5Login: mt5Login ? Number(mt5Login) : undefined,
      });
      invalidateAccessCache();
      primeAccessCache(result);
      if (result.status === 'FULL_ACCESS') {
        router.replace('/dashboard');
        return;
      }
      if (result.elefinStatus === 'VERIFIED' || result.status === 'INACTIVE') {
        router.replace('/access/inactive');
        return;
      }
      setError('No Elefin account found under our referral. Open an account with us first, then try again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
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

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-4 bg-app" data-testid="access-elefin-page">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo height={36} />
        </div>
        <div className="tcard p-6 sm:p-8">
          <div className="text-[10px] tracking-[0.2em] text-fg-3">// ACCESS REQUIRED</div>
          <h1 className="font-display font-black text-xl mt-2 text-fg">Verify your Elefin account</h1>
          <p className="text-sm text-fg-3 mt-2 leading-relaxed">
            TradeLogs is available to traders with an Elefin account opened under our referral.
            We&apos;ll verify your account before you can connect MT5.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="text-[10px] tracking-[0.14em] text-fg-3">YOUR EMAIL</label>
              <input
                readOnly
                value={session.user.email}
                className="mt-1 w-full bg-surface border border-border-soft rounded px-3 py-2 text-sm text-fg-3"
              />
            </div>
            <div>
              <label className="text-[10px] tracking-[0.14em] text-fg-3">ELEFIN MT5 LOGIN (optional)</label>
              <input
                type="number"
                value={mt5Login}
                onChange={e => setMt5Login(e.target.value)}
                placeholder="12345678"
                className="mt-1 w-full bg-app border border-border-soft rounded px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-sm text-loss" role="alert">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5">
              {busy ? <Loader size={16} className="!gap-0 mx-auto" /> : 'VERIFY ACCOUNT'}
            </button>
          </form>

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
