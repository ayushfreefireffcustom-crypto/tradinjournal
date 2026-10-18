'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { accessApi } from '@/lib/access-api';
import { invalidateAccessCache, primeAccessCache } from '@/lib/use-platform-access';
import { LoadingScreen } from '@/components/loader';
import StatusCard, { SC_ICONS } from '@/components/v3/status-card';
import { AuthSubmit } from '@/components/v3/auth-shell';

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
      <div className="h-dvh"><LoadingScreen /></div>
    );
  }

  return (
    <StatusCard testId="access-elefin-page" icon={SC_ICONS.shield} tone="v" kicker="Access required"
      title={<><b>Verify your</b> <em>Elefin</em> <b>account.</b></>}
      body="TRADElogs is available to traders with an Elefin account opened under our referral. We’ll match your email — add your MT5 login to speed it up."
      onSignOut={() => void authClient.signOut().then(() => router.replace('/login'))}>
      <form onSubmit={submit} className="au-fields" style={{ marginTop: 24 }}>
        <label><span className="au-lbl">Your email</span>
          <span className="au-in sc-in-ro"><input readOnly value={session.user.email} aria-readonly />
            <svg className="chev" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg></span>
        </label>
        <label><span className="au-lbl"><span>Elefin MT5 login <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· optional</span></span></span>
          <span className="au-in"><input type="number" inputMode="numeric" value={mt5Login} onChange={e => setMt5Login(e.target.value)} placeholder="12345678" /></span>
        </label>
        {error && <div className="au-err" role="alert">{error}</div>}
        <AuthSubmit loading={busy}>{busy ? 'Verifying…' : 'Verify account'}</AuthSubmit>
      </form>
    </StatusCard>
  );
}
