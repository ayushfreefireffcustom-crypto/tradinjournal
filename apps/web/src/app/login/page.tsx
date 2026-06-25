'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth-client';

const { signIn } = authClient;

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [shake, setShake] = useState(false);

  function triggerShake() {
    setShake(true);
    setTimeout(() => setShake(false), 400);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await signIn.email({ email, password, callbackURL: '/dashboard' });
      if (res.error) throw new Error(res.error.message ?? 'Login failed');
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
      triggerShake();
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    try {
      await signIn.social({ provider: 'google', callbackURL: '/dashboard' });
    } catch (err: any) {
      setError(err.message ?? 'Google sign-in failed');
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm animate-fade-in-scale">

        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent)', boxShadow: '0 0 20px var(--accent-subtle)' }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 12L6 7L9 10L13 4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text)' }}>TradingJournal</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Sign in to your account</p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6 border"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          {/* Google OAuth */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl border text-sm font-medium transition-all duration-150 disabled:opacity-50 focus-ring"
            style={{
              background: 'var(--surface-2)',
              borderColor: 'var(--border-strong)',
              color: 'var(--text)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)'; }}
          >
            {googleLoading
              ? <span className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--text-muted)' }} />
              : <GoogleIcon />
            }
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            <span className="text-xs" style={{ color: 'var(--text-subtle)' }}>or</span>
            <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleSubmit} className={`space-y-4 ${shake ? 'animate-shake' : ''}`}>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all duration-150 focus-ring"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border-strong)', color: 'var(--text)' }}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-subtle)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-strong)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none transition-all duration-150"
                style={{ background: 'var(--surface-2)', borderColor: 'var(--border-strong)', color: 'var(--text)' }}
                onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-subtle)'; }}
                onBlur={e => { e.target.style.borderColor = 'var(--border-strong)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            {error && (
              <div className="animate-slide-up flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'var(--red-subtle)', color: 'var(--red)', border: '1px solid #ef444430' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M7 4v3M7 9.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:opacity-60 focus-ring"
              style={{ background: 'var(--accent)', color: '#fff' }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; }}
              onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.985)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
            >
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                    Signing in…
                  </span>
                : 'Sign in'
              }
            </button>
          </form>
        </div>

        <p className="text-center text-sm mt-5" style={{ color: 'var(--text-muted)' }}>
          No account?{' '}
          <Link href="/register" className="font-medium hover:underline transition-colors" style={{ color: 'var(--accent)' }}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
