'use client';

// Partner mode (ELEFIN_VERIFY_MODE=partner): TRADElogs is for Elefin traders confirmed as a
// TRADElogs partner's client. Being at Elefin isn't enough on its own. This screen shows the
// three steps with the trader's real state and the one thing they can do next.
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from '@/components/v6/ui/link';
import { authClient } from '@/lib/auth-client';
import { accessApi, type AccessStatusDto } from '@/lib/access-api';
import { ibApi, type ClientAccess } from '@/lib/ib-api';
import { invalidateAccessCache, primeAccessCache } from '@/lib/use-platform-access';
import StatusCard, { SC_ICONS } from './status-card';
import { AuthError } from './auth-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';

type StepState = 'done' | 'now' | 'todo' | 'bad';
const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const isElefin = (server: string) => /^elefin/i.test(server.trim());

export default function PartnerCheck({ status, onSignOut }: { status: AccessStatusDto | null; onSignOut: () => void }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [d, setD] = useState<ClientAccess | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [waitedLong, setWaitedLong] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const email = session?.user?.email ?? '';
  const emailOk = !!(session?.user as { emailVerified?: boolean } | undefined)?.emailVerified;

  /** Where the trader stands with their partner; a pass goes straight on. */
  const refresh = useCallback(async (askElefin = false): Promise<AccessStatusDto | null> => {
    try {
      const s = askElefin ? await accessApi.verifyElefin({ email }) : await accessApi.status();
      invalidateAccessCache();
      primeAccessCache(s);
      if (s.status === 'FULL_ACCESS') { router.replace('/dashboard'); return s; }
      if (s.status === 'INACTIVE') { router.replace('/access/inactive'); return s; }
      const a = await ibApi.access();
      if (alive.current) { setD(a); setLoadErr(''); }
      return s;
    } catch (e) {
      if (alive.current) setLoadErr(e instanceof Error ? e.message : 'Could not load your partner status.');
      return null;
    }
  }, [email, router]);

  useEffect(() => { void refresh(); }, [refresh]);

  const verifiedAcct = d?.accounts.find(a => a.status === 'VERIFIED' && a.brokerKey === 'elefin');
  const confirmed = d?.elefin?.status === 'VERIFIED' || !!verifiedAcct;
  // Elefin can only be asked when the partner has a working Elefin key.
  const canAsk = d?.partnerElefin !== false;
  const awaiting = !!d?.partner && !confirmed && !d.elefin && emailOk && canAsk;

  // Just linked, or Elefin hasn't answered yet: look again every 6 s for two minutes.
  useEffect(() => {
    if (!awaiting) return;
    setWaitedLong(false);
    const t = setInterval(() => void refresh(), 6000);
    const stop = setTimeout(() => { clearInterval(t); if (alive.current) setWaitedLong(true); }, 120_000);
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [awaiting, refresh]);

  async function checkAgain() {
    setBusy(true); setNote('');
    const s = await refresh(true);
    if (alive.current) {
      setBusy(false);
      if (s && s.status === 'ELEFIN_REQUIRED') setNote('Not confirmed yet. Elefin is asked again at most every 10 minutes.');
    }
  }

  async function onConnected(acct: { server: string }) {
    setConnecting(false);
    setNote(isElefin(acct.server)
      ? `Connected. ${d?.partner ? first(d.partner.name) : 'Your partner'} can now find it on their Elefin client list.`
      : `${acct.server} isn’t an Elefin server. Connect the MT5 account you opened with Elefin.`);
    await refresh();
  }

  const partner = d?.partner;
  const who = partner ? first(partner.name) : 'your partner';
  const e = d?.elefin;
  const acctProblem = d?.accounts.find(a => a.brokerKey === 'elefin' && a.status !== 'VERIFIED' && a.status !== 'PENDING');
  const min = status?.minTradesRequired ?? 1;
  const days = status?.activityWindowDays ?? 30;

  const confirm: { state: StepState; note: ReactNode; action?: ReactNode } = !partner
    ? { state: 'todo', note: 'Once you’re linked, Elefin is asked whether you’re their client.' }
    : confirmed
      ? { state: 'done', note: verifiedAcct ? `Found on ${who}’s Elefin client list` : `Elefin confirmed you’re ${who}’s client` }
      : !emailOk
        ? { state: 'now', note: <>Confirm your email first. Elefin is asked using it: <b>{email}</b></>, action: <Link href="/verify" className="x-btn x-btn--sm">Confirm email</Link> }
        : e && e.status !== 'VERIFIED'
          ? {
            state: 'bad',
            // Elefin's own reason already says what to do; only add a hint when there isn't one.
            note: e.reason ?? (e.held ? 'Elefin has your account on hold.' : <>Elefin doesn’t list {email} as {who}’s client. Sign up here with the email you used at Elefin, or ask {who} to confirm you.</>),
          }
          : acctProblem?.reason
            ? { state: 'bad', note: acctProblem.reason }
            : !canAsk
              ? { state: 'now', note: <>{who} confirms clients from their Elefin client list. Connect your Elefin MT5 account so they can find it.</> }
              : waitedLong
              ? { state: 'now', note: <>Elefin hasn’t answered yet. {who} can also confirm you from their client list: connect your Elefin MT5 account so they can find it.</> }
              : { state: 'now', note: 'Checking with Elefin…' };

  const steps: Array<{ key: string; title: string; state: StepState; note: ReactNode; action?: ReactNode }> = [
    {
      key: 'partner', title: partner ? `Linked to ${partner.name}` : 'Link your partner',
      state: partner ? (partner.status === 'ACTIVE' ? 'done' : 'bad') : 'now',
      note: partner
        ? (partner.status === 'ACTIVE' ? <>Code <b>{partner.code}</b></> : `${who}’s partner account is paused, so their clients can’t be confirmed right now.`)
        : 'Use your partner’s link or type their code.',
    },
    { key: 'confirm', title: 'Confirmed as their Elefin client', ...confirm },
    { key: 'trade', title: 'Keep trading', state: 'todo', note: `${min} closed trade${min === 1 ? '' : 's'} on Elefin every ${days} days keeps you in.` },
  ];

  return (
    <StatusCard testId="access-elefin-page" icon={SC_ICONS.shield} kicker="Partner clients only"
      title="Get confirmed by your partner"
      body="TRADElogs is for Elefin traders who joined through one of our partners. You’re in as soon as you’re confirmed as their client."
      onSignOut={onSignOut}>
      {loadErr && !d && <div className="au-stacts"><AuthError>{loadErr}</AuthError><button type="button" className="x-btn" onClick={() => void refresh()}>Try again</button></div>}
      {!d && !loadErr && <div className="pc-sk" aria-busy aria-label="Loading" />}
      {d && (
        <>
          <ol className="pc-steps" data-testid="partner-check-steps">
            {steps.map((s, i) => (
              <li key={s.key} className={`pc-step ${s.state}`} data-testid={`pc-${s.key}`} data-state={s.state}>
                <span className="pc-i" aria-hidden>{s.state === 'done' ? '✓' : s.state === 'bad' ? '!' : i + 1}</span>
                <div className="pc-t">
                  <b>{s.title}</b>
                  <span>{s.note}</span>
                  {s.action && <div className="pc-a">{s.action}</div>}
                </div>
              </li>
            ))}
          </ol>
          {!partner && d.canJoin && <JoinCode onJoined={a => { setD(a); setNote(''); }} />}
          {note && <p className="pc-note" role="status">{note}</p>}
          <div className="au-stacts">
            {partner && !confirmed && canAsk && (
              <button type="button" className="x-btn x-btn--hi x-btn--lg x-btn--full" onClick={() => void checkAgain()} disabled={busy || !emailOk} data-testid="pc-check">
                {busy ? 'Checking…' : 'Check again'}
              </button>
            )}
            {partner && !confirmed && (
              <button type="button" className={`x-btn x-btn--full${canAsk ? '' : ' x-btn--hi x-btn--lg'}`} onClick={() => setConnecting(true)} data-testid="pc-connect">Connect Elefin MT5 account</button>
            )}
            <Link href="/access" className="x-link au-stlink" data-testid="pc-partner-page">{partner ? 'Open your partner page' : 'How partners work'}</Link>
          </div>
        </>
      )}
      {connecting && <ConnectBrokerModal initialBroker="Elefin" onClose={() => setConnecting(false)} onConnected={a => void onConnected(a)} />}
    </StatusCard>
  );
}

/** No partner yet: type their code. */
function JoinCode({ onJoined }: { onJoined: (d: ClientAccess) => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const c = code.trim();
    if (!c) return;
    setBusy(true); setErr('');
    try { onJoined(await ibApi.join(c)); } catch (x) { setErr(x instanceof Error ? x.message : 'That code didn’t work.'); } finally { setBusy(false); }
  }
  return (
    <form className="pc-join" onSubmit={submit}>
      <label htmlFor="pc-code" className="pc-join-l">Partner code</label>
      <div className="pc-join-r">
        <input id="pc-code" className="x-input" value={code} onChange={ev => setCode(ev.target.value.toUpperCase())} placeholder="e.g. AYUSH"
          autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={32} aria-invalid={err ? true : undefined} data-testid="pc-code" />
        <button type="submit" className="x-btn x-btn--hi" disabled={busy || !code.trim()} data-testid="pc-join">{busy ? 'Linking…' : 'Link'}</button>
      </div>
      {err && <AuthError>{err}</AuthError>}
      <small className="pc-join-h">You can link a partner once, and it stays on your account.</small>
    </form>
  );
}
