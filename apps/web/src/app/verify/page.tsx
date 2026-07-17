'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import AuthAside from '@/components/auth-aside';
import Logo from '@/components/logo';
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
    <div className="min-h-screen bg-app flex flex-col lg:grid lg:grid-cols-2" data-testid="verify-page">
      <AuthAside variant="signup" />

      <main className="relative flex flex-col min-h-screen min-w-0 overflow-x-hidden">
        <div className="hidden lg:flex border-b border-border h-12 items-center justify-between px-8 xl:px-12 text-[10px] tracking-[0.22em] text-fg-3">
          <span>SECURE CONNECTION</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 bg-profit pulse-dot" /> AWAITING CODE</span>
        </div>
        <div className="lg:hidden border-b border-border h-11 flex items-center justify-between px-4 text-[10px] tracking-[0.22em] text-fg-3">
          <Logo height={20} />
          <span>ONLINE</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
          <div className="w-full max-w-[420px]">
            <div className="text-[10px] tracking-[0.3em] text-fg-3">[ VERIFY EMAIL ]</div>
            <h1 className="font-display font-black text-3xl sm:text-4xl xl:text-5xl tracking-tighter mt-3">
              CHECK YOUR <span className="text-profit">INBOX.</span>
            </h1>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-3 max-w-sm">
              We sent a 6-digit code to{' '}
              <span className="text-fg font-semibold break-all">{email || 'your email'}</span>. Enter it below to activate your account.
            </p>

            <div className="mt-8 flex gap-2 sm:gap-3" data-testid="otp-inputs">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={el => { inputs.current[i] = el; }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={OTP_LEN}
                  value={d}
                  onChange={e => setDigit(i, e.target.value)}
                  onKeyDown={e => onKeyDown(i, e)}
                  disabled={loading}
                  className="tinput flex-1 min-w-0 text-center text-xl sm:text-2xl font-bold py-3 px-0"
                  data-testid={`otp-${i}`}
                />
              ))}
            </div>

            {error && (
              <div data-testid="verify-error" className="mt-5 border border-loss/40 bg-loss/10 text-loss px-3 py-2 text-[11px] tracking-widest">
                {error.toUpperCase()}
              </div>
            )}
            {resent && !error && (
              <div className="mt-5 border border-profit/40 bg-profit/10 text-profit px-3 py-2 text-[11px] tracking-widest">
                NEW CODE SENT
              </div>
            )}

            <button
              type="button"
              onClick={() => code.length === OTP_LEN && verify(code)}
              disabled={code.length !== OTP_LEN || loading}
              data-testid="verify-submit"
              className={`btn btn-primary justify-center py-3 text-[12px] tracking-[0.22em] mt-6 w-full ${code.length !== OTP_LEN || loading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {loading ? (
                <><span className="w-2 h-2 bg-app rounded-full pulse-dot" /> VERIFYING…</>
              ) : (
                <>VERIFY &amp; CONTINUE <span>→</span></>
              )}
            </button>

            <div className="mt-5 flex items-center justify-between text-[11px]">
              <span className="text-fg-3 tracking-widest text-[10px]">DIDN&apos;T GET IT?</span>
              <button
                type="button"
                onClick={resend}
                disabled={cooldown > 0}
                data-testid="verify-resend"
                className={`tracking-widest text-[11px] ${cooldown > 0 ? 'text-fg-3 cursor-not-allowed' : 'text-fg hover:text-profit'}`}
              >
                {cooldown > 0 ? `RESEND IN ${cooldown}S` : 'RESEND CODE →'}
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-border-soft text-[11px]">
              <Link href="/login" className="text-fg-3 hover:text-fg tracking-widest text-[10px]" data-testid="verify-to-login">
                ← WRONG EMAIL? SIGN IN AGAIN
              </Link>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex border-t border-border h-11 items-center justify-between px-8 xl:px-12 text-[10px] tracking-[0.22em] text-fg-3">
          <span>CODE EXPIRES IN 10 MIN</span>
          <span>NEED HELP? <a href="#" className="text-fg hover:text-profit ml-2">SUPPORT →</a></span>
        </div>
      </main>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-app" />}>
      <VerifyInner />
    </Suspense>
  );
}
