'use client';

// Forgot-password flow, two steps on one page:
//   1) enter email  → we email a 6-digit reset code (emailOtp.requestPasswordReset)
//   2) enter code + new password → emailOtp.resetPassword → back to /login
// Mirrors the styling of the login / verify screens.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import AuthShell, { AuthError, AuthSubmit, EyeButton, PasswordStrength } from '@/components/v6/auth/auth-shell';
import { authClient } from '@/lib/auth-client';

function strengthOf(pw: string) {
  let n = 0;
  if (pw.length >= 8) n++; if (pw.length >= 12) n++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++; if (/[0-9]/.test(pw)) n++; if (/[^A-Za-z0-9]/.test(pw)) n++;
  const b = Math.min(4, n);
  return { score: b, label: ['Weak', 'Weak', 'Fair', 'Strong', 'Very strong'][b]! };
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authClient.emailOtp.requestPasswordReset({ email });
      if (res?.error) throw new Error(res.error.message ?? 'Could not send reset code');
      setStage('reset');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send reset code');
    } finally {
      setLoading(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (otp.length !== 6) { setError('Enter the 6-digit code from your email.'); return; }
    if (password.length < 8) { setError('New password must be at least 8 characters.'); return; }
    setLoading(true);
    try {
      const res = await authClient.emailOtp.resetPassword({ email, otp, password });
      if (res?.error) throw new Error(res.error.message ?? 'Invalid or expired code');
      router.push('/login');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not reset password');
      setLoading(false);
    }
  }

  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  const setDigit = (i: number, v: string) => {
    const clean = v.replace(/\D/g, '');
    const arr = otp.padEnd(6, ' ').split('');
    if (clean.length > 1) { const next = clean.slice(0, 6); setOtp(next); boxes.current[Math.min(next.length, 5)]?.focus(); return; }
    arr[i] = clean || ' ';
    setOtp(arr.join('').replace(/\s+$/, ''));
    if (clean && i < 5) boxes.current[i + 1]?.focus();
  };
  const st = strengthOf(password);

  return (
    <AuthShell variant="forgot" testId="forgot-page" top={<>Remembered it? <Link href="/login" data-testid="forgot-to-login">Sign in</Link></>}>
      {stage === 'email' ? (
        <form onSubmit={requestCode} data-testid="forgot-email-form">
          <p className="au-step"><span className="au-prog" aria-hidden><i className="on" /><i /></span>Step 1 of 2</p>
          <h1 className="au-t">Forgot your password?</h1>
          <p className="au-lead">Enter your email and we’ll send a 6-digit code to reset it.</p>
          <div className="au-stack au-stack--gap">
            <div className="x-field"><label htmlFor="fp-email">Email</label>
              <input id="fp-email" className="x-input" type="email" required value={email} onChange={e => setEmail(e.target.value)} data-testid="forgot-email" autoComplete="email" autoFocus placeholder="you@example.com" aria-invalid={error ? true : undefined} />
              {error && <AuthError testId="forgot-error">{error}</AuthError>}
            </div>
            <AuthSubmit loading={loading} disabled={!email.includes('@')} testId="forgot-send">{loading ? 'Sending code…' : 'Send reset code'}</AuthSubmit>
          </div>
          <p className="au-small"><Link href="/login">Back to sign in</Link></p>
        </form>
      ) : (
        <form onSubmit={submitReset} data-testid="forgot-reset-form">
          <p className="au-step"><span className="au-prog" aria-hidden><i className="on" /><i className="on" /></span>Step 2 of 2</p>
          <h1 className="au-t">Choose a new password</h1>
          <p className="au-lead">We sent a code to <b>{email}</b>. Enter it below with your new password.</p>
          <div className="au-stack au-stack--gap">
            <div className="x-field au-field">
              <label>6-digit code</label>
              <div className="au-codes" role="group" aria-label="6-digit code" data-testid="forgot-otp">
                {Array.from({ length: 6 }).map((_, i) => {
                  const d = (otp[i] ?? '').trim();
                  return <input key={i} ref={el => { boxes.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} value={d}
                    onChange={e => setDigit(i, e.target.value)} onKeyDown={e => { if (e.key === 'Backspace' && !d && i > 0) boxes.current[i - 1]?.focus(); }}
                    aria-label={`Digit ${i + 1}`} className={d ? 'f' : ''} autoFocus={i === 0} />;
                })}
              </div>
            </div>
            <div className="x-field">
              <label htmlFor="fp-pw">New password</label>
              <div className="au-inw">
                <input id="fp-pw" className="x-input" type={showPassword ? 'text' : 'password'} required value={password} onChange={e => setPassword(e.target.value)} data-testid="forgot-password" autoComplete="new-password" placeholder="At least 8 characters" />
                <EyeButton shown={showPassword} onClick={() => setShowPassword(s => !s)} />
              </div>
              {password && <PasswordStrength score={st.score} label={st.label} />}
              {error && <AuthError testId="forgot-error">{error}</AuthError>}
            </div>
            <AuthSubmit loading={loading} testId="forgot-reset-submit">{loading ? 'Resetting…' : 'Reset password'}</AuthSubmit>
          </div>
          <p className="au-small"><button type="button" onClick={() => { setStage('email'); setOtp(''); setPassword(''); setError(''); }}>Use a different email</button></p>
        </form>
      )}
    </AuthShell>
  );
}
