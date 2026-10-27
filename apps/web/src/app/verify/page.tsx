'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import AuthShell, { AuthSubmit } from '@/components/v3/auth-shell';
import { LoadingScreen } from '@/components/loader';
import { authClient } from '@/lib/auth-client';

const OTP_LEN = 6;
const RESEND_COOLDOWN = 30; // seconds

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') ?? '';

  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [resent, setResent] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  // Guards against duplicate submits (auto-submit + double-invoked updaters):
  // a second verify with the same already-consumed code would return
  // "invalid OTP" even though verification succeeded.
  const verifying = useRef(false);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const code = digits.join('');

  async function verify(fullCode: string) {
    if (verifying.current) return;
    verifying.current = true;
    setError('');
    setLoading(true);
    try {
      const res = await authClient.emailOtp.verifyEmail({ email, otp: fullCode });
      if (res?.error) throw new Error(res.error.message ?? 'Invalid or expired code');
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
      setDigits(Array(OTP_LEN).fill(''));
      inputs.current[0]?.focus();
      setLoading(false);
      verifying.current = false;
    }
  }

  function setDigit(i: number, val: string) {
    const clean = val.replace(/\D/g, '');
    if (!clean) {
      setDigits(d => { const n = [...d]; n[i] = ''; return n; });
      return;
    }
    // Support pasting the whole code into any box.
    if (clean.length > 1) {
      const chars = clean.slice(0, OTP_LEN).split('');
      const next = Array(OTP_LEN).fill('').map((_, k) => chars[k] ?? '');
      setDigits(next);
      const filled = Math.min(chars.length, OTP_LEN) - 1;
      inputs.current[filled]?.focus();
      if (chars.length >= OTP_LEN) verify(next.join(''));
      return;
    }
    // Compute the next state outside the updater — calling verify() inside
    // setDigits would run it twice under React StrictMode (updaters must be
    // pure), double-submitting the code.
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (next.every(x => x)) verify(next.join(''));
    if (i < OTP_LEN - 1) inputs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  async function resend() {
    if (cooldown > 0) return;
    setError('');
    setResent(false);
    try {
      await authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' });
      setResent(true);
      setCooldown(RESEND_COOLDOWN);
    } catch {
      setError('Could not resend code. Try again shortly.');
    }
  }

  return (
    <AuthShell variant="verify" testId="verify-page">
      <form onSubmit={e => { e.preventDefault(); if (code.length === OTP_LEN) verify(code); }}>
        <Link href="/signup" className="au-back"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M19 12H5M11 6l-6 6 6 6" /></svg> Back to sign up</Link>
        <div className="au-ic"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></svg></div>
        <h1 className="au-h"><b>Check your</b> <em>inbox.</em></h1>
        <p className="au-sub">We sent a 6-digit code to <b>{email || 'your email'}</b>.</p>
        <div className={`au-otp ${error ? 'err' : ''}`} data-testid="otp-inputs" role="group" aria-label="6-digit code">
          {digits.map((d, i) => (
            <span key={i} style={{ display: 'contents' }}>
              {i === 3 && <span className="dash" aria-hidden />}
              <input ref={el => { inputs.current[i] = el; }} type="text" inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={OTP_LEN}
                value={d} onChange={e => setDigit(i, e.target.value)} onKeyDown={e => onKeyDown(i, e)} disabled={loading} className={d ? 'f' : ''}
                aria-label={`Digit ${i + 1}`} data-testid={`otp-${i}`} />
            </span>
          ))}
        </div>
        <div className="au-meta">
          <span>Codes expire after <b>10 minutes</b></span>
          <button type="button" onClick={resend} disabled={cooldown > 0} data-testid="verify-resend">{cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}</button>
        </div>
        {error && <div className="au-err" data-testid="verify-error" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
        {resent && !error && <div className="au-err" style={{ marginBottom: 14, background: 'var(--long-soft)', borderColor: 'rgba(8,196,101,.3)', color: 'var(--long)' }}>New code sent — check your inbox.</div>}
        <AuthSubmit loading={loading} disabled={code.length !== OTP_LEN} testId="verify-submit">{loading ? 'Verifying…' : 'Verify email'}</AuthSubmit>
        <p className="au-note">Wrong address? <Link href="/signup" data-testid="verify-to-login">Change email</Link></p>
      </form>
    </AuthShell>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="h-dvh"><LoadingScreen label="Loading" /></div>}>
      <VerifyInner />
    </Suspense>
  );
}
