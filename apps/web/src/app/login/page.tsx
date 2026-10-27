'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AuthShell, { AuthSubmit, EyeButton } from '@/components/v3/auth-shell';
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
      resetUserCaches();
      router.replace(safeNext());
    } catch (err: unknown) {
      setError(err instanceof TypeError ? 'Can’t reach TRADElogs right now. Check your connection and try again.' : err instanceof Error ? err.message : 'Sign in failed');
      setLoading(false);
    }
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return (
    <AuthShell variant="signin" testId="login-page" top={<>No account yet? <Link href="/signup" data-testid="login-to-signup">Create one</Link></>}>
      <form onSubmit={submit} data-testid="login-form" noValidate={false}>
        <h1 className="au-h"><b>Welcome</b> <em>back.</em></h1>
        <p className="au-sub">Sign in to your trading journal.</p>
        <div style={{ marginTop: 28 }}><GoogleButton label="Continue with Google" /></div>
        <div className="au-or">or with email</div>
        <div className="au-fields">
          <label>
            <span className="au-lbl">Email</span>
            <span className={`au-in ${emailOk ? 'ok' : ''}`}>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} data-testid="login-email" autoComplete="email" placeholder="you@example.com" />
              {emailOk && <svg className="ok-i" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
            </span>
          </label>
          <div>
            <span className="au-lbl"><label htmlFor="login-pw">Password</label><Link href="/forgot" data-testid="login-forgot">Forgot?</Link></span>
            <span className="au-in">
              <input id="login-pw" type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} data-testid="login-password" autoComplete="current-password" placeholder="Your password" />
              <EyeButton shown={showPassword} onClick={() => setShowPassword(s => !s)} testId="toggle-password" />
            </span>
          </div>
          {error && <div className="au-err" data-testid="login-error" role="alert">{error}</div>}
          <AuthSubmit loading={loading} testId="login-submit">{loading ? 'Signing in…' : 'Sign in'}</AuthSubmit>
        </div>
        <p className="au-note">Trouble signing in? <Link href="/forgot">Reset your password</Link></p>
      </form>
    </AuthShell>
  );
}
