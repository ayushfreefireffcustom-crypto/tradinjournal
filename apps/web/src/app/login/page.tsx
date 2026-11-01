'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AuthShell, { AuthError, AuthSubmit, EyeButton, I_CHECK } from '@/components/v6/auth/auth-shell';
import GoogleButton from '@/components/google-button';
import { authClient } from '@/lib/auth-client';
import { safeNext, useRedirectIfAuthed } from '@/lib/use-redirect-if-authed';
import { resetUserCaches } from '@/lib/session-caches';

export default function LoginPage() {
  const router = useRouter();
  useRedirectIfAuthed();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Two-factor step (H5): after the password, a code from the authenticator app or a backup code.
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);

  // Google sends failures back here as ?error=…; say so instead of a silent reload.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('error');
    if (code) setError(code === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in didn’t go through. Try again, or use your email.');
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const addr = email.trim().toLowerCase();
    try {
      // No callbackURL: with one, better-auth hard-redirects itself and skips ?next.
      const res = await authClient.signIn.email({ email: addr, password });
      if (res?.error) {
        // Unverified accounts can't sign in — send them to finish verification.
        const status = res.error.status;
        const msg = res.error.message ?? '';
        if (status === 403 || /verif/i.test(msg)) {
          await authClient.emailOtp.sendVerificationOtp({ email: addr, type: 'email-verification' }).catch(() => {});
          router.push(`/verify?email=${encodeURIComponent(addr)}`);
          return;
        }
        if (status === 429) throw new Error('Too many attempts. Wait a minute, then try again.');
        throw new Error(msg || 'Invalid email or password');
      }
      if (res?.data?.twoFactorRedirect) { setStep('code'); setLoading(false); return; }
      resetUserCaches();
      router.replace(safeNext());
    } catch (err: unknown) {
      setError(err instanceof TypeError ? 'Can’t reach TRADElogs right now. Check your connection and try again.' : err instanceof Error ? err.message : 'Sign in failed');
      setLoading(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const c = code.trim().replace(/\s+/g, '');
      const res = backup ? await authClient.twoFactor.verifyBackupCode({ code: c }) : await authClient.twoFactor.verifyTotp({ code: c });
      if (res?.error) {
        if (res.error.status === 429) throw new Error('Too many attempts. Wait a minute, then try again.');
        // The sign-in window is 10 minutes; after that the password step starts again.
        if (res.error.code === 'INVALID_TWO_FACTOR_COOKIE') { setStep('password'); setCode(''); throw new Error('That took too long. Sign in again.'); }
        if (res.error.code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE') { setStep('password'); setCode(''); throw new Error('Too many wrong codes. Sign in again.'); }
        throw new Error(backup ? 'That backup code didn’t work. Each one works once.' : 'That code didn’t work. Use the newest one in your app.');
      }
      resetUserCaches();
      router.replace(safeNext());
    } catch (err: unknown) {
      setError(err instanceof TypeError ? 'Can’t reach TRADElogs right now. Check your connection and try again.' : err instanceof Error ? err.message : 'Sign in failed');
      setLoading(false);
    }
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  if (step === 'code') {
    return (
      <AuthShell variant="signin" testId="login-page" top={<>No account yet? <Link href="/signup" data-testid="login-to-signup">Create one</Link></>}>
        <form onSubmit={submitCode} data-testid="login-2fa-form">
          <h1 className="au-t">Two-factor sign-in</h1>
          <p className="au-lead">{backup ? 'Enter one of the backup codes you saved when you turned this on.' : 'Enter the 6-digit code from your authenticator app.'}</p>
          <div className="au-stack">
            <div className="x-field">
              <label htmlFor="login-code">{backup ? 'Backup code' : 'Code'}</label>
              <input id="login-code" className="x-input m" inputMode={backup ? 'text' : 'numeric'} autoComplete="one-time-code" autoFocus required value={code} maxLength={backup ? 24 : 6}
                onChange={e => setCode(backup ? e.target.value : e.target.value.replace(/\D/g, ''))} data-testid="login-code" placeholder={backup ? 'xxxxx-xxxxx' : '123456'} />
              {error && <AuthError testId="login-error">{error}</AuthError>}
            </div>
            <AuthSubmit loading={loading} testId="login-code-submit">{loading ? 'Checking…' : 'Sign in'}</AuthSubmit>
          </div>
          <p className="au-small">
            <button type="button" className="au-linkbtn" onClick={() => { setBackup(b => !b); setCode(''); setError(''); }} data-testid="login-use-backup">{backup ? 'Use the authenticator app instead' : 'Lost your phone? Use a backup code'}</button>
            {' · '}
            <button type="button" className="au-linkbtn" onClick={() => { setStep('password'); setCode(''); setError(''); }}>Start over</button>
          </p>
        </form>
      </AuthShell>
    );
  }
  return (
    <AuthShell variant="signin" testId="login-page" top={<>No account yet? <Link href="/signup" data-testid="login-to-signup">Create one</Link></>}>
      <form onSubmit={submit} data-testid="login-form" noValidate={false}>
        <h1 className="au-t">Sign in</h1>
        <p className="au-lead">Welcome back to your trading journal.</p>
        <div className="au-gbtn-wrap"><GoogleButton label="Continue with Google" /></div>
        <div className="au-sep">or with email</div>
        <div className="au-stack">
          <div className="x-field">
            <label htmlFor="login-email">Email</label>
            <div className="au-inw">
              <input id="login-email" className="x-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} data-testid="login-email" autoComplete="email" placeholder="you@example.com" />
              {emailOk && <span className="au-ok" aria-hidden>{I_CHECK}</span>}
            </div>
          </div>
          <div className="x-field">
            <div className="au-lrow"><label htmlFor="login-pw">Password</label><Link href="/forgot" data-testid="login-forgot">Forgot password?</Link></div>
            <div className="au-inw">
              <input id="login-pw" className="x-input" type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} data-testid="login-password" autoComplete="current-password"  placeholder="Your password" />
              <EyeButton shown={showPassword} onClick={() => setShowPassword(s => !s)} testId="toggle-password" />
            </div>
            {error && <AuthError testId="login-error">{error}</AuthError>}
          </div>
          <AuthSubmit loading={loading} testId="login-submit">{loading ? 'Signing in…' : 'Sign in'}</AuthSubmit>
        </div>
        <p className="au-small">Trouble signing in? <Link href="/forgot">Reset your password</Link></p>
      </form>
    </AuthShell>
  );
}
