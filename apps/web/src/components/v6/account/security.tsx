'use client';

// Security settings (H4, H5): password, two-factor sign-in with an
// authenticator app and backup codes, and the devices signed in.
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { Modal } from '@/components/v6/copy/parts';
import { accountApi, deviceOf, shownIp, type Profile } from '@/lib/account-api';
import { authClient } from '@/lib/auth-client';
import '@/styles/v6/account.css';

type AuthErr = { message?: string; status?: number } | null | undefined;
const msgOf = (e: AuthErr, fallback: string) => (e?.status === 429 ? 'Too many tries. Wait a minute.' : e?.message && !/^\[/.test(e.message) ? e.message : fallback);

// ── Password ──
export function PasswordCard({ profile, onChanged }: { profile: Profile | null; onChanged?: () => void }) {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [others, setOthers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (profile && !profile.hasPassword) {
    return (
      <section className="x-card ac-st-card" aria-labelledby="sec-pw" data-testid="sec-password">
        <div className="x-ch"><h2 id="sec-pw">Password</h2></div>
        <p className="x-muted">You sign in with {profile.signInMethods.includes('google') ? 'Google' : 'a sign-in link'}, so there’s no TRADElogs password to change. Your Google account’s own two-step verification protects your sign-in.</p>
      </section>
    );
  }
  const tooShort = next.length > 0 && next.length < 8;
  const mismatch = again.length > 0 && again !== next;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort || mismatch || !cur || !next) return;
    setBusy(true); setErr('');
    const r = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: others });
    setBusy(false);
    if (r?.error) { setErr(r.error.status === 400 || /password/i.test(r.error.message ?? '') ? 'Your current password isn’t right.' : msgOf(r.error, 'Couldn’t change the password.')); return; }
    setCur(''); setNext(''); setAgain('');
    onChanged?.();
    toast.success(others ? 'Password changed. Other devices are signed out.' : 'Password changed.');
  }
  return (
    <section className="x-card ac-st-card" aria-labelledby="sec-pw" data-testid="sec-password">
      <div className="x-ch"><h2 id="sec-pw">Password</h2></div>
      <form className="ac-form" onSubmit={save}>
        <label className="x-field"><span>Current password</span><input className="x-input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required data-testid="sec-pw-current" /></label>
        <label className="x-field"><span>New password</span><input className="x-input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} aria-invalid={tooShort} data-testid="sec-pw-new" />{tooShort && <small className="neg">At least 8 characters.</small>}</label>
        <label className="x-field"><span>New password again</span><input className="x-input" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required aria-invalid={mismatch} data-testid="sec-pw-again" />{mismatch && <small className="neg">The two don’t match.</small>}</label>
        <label className="ac-check"><input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} /> Sign out my other devices</label>
        {err && <p className="cp-err" data-testid="sec-pw-error">{err}</p>}
        <div><button className="x-btn x-btn--hi" disabled={busy || !cur || !next || tooShort || mismatch || !again} data-testid="sec-pw-save">{busy ? 'Saving…' : 'Change password'}</button></div>
      </form>
    </section>
  );
}

