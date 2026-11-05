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
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { api, type BrokerAccount } from '@/lib/api';

/** Elefin MT5 servers start with "Elefin" (e.g. Elefin-Trade). Same rule as the API. */
const isElefin = (server: string) => /^elefin/i.test(server.trim());

export default function ElefinAccessPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [mt5Login, setMt5Login] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [check, setCheck] = useState<'broker' | 'api' | null>(null);

  useEffect(() => {
    if (!isPending && !session?.session) router.replace('/login');
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session?.session) return;
    accessApi.status().then(s => {
      setCheck(s.elefinCheck ?? 'api');
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

  if (isPending || !session?.session || !check) {
    return <LoadingScreen />;
  }

  const signOut = () => void authClient.signOut().then(() => router.replace('/login'));
  if (check === 'broker') return <ElefinBrokerCheck onSignOut={signOut} />;

  return (
    <StatusCard testId="access-elefin-page" icon={SC_ICONS.shield} kicker="Access required"
      title="Verify your Elefin account"
      body="TRADElogs is available to traders with an Elefin account opened under our referral. We’ll match your email; add your MT5 login to speed it up."
      onSignOut={signOut}>
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

/**
 * Broker mode: TRADElogs is for Elefin clients only. Connecting an MT5 account on an
 * Elefin server is the check (the bridge logs in with the trader's password).
 */
function ElefinBrokerCheck({ onSignOut }: { onSignOut: () => void }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<BrokerAccount[] | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.accounts.list().then(setAccounts).catch(() => setAccounts([])); }, []);

  async function onConnected(account: BrokerAccount) {
    setConnecting(false);
    setAccounts(a => [account, ...(a ?? []).filter(x => x.id !== account.id)]);
    if (!isElefin(account.server)) {
      setError(`${account.server} isn’t an Elefin server. Connect the MT5 account you opened with Elefin.`);
      return;
    }
    setError('');
    invalidateAccessCache();
    try {
      const s = await accessApi.status();
      primeAccessCache(s);
      if (s.status === 'FULL_ACCESS') { router.replace('/dashboard'); return; }
      if (s.status === 'INACTIVE') { router.replace('/access/inactive'); return; }
      setError('Your Elefin account is connected, but access is still locked. Try again in a minute.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not check access.');
    }
  }

  const others = (accounts ?? []).filter(a => !isElefin(a.server));
  return (
    <StatusCard testId="access-elefin-page" icon={SC_ICONS.shield} kicker="Elefin clients only"
      title="Connect your Elefin account"
      body="TRADElogs is for traders with an Elefin account. Connect your Elefin MT5 account with its investor (read-only) password to get in."
      onSignOut={onSignOut}>
      <div className="au-stack">
        {others.length > 0 && (
          <div className="x-banner" data-testid="elefin-other-accounts">
            <span>Connected, but not Elefin: {others.map(a => `${a.mt5Login} · ${a.server}`).join(', ')}</span>
          </div>
        )}
        {error && <AuthError>{error}</AuthError>}
        <button type="button" className="x-btn x-btn--hi x-btn--lg x-btn--full au-sub-btn" onClick={() => setConnecting(true)} data-testid="elefin-connect">
          Connect Elefin MT5 account
        </button>
        <p className="x-help">No Elefin account yet? Open one with Elefin first, then come back and connect it.</p>
      </div>
      {connecting && <ConnectBrokerModal initialBroker="Elefin" onClose={() => setConnecting(false)} onConnected={a => void onConnected(a)} />}
    </StatusCard>
  );
}
