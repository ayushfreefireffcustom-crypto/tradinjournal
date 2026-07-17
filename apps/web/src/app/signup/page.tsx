'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import AuthAside from '@/components/auth-aside';
import Logo from '@/components/logo';
import GoogleButton from '@/components/google-button';
import { authClient } from '@/lib/auth-client';

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const bucket = Math.min(4, score);
  const labels = ['WEAK', 'WEAK', 'FAIR', 'STRONG', 'VERY STRONG'];
  const colors = ['#FE3A31', '#FE3A31', '#FF9F0A', '#08C465', '#08C465'];
  return { score: bucket, label: labels[bucket]!, color: colors[bucket]! };
}

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agree, setAgree] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = useMemo(() => passwordStrength(password), [password]);
  const canSubmit = name.trim().length > 1 && email.includes('@') && strength.score >= 2 && agree;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      const res = await authClient.signUp.email({ email, password, name });
      if (res?.error) throw new Error(res.error.message ?? 'Could not create account');
      // Email must be verified before sign-in — a 6-digit code was just emailed.
      router.push(`/verify?email=${encodeURIComponent(email)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-app flex flex-col lg:grid lg:grid-cols-2" data-testid="signup-page">
      <AuthAside variant="signup" />

      <main className="relative flex flex-col min-h-screen min-w-0 overflow-x-hidden">
        {/* Symmetric top status bar */}
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
          <form onSubmit={submit} className="w-full max-w-[420px]" data-testid="signup-form">
            <div className="text-[10px] tracking-[0.3em] text-fg-3">[ SIGN UP ]</div>
            <h1 className="font-display font-black text-3xl sm:text-4xl xl:text-5xl tracking-tighter mt-3">
              CREATE YOUR <span className="text-profit">ACCOUNT.</span>
            </h1>
            <p className="text-fg-2 text-[12px] sm:text-[13px] mt-3 max-w-sm">
              Free · up to 2 MT5 accounts · no card. Cancel anytime.
            </p>

            {/* OAuth */}
            <div className="mt-7">
              <GoogleButton label="Sign up with Google" />
            </div>
            <div className="mt-5 flex items-center gap-3 text-[10px] tracking-[0.22em] text-fg-3">
              <span className="h-px flex-1 bg-border-soft" />
              OR WITH EMAIL
              <span className="h-px flex-1 bg-border-soft" />
            </div>

            {/* Progress dots */}
            <div className="mt-7 flex items-center gap-2">
              {['CREDENTIALS', 'BROKER', 'PLAN'].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`w-6 h-6 border flex items-center justify-center text-[10px] font-bold ${i === 0 ? 'border-fg bg-fg text-app' : 'border-border-soft text-fg-3'}`}>
                    {i + 1}
                  </div>
                  <span className={`text-[10px] tracking-[0.22em] ${i === 0 ? 'text-fg' : 'text-fg-3'}`}>{s}</span>
                  {i < 2 && <span className="w-6 h-px bg-border-soft" />}
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.22em] text-fg-3">FULL NAME</span>
                <input
                  type="text" required value={name} onChange={e => setName(e.target.value)}
                  className="tinput" data-testid="signup-name" placeholder="e.g. Alex Morgan" autoComplete="name"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.22em] text-fg-3 flex items-center justify-between">
                  <span>EMAIL</span>
                  {email.includes('@') && <span className="text-profit">◉ VALID</span>}
                </span>
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="tinput" data-testid="signup-email" placeholder="ops@yourdesk.io" autoComplete="email"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] tracking-[0.22em] text-fg-3 flex items-center justify-between">
                  <span>PASSWORD</span>
                  {password && <span style={{ color: strength.color }}>{strength.label}</span>}
                </span>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required value={password} onChange={e => setPassword(e.target.value)}
                    className="tinput pr-16" data-testid="signup-password" placeholder="min. 8 chars" autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[9px] tracking-[0.22em] text-fg-3 hover:text-fg border border-border-soft hover:border-border-strong"
                  >
                    {showPassword ? 'HIDE' : 'SHOW'}
                  </button>
                </div>
                {/* Strength bar */}
                <div className="mt-1 flex gap-1">
                  {[0, 1, 2, 3].map(i => (
                    <div
                      key={i}
                      className="flex-1 h-1 transition-colors"
                      style={{ background: strength.score > i ? strength.color : '#1E1E1E' }}
                    />
                  ))}
                </div>
                <div className="text-[9px] tracking-widest text-fg-3 mt-1">
                  USE 8+ CHARACTERS WITH UPPER &amp; LOWER CASE, A NUMBER AND A SYMBOL
                </div>
              </label>

              <label className="flex items-start gap-3 text-[11px] text-fg-2 cursor-pointer select-none">
                <span
                  onClick={() => setAgree(a => !a)}
                  className={`mt-0.5 w-4 h-4 border flex items-center justify-center shrink-0 ${agree ? 'bg-profit border-profit text-app' : 'border-border-strong'}`}
                  data-testid="agree-toggle"
                >
                  {agree && <span className="text-[10px] font-bold">✓</span>}
                </span>
                <span className="text-[10px] tracking-widest leading-relaxed">
                  I ACCEPT THE <a href="#" className="text-fg hover:text-profit">TERMS</a> &amp; THE <a href="#" className="text-fg hover:text-profit">DATA POLICY</a>. WE ONLY USE YOUR READ-ONLY MT5 LOGIN.
                </span>
              </label>

              {error && (
                <div
                  data-testid="signup-error"
                  className="border border-loss/40 bg-loss/10 text-loss px-3 py-2 text-[11px] tracking-widest"
                >
                  {error.toUpperCase()}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit || loading}
                data-testid="signup-submit"
                className={`btn btn-primary justify-center py-3 text-[12px] tracking-[0.22em] mt-1 ${!canSubmit || loading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {loading ? (
                  <>
                    <span className="w-2 h-2 bg-app rounded-full pulse-dot" />
                    CREATING ACCOUNT…
                  </>
                ) : (
                  <>CREATE ACCOUNT <span>→</span></>
                )}
              </button>

              <div className="mt-4 pt-4 border-t border-border-soft flex flex-wrap items-center justify-between gap-3 text-[11px]">
                <span className="text-fg-3">Already have an account?</span>
                <Link href="/login" className="text-fg hover:text-profit tracking-widest text-[11px]" data-testid="signup-to-login">
                  SIGN IN →
                </Link>
              </div>
            </div>
          </form>
        </div>

        {/* Mobile footer */}
        <div className="lg:hidden border-t border-border px-4 py-3 flex items-center justify-between text-[10px] tracking-[0.22em] text-fg-3">
          <span>READ-ONLY MT5</span>
          <span>AES-256 · SOC2</span>
        </div>

        {/* Desktop bottom bar */}
        <div className="hidden lg:flex border-t border-border h-11 items-center justify-between px-8 xl:px-12 text-[10px] tracking-[0.22em] text-fg-3">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
            FREE FOREVER · UP TO 2 ACCOUNTS
          </span>
          <span>ALREADY IN? <Link href="/login" className="text-fg hover:text-profit ml-2">SIGN IN →</Link></span>
        </div>
      </main>
    </div>
  );
}
