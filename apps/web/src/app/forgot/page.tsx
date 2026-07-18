'use client';

// Forgot-password flow, two steps on one page:
//   1) enter email  → we email a 6-digit reset code (emailOtp.requestPasswordReset)
//   2) enter code + new password → emailOtp.resetPassword → back to /login
// Mirrors the styling of the login / verify screens.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AuthAside from '@/components/auth-aside';
import Logo from '@/components/logo';
import { authClient } from '@/lib/auth-client';

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

  return (
    <div className="min-h-screen bg-app flex flex-col lg:grid lg:grid-cols-2" data-testid="forgot-page">
      <AuthAside variant="signin" />

      <main className="relative flex flex-col min-h-screen min-w-0 overflow-x-hidden">
        <div className="hidden lg:flex border-b border-border h-12 items-center justify-between px-8 xl:px-12 text-[10px] tracking-[0.22em] text-fg-3">
          <span>SECURE CONNECTION</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 bg-profit pulse-dot" /> READY</span>
        </div>
        <div className="lg:hidden border-b border-border h-11 flex items-center justify-between px-4 text-[10px] tracking-[0.22em] text-fg-3">
          <Logo height={20} />
          <span>ONLINE</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
          <div className="w-full max-w-[420px]">
            <div className="text-[10px] tracking-[0.3em] text-fg-3">[ RESET PASSWORD ]</div>
            <h1 className="font-display font-black text-3xl sm:text-4xl xl:text-5xl tracking-tighter mt-3">
              FORGOT YOUR <span className="text-profit">PASSWORD?</span>
            </h1>

            {stage === 'email' ? (
              <>
                <p className="text-fg-2 text-[13px] sm:text-[14px] mt-3 max-w-sm leading-relaxed">
                  Enter your email and we&apos;ll send a 6-digit code to reset it.
                </p>
                <form onSubmit={requestCode} className="mt-8 flex flex-col gap-4" data-testid="forgot-email-form">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.22em] text-fg-3">EMAIL</span>
                    <input
                      type="email" required value={email} onChange={e => setEmail(e.target.value)}
                      className="tinput" data-testid="forgot-email" autoComplete="email" autoFocus
                    />
                  </label>

                  {error && (
                    <div data-testid="forgot-error" className="border border-loss/40 bg-loss/10 text-loss px-3 py-2 text-[11px] tracking-widest">
                      {error.toUpperCase()}
                    </div>
                  )}

                  <button
                    type="submit" disabled={loading} data-testid="forgot-send"
                    className={`btn btn-primary justify-center py-3 text-[12px] tracking-[0.22em] mt-1 ${loading ? 'opacity-70 cursor-wait' : ''}`}
                  >
                    {loading ? (<><span className="w-2 h-2 bg-app rounded-full pulse-dot" /> SENDING…</>) : (<>SEND RESET CODE <span>→</span></>)}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="text-fg-2 text-[13px] sm:text-[14px] mt-3 max-w-sm leading-relaxed">
                  We sent a code to <span className="text-fg font-semibold break-all">{email}</span>. Enter it below with your new password.
                </p>
                <form onSubmit={submitReset} className="mt-8 flex flex-col gap-4" data-testid="forgot-reset-form">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.22em] text-fg-3">6-DIGIT CODE</span>
                    <input
                      type="text" inputMode="numeric" required value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="tinput tracking-[0.5em] text-center font-bold text-lg" data-testid="forgot-otp"
                      autoComplete="one-time-code" autoFocus placeholder="••••••"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] tracking-[0.22em] text-fg-3">NEW PASSWORD</span>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'} required value={password}
                        onChange={e => setPassword(e.target.value)} className="tinput pr-16"
                        data-testid="forgot-password" autoComplete="new-password" placeholder="min. 8 chars"
                      />
                      <button
                        type="button" onClick={() => setShowPassword(s => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] tracking-[0.22em] text-fg-3 hover:text-fg border border-border-soft hover:border-border-strong"
                      >
                        {showPassword ? 'HIDE' : 'SHOW'}
                      </button>
                    </div>
                  </label>

                  {error && (
                    <div data-testid="forgot-error" className="border border-loss/40 bg-loss/10 text-loss px-3 py-2 text-[11px] tracking-widest">
                      {error.toUpperCase()}
                    </div>
                  )}

                  <button
                    type="submit" disabled={loading} data-testid="forgot-reset-submit"
                    className={`btn btn-primary justify-center py-3 text-[12px] tracking-[0.22em] mt-1 ${loading ? 'opacity-70 cursor-wait' : ''}`}
                  >
                    {loading ? (<><span className="w-2 h-2 bg-app rounded-full pulse-dot" /> RESETTING…</>) : (<>RESET PASSWORD <span>→</span></>)}
                  </button>
                  <button
                    type="button" onClick={() => { setStage('email'); setError(''); }}
                    className="text-[10px] tracking-widest text-fg-3 hover:text-fg self-start"
                  >
                    ← USE A DIFFERENT EMAIL
                  </button>
                </form>
              </>
            )}

            <div className="mt-6 pt-4 border-t border-border-soft text-[11px]">
              <Link href="/login" className="text-fg-3 hover:text-fg tracking-widest text-[10px]" data-testid="forgot-to-login">
                ← BACK TO SIGN IN
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
