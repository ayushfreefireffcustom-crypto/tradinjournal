'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import AuthAside from '@/components/auth-aside';
import Logo from '@/components/logo';
import GoogleButton from '@/components/google-button';
import { authClient } from '@/lib/auth-client';
import { useRedirectIfAuthed } from '@/lib/use-redirect-if-authed';

export default function LoginPage() {
  const router = useRouter();
  useRedirectIfAuthed();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authClient.signIn.email({ email, password, callbackURL: '/dashboard' });
      if (res?.error) {
        // Unverified accounts can't sign in — send them to finish verification.
        const status = res.error.status;
        const msg = res.error.message ?? '';
        if (status === 403 || /verif/i.test(msg)) {
          await authClient.emailOtp.sendVerificationOtp({ email, type: 'email-verification' }).catch(() => {});
          router.push(`/verify?email=${encodeURIComponent(email)}`);
          return;
        }
        throw new Error(msg || 'Invalid credentials');
      }
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-app flex flex-col lg:grid lg:grid-cols-2" data-testid="login-page">
      <AuthAside variant="signin" />

      {/* Right: form column */}
      <main className="relative flex flex-col min-h-screen min-w-0 overflow-x-hidden">
        {/* Symmetric top status bar (matches aside) */}
        <div className="hidden lg:flex border-b border-border h-12 items-center justify-between px-8 xl:px-12 text-[10px] tracking-[0.22em] text-fg-3">
          <span>SECURE CONNECTION</span>
          <span className="flex items-center gap-2"><span className="w-2 h-2 bg-profit pulse-dot" /> READY</span>
        </div>

        {/* Mobile top status */}
        <div className="lg:hidden border-b border-border h-11 flex items-center justify-between px-4 text-[10px] tracking-[0.22em] text-fg-3">
          <Logo height={20} />
          <span>ONLINE</span>
        </div>

        <div className="flex-1 flex items-center justify-center px-5 py-8 sm:px-8 sm:py-12 lg:px-12">
          <form onSubmit={submit} className="w-full max-w-[420px]" data-testid="login-form">
            <div className="text-[10px] tracking-[0.3em] text-fg-3">[ SIGN IN ]</div>
            <h1 className="font-display font-black text-3xl sm:text-4xl xl:text-5xl tracking-tighter mt-3">
              WELCOME <span className="text-profit">BACK.</span>
            </h1>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-3 max-w-sm">
              Sign in with your email and password to access the live dashboard.
            </p>

            {/* OAuth */}
            <div className="mt-8">
              <GoogleButton label="Continue with Google" />
            </div>
            <div className="mt-5 flex items-center gap-3 text-[10px] tracking-[0.22em] text-fg-3">
              <span className="h-px flex-1 bg-border-soft" />
              OR WITH EMAIL
              <span className="h-px flex-1 bg-border-soft" />
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.22em] text-fg-3 flex items-center justify-between">
                  <span>EMAIL</span>
                  {email.includes('@') && <span className="text-profit">◉ VALID</span>}
                </span>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="tinput" data-testid="login-email" autoComplete="email"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.22em] text-fg-3 flex items-center justify-between">
                  <span>PASSWORD</span>
                  <a href="#" className="text-fg-3 hover:text-fg tracking-widest">FORGOT?</a>
                </span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required value={password} onChange={e => setPassword(e.target.value)}
                    className="tinput pr-16" data-testid="login-password" autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    data-testid="toggle-password"
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] tracking-[0.22em] text-fg-3 hover:text-fg border border-border-soft hover:border-border-strong"
                  >
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
              </label>

              <label className="flex items-center gap-3 text-[11px] text-fg-2 cursor-pointer select-none">
                <span
                  onClick={() => setRemember(r => !r)}
                  className={`w-4 h-4 border flex items-center justify-center ${remember ? 'bg-profit border-profit text-app' : 'border-border-strong'}`}
                  data-testid="remember-toggle"
                >
                  {remember && <span className="text-[10px] font-bold">✓</span>}
                </span>
                <span className="tracking-widest text-[10px]">KEEP ME SIGNED IN FOR 30 DAYS</span>
              </label>

              {error && (
                <div
                  data-testid="login-error"
                  className="border border-loss/40 bg-loss/10 text-loss px-3 py-2 text-[11px] tracking-widest"
                >
                  {error.toUpperCase()}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                data-testid="login-submit"
                className={`btn btn-primary justify-center py-3 text-[12px] tracking-[0.22em] mt-1 ${loading ? 'opacity-70 cursor-wait' : ''}`}
              >
                {loading ? (
                  <>
                    <span className="w-2 h-2 bg-app rounded-full pulse-dot" />
                    SIGNING IN…
                  </>
                ) : (
                  <>SIGN IN <span>→</span></>
                )}
              </button>

              {/* Fine print + register */}
              <div className="mt-4 pt-4 border-t border-border-soft flex flex-wrap items-center justify-between gap-3 text-[11px]">
                <span className="text-fg-3">No account yet?</span>
                <Link href="/signup" className="text-fg hover:text-profit tracking-widest text-[11px]" data-testid="login-to-signup">
                  CREATE ACCOUNT →
                </Link>
              </div>
            </div>
          </form>
        </div>

        {/* Mobile footer */}
        <div className="lg:hidden border-t border-border px-4 py-3 flex items-center justify-between text-[10px] tracking-[0.22em] text-fg-3">
          <span>EST · 2026</span>
          <span className="flex gap-3">
            <a href="#" className="hover:text-fg">PRIVACY</a>
            <a href="#" className="hover:text-fg">TERMS</a>
          </span>
        </div>

        {/* Desktop bottom bar */}
        <div className="hidden lg:flex border-t border-border h-11 items-center justify-between px-8 xl:px-12 text-[10px] tracking-[0.22em] text-fg-3">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
            2,148 TRADERS ONLINE
          </span>
          <span>NEED HELP? <a href="#" className="text-fg hover:text-profit ml-2">SUPPORT →</a></span>
        </div>
      </main>
    </div>
  );
}
