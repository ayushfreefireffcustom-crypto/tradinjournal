'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { accessApi } from '@/lib/access-api';
import { invalidateAccessCache, primeAccessCache } from '@/lib/use-platform-access';
import { LoadingScreen } from '@/components/loader';
import StatusCard, { SC_ICONS } from '@/components/v6/auth/status-card';
import { AuthError, AuthSubmit } from '@/components/v6/auth/auth-shell';
import { mockStay } from '@/lib/use-redirect-if-authed';

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
      if (mockStay()) return;
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
    return <LoadingScreen />;
  }

  return (
    <StatusCard testId="access-elefin-page" icon={SC_ICONS.shield} kicker="Access required"
      title="Verify your Elefin account"
      body="TRADElogs is available to traders with an Elefin account opened under our referral. We’ll match your email; add your MT5 login to speed it up."
      onSignOut={() => void authClient.signOut().then(() => router.replace('/login'))}>
      <form onSubmit={submit} className="au-stack">
        <div className="x-field"><label htmlFor="el-email">Your email</label>
          <div className="au-inw"><input id="el-email" className="x-input" readOnly value={session.user.email} aria-readonly /><span className="au-lock" aria-hidden>{SC_ICONS.lock}</span></div>
        </div>
        <div className="x-field"><label htmlFor="el-mt5">Elefin MT5 login <span className="au-opt">· optional</span></label>
          <input id="el-mt5" className="x-input" type="number" inputMode="numeric" value={mt5Login} onChange={e => setMt5Login(e.target.value)} placeholder="12345678" aria-invalid={error ? true : undefined} />
          {error && <AuthError>{error}</AuthError>}
        </div>
        <AuthSubmit loading={busy}>{busy ? 'Verifying…' : 'Verify account'}</AuthSubmit>
      </form>
    </StatusCard>
  );
}