// ── Two-factor ──
function BackupCodes({ codes }: { codes: string[] }) {
  const toast = useToast();
  const text = codes.join('\n');
  return (
    <div className="ac-codes" data-testid="sec-2fa-codes">
      <p>Save these somewhere safe, away from your phone. Each one signs you in once if you lose your authenticator app. You won’t see them again.</p>
      <ol className="m">{codes.map((c) => <li key={c}>{c}</li>)}</ol>
      <div className="ac-codes-act">
        <button type="button" className="x-btn x-btn--sm" onClick={() => { void navigator.clipboard?.writeText(text).then(() => toast.success('Copied'), () => toast.error('Copy didn’t work; select them instead')); }}>Copy</button>
        <button type="button" className="x-btn x-btn--sm" onClick={() => { const u = URL.createObjectURL(new Blob([`TRADElogs backup codes\n\n${text}\n`], { type: 'text/plain' })); const a = document.createElement('a'); a.href = u; a.download = 'tradelogs-backup-codes.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }}>Download</button>
      </div>
    </div>
  );
}

export function TwoFactorCard({ profile, onChange }: { profile: Profile | null; onChange: () => void }) {
  const toast = useToast();
  const [flow, setFlow] = useState<null | { kind: 'enable' | 'disable' | 'codes'; step: 'password' | 'scan' | 'done'; uri?: string; codes?: string[] }>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const on = !!profile?.twoFactorEnabled;
  const close = () => { setFlow(null); setPassword(''); setCode(''); setErr(''); };
  async function withPassword() {
    if (!flow) return;
    setBusy(true); setErr('');
    const r = flow.kind === 'enable' ? await authClient.twoFactor.enable({ password })
      : flow.kind === 'disable' ? await authClient.twoFactor.disable({ password })
      : await authClient.twoFactor.generateBackupCodes({ password });
    setBusy(false);
    if (r?.error) { setErr(r.error.status === 400 || /password/i.test(r.error.message ?? '') ? 'That password isn’t right.' : msgOf(r.error, 'That didn’t work.')); return; }
    if (flow.kind === 'enable') setFlow({ ...flow, step: 'scan', uri: r.data.totpURI, codes: r.data.backupCodes });
    else if (flow.kind === 'codes') setFlow({ ...flow, step: 'done', codes: r.data.backupCodes });
    else { close(); toast.success('Two-factor sign-in is off.'); onChange(); }
    setPassword('');
  }
  async function verify() {
    setBusy(true); setErr('');
    const r = await authClient.twoFactor.verifyTotp({ code: code.trim() });
    setBusy(false);
    if (r?.error) { setErr('That code didn’t work. Check the time on your phone and use the newest code.'); return; }
    setFlow((f) => (f ? { ...f, step: 'done' } : f));
    setCode('');
    onChange();
  }
  const secret = flow?.uri ? new URL(flow.uri).searchParams.get('secret') : null;
  return (
    <section className="x-card ac-st-card" aria-labelledby="sec-2fa" data-testid="sec-2fa">
      <div className="x-ch"><h2 id="sec-2fa">Two-factor sign-in</h2>{profile && <span className={`x-tag ${on ? 'x-tag--g' : ''}`} data-testid="sec-2fa-state">{on ? 'On' : 'Off'}</span>}</div>
      {!profile ? <div className="x-skel" style={{ height: 60 }} /> : !profile.hasPassword ? (
        <p className="x-muted">Two-factor protects password sign-ins. You sign in with Google, so turn on two-step verification in your Google account instead.</p>
      ) : (
        <>
          <p className="x-muted">{on ? 'Signing in with your password also asks for a code from your authenticator app.' : 'Ask for a code from an authenticator app (Google Authenticator, 1Password, Authy…) whenever you sign in with your password. Recommended if you connect an exchange.'}</p>
          <div className="ac-row-btns">
            {on ? (
              <>
                <button className="x-btn" onClick={() => setFlow({ kind: 'codes', step: 'password' })} data-testid="sec-2fa-codes-new">New backup codes</button>
                <button className="x-btn x-btn--ghost" onClick={() => setFlow({ kind: 'disable', step: 'password' })} data-testid="sec-2fa-off">Turn off</button>
              </>
            ) : <button className="x-btn x-btn--hi" onClick={() => setFlow({ kind: 'enable', step: 'password' })} data-testid="sec-2fa-on">Turn on</button>}
          </div>
        </>
      )}
      {flow && (
        <Modal title={flow.kind === 'enable' ? 'Turn on two-factor sign-in' : flow.kind === 'disable' ? 'Turn off two-factor sign-in' : 'New backup codes'}
          sub={flow.step === 'password' ? 'Confirm it’s you with your password.' : flow.kind === 'enable' && flow.step === 'scan' ? 'Scan the code with your authenticator app, then enter the 6-digit code it shows.' : undefined}
          onClose={close} busy={busy} testId="sec-2fa-dialog"
          footer={flow.step === 'password' ? <><button className="x-btn" onClick={close}>Cancel</button><button className={`x-btn ${flow.kind === 'disable' ? '' : 'x-btn--hi'}`} onClick={() => void withPassword()} disabled={busy || !password} data-testid="sec-2fa-continue">{busy ? 'Checking…' : flow.kind === 'disable' ? 'Turn off' : 'Continue'}</button></>
            : flow.step === 'scan' ? <><button className="x-btn" onClick={close}>Cancel</button><button className="x-btn x-btn--hi" onClick={() => void verify()} disabled={busy || code.length !== 6} data-testid="sec-2fa-verify">{busy ? 'Checking…' : 'Turn on'}</button></>
            : <button className="x-btn x-btn--hi" onClick={() => { close(); toast.success(flow.kind === 'enable' ? 'Two-factor sign-in is on.' : 'New backup codes saved; the old ones no longer work.'); }} data-testid="sec-2fa-done">I’ve saved them</button>}>
          {flow.step === 'password' && (
            <form onSubmit={(e) => { e.preventDefault(); void withPassword(); }}>
              <label className="x-field"><span>Password</span><input className="x-input" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="sec-2fa-password" /></label>
              {flow.kind === 'codes' && <p className="x-muted ac-fine">Your current backup codes stop working.</p>}
            </form>
          )}
          {flow.step === 'scan' && flow.uri && (
            <form className="ac-2fa-scan" onSubmit={(e) => { e.preventDefault(); if (code.length === 6) void verify(); }}>
              <div className="ac-qr" aria-label="QR code for your authenticator app"><QRCodeSVG value={flow.uri} size={176} marginSize={2} data-testid="sec-2fa-qr" /></div>
              <div>
                <p className="x-muted ac-fine">Can’t scan? Type this key into the app:</p>
                <code className="ac-secret m" data-testid="sec-2fa-secret">{secret?.replace(/(.{4})/g, '$1 ').trim()}</code>
                <label className="x-field"><span>Code from the app</span><input className="x-input m" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} data-testid="sec-2fa-code" /></label>
              </div>
            </form>
          )}
          {flow.step === 'done' && flow.codes && <BackupCodes codes={flow.codes} />}
          {err && <p className="cp-err" data-testid="sec-2fa-error">{err}</p>}
        </Modal>
      )}
    </section>
  );
}

// ── Devices ──
interface SessionRow { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: string | Date; updatedAt: string | Date; expiresAt: string | Date }
const when = (d: string | Date) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function DevicesCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const toast = useToast();
  const { data: session } = authClient.useSession();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await authClient.listSessions();
    if (r?.error) { setErr(msgOf(r.error, 'Couldn’t load your devices.')); return; }
    setRows([...(r.data as SessionRow[])].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)));
  }, []);
  // Reload when the current session is re-issued (two-factor or password changes).
  useEffect(() => { void load(); }, [load, refreshKey]);
  const current = session?.session?.id as string | undefined;
  async function revoke(row: SessionRow | 'others') {
    setBusy(row === 'others' ? 'others' : row.id);
    const r = row === 'others' ? await authClient.revokeOtherSessions() : await authClient.revokeSession({ token: row.token });
    setBusy(null);
    if (r?.error) { toast.error(msgOf(r.error, 'Couldn’t sign that device out.')); return; }
    toast.success(row === 'others' ? 'Signed out everywhere else.' : 'Signed that device out.');
    void load();
  }
  const others = rows?.filter((r) => r.id !== current) ?? [];
  return (
    <section className="x-card ac-st-card" aria-labelledby="sec-dev" data-testid="sec-devices">
      <div className="x-ch"><h2 id="sec-dev">Signed-in devices</h2>{others.length > 0 && <button className="x-btn x-btn--sm" onClick={() => void revoke('others')} disabled={busy != null} data-testid="sec-dev-others">{busy === 'others' ? 'Signing out…' : 'Sign out everywhere else'}</button>}</div>
      {err ? <p className="cp-err">{err}</p> : !rows ? <div className="x-skel" style={{ height: 80 }} /> : (
        <ul className="ac-devs">
          {rows.map((r) => (
            <li key={r.id} data-testid="sec-dev-row">
              <div>
                <b>{deviceOf(r.userAgent)}{r.id === current && <span className="x-tag x-tag--g">This device</span>}</b>
                <span className="x-muted">{shownIp(r.ipAddress) ? `${shownIp(r.ipAddress)} · ` : ''}signed in {when(r.createdAt)} · last active {when(r.updatedAt)} · expires {when(r.expiresAt)}</span>
              </div>
              {r.id !== current && <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => void revoke(r)} disabled={busy != null} data-testid="sec-dev-revoke">{busy === r.id ? '…' : 'Sign out'}</button>}
            </li>
          ))}
        </ul>
      )}
      <p className="x-muted ac-fine">A signed-out device may keep working for up to 5 minutes while its saved sign-in expires.</p>
    </section>
  );
}

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { accountApi.profile().then(setProfile, (e: Error) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  return { profile, error, reload: load, setProfile };
}
