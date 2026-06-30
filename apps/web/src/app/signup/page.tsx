'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { Mail, Lock, User, ArrowRight, Loader2, CheckCircle, Zap, TrendingUp, Brain } from 'lucide-react';

const { signUp, signIn } = authClient;

export default function SignUpPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    
    try {
      const res = await signUp.email({ name, email, password });
      if (res.error) throw new Error(res.error.message ?? 'Registration failed');
      setIsSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogle = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setGoogleLoading(true);
    setError('');
    try {
      await signIn.social({ provider: 'google', callbackURL: '/dashboard' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-sora" style={{ background: "#0a0a0a" }}>
      {/* Decorative Background */}
      <div className="fixed inset-0 z-[-1] pointer-events-none">
        <div className="absolute inset-0 grid-pattern opacity-50" />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,51,173,0.15) 0%, transparent 70%)", filter: "blur(60px)" }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,51,173,0.08) 0%, transparent 70%)", filter: "blur(60px)" }} />
      </div>

      {/* Header Navigation */}
      <header className="fixed top-0 w-full z-50">
        <div className="w-full max-w-[1280px] mx-auto px-6 md:px-16 h-20 flex items-center">
          <Link href="/" className="font-headline-md text-headline-md font-bold tracking-tighter text-white">
            TradinX
          </Link>
        </div>
      </header>

      {/* Main Content: Split Layout */}
      <main className="flex-grow flex items-center justify-center pt-24 pb-12 px-6 md:px-16">
        <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
          
          {/* Left Side: Content */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 flex flex-col gap-8">
            <div>
              <h1 className="font-display-xl text-headline-lg-mobile md:text-headline-lg font-bold text-white mb-6">
                Master Your <span className="text-primary-fixed-dim">Trading Psychology</span>
              </h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-lg">
                Access institutional-grade analytics, behavioral AI, and automated journaling designed for the modern high-performance trader.
              </p>
            </div>

            <div className="flex flex-col gap-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-white/5 flex items-center justify-center shrink-0">
                  <Zap className="w-6 h-6 text-primary-fixed-dim" />
                </div>
                <div>
                  <h3 className="font-label-md text-body-md font-bold text-white mb-1">Seamless Syncing</h3>
                  <p className="font-body-md text-label-md text-on-surface-variant">Connect your XM or MT5 broker accounts. Your trades sync automatically for instant analysis.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-white/5 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6 text-primary-fixed-dim" />
                </div>
                <div>
                  <h3 className="font-label-md text-body-md font-bold text-white mb-1">Deep Performance Metrics</h3>
                  <p className="font-body-md text-label-md text-on-surface-variant">Analyze drawdowns, win rates, and equity curves with institutional-grade precision.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-white/5 flex items-center justify-center shrink-0">
                  <Brain className="w-6 h-6 text-primary-fixed-dim" />
                </div>
                <div>
                  <h3 className="font-label-md text-body-md font-bold text-white mb-1">Behavioral AI Insights</h3>
                  <p className="font-body-md text-label-md text-on-surface-variant">Identify psychological triggers and emotional patterns to eliminate overtrading and costly habits.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Form Card */}
          <div className="w-full max-w-md mx-auto lg:ml-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="rounded-2xl border border-white/10 p-8 shadow-2xl relative overflow-hidden"
              style={{ background: "rgba(18,18,26,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
              {/* Inner glow */}
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full pointer-events-none"
                style={{ background: "radial-gradient(circle, rgba(0,51,173,0.25) 0%, transparent 70%)", filter: "blur(30px)" }} />
              
              <div className="relative z-10">
                <div className="text-center mb-6">
                  <h2 className="font-headline-md text-on-surface mb-1 text-headline-md">Create Account</h2>
                  <p className="font-label-sm text-label-sm text-on-surface-variant">Start your journey to precision trading.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="name" className="block font-label-sm text-label-sm text-on-surface-variant mb-1 ml-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-[18px] h-[18px]" />
                      <input
                        type="text"
                        id="name"
                        name="name"
                        placeholder="John Doe"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="neo-input w-full pl-10 pr-4 py-2.5 rounded-lg font-body-md text-body-md text-on-surface placeholder:text-outline/50 bg-surface-container-low"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email" className="block font-label-sm text-label-sm text-on-surface-variant mb-1 ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-[18px] h-[18px]" />
                      <input
                        type="email"
                        id="email"
                        name="email"
                        placeholder="name@company.com"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="neo-input w-full pl-10 pr-4 py-2.5 rounded-lg font-body-md text-body-md text-on-surface placeholder:text-outline/50 bg-surface-container-low"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1 ml-1">
                      <label htmlFor="password" className="font-label-sm text-label-sm text-on-surface-variant">Password</label>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant w-[18px] h-[18px]" />
                      <input
                        type="password"
                        id="password"
                        name="password"
                        placeholder="••••••••"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="neo-input w-full pl-10 pr-4 py-2.5 rounded-lg font-body-md text-body-md text-on-surface placeholder:text-outline/50 bg-surface-container-low"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="fade-in flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
                        <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.3"/>
                        <path d="M7 4.5v2.5M7 9h.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || isSuccess || googleLoading}
                    className={`w-full py-3 font-label-md text-label-md rounded-lg primary-btn-glow transition-all duration-300 flex justify-center items-center gap-2 mt-6 text-white disabled:opacity-60 cursor-pointer border-none ${
                      isSuccess ? 'bg-green-600' : 'bg-primary-container'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" /> Creating Account...
                      </>
                    ) : isSuccess ? (
                      <>
                        <CheckCircle className="w-5 h-5" /> Success
                      </>
                    ) : (
                      <>
                        Create Account <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-outline-variant/10"></div>
                  </div>
                  <div className="relative flex justify-center text-label-sm">
                    <span className="px-4 bg-[#111827] text-on-surface-variant uppercase tracking-widest">Or continue with</span>
                  </div>
                </div>

                {/* Social Login */}
                <div className="grid gap-4">
                  <button
                    type="button"
                    onClick={handleGoogle}
                    disabled={isSubmitting || isSuccess || googleLoading}
                    className="w-full py-3 rounded-xl flex justify-center items-center gap-3 hover:bg-white/5 duration-300 border border-white/10 cursor-pointer disabled:opacity-60 text-sm font-medium text-on-surface"
                    style={{ background: "rgba(255,255,255,0.03)" }}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path d="M12 5.04c1.64 0 3.12.56 4.28 1.67l3.22-3.22C17.52 1.64 14.95 1 12 1 7.37 1 3.38 3.69 1.48 7.63l3.85 2.99C6.24 7.65 8.89 5.04 12 5.04z" fill="#EA4335"/>
                      <path d="M23.49 12.27c0-.8-.07-1.57-.2-2.31H12v4.38h6.45c-.28 1.48-1.12 2.74-2.38 3.58l3.71 2.87c2.17-2 3.71-4.94 3.71-8.52z" fill="#4285F4"/>
                      <path d="M5.33 14.62C5.08 13.88 4.95 13.1 4.95 12.3s.13-1.58.38-2.32L1.48 6.99c-.8 1.66-1.25 3.53-1.25 5.51s.45 3.85 1.25 5.51l3.85-3z" fill="#FBBC05"/>
                      <path d="M12 23c3.12 0 5.73-1.02 7.65-2.77l-3.71-2.87c-1.08.73-2.47 1.16-3.94 1.16-3.11 0-5.76-2.61-6.67-5.59l-3.85 3C3.38 20.31 7.37 23 12 23z" fill="#34A853"/>
                    </svg>
                    <span className="font-label-md text-label-md text-on-surface">
                      {googleLoading ? 'Redirecting…' : 'Sign up with Google'}
                    </span>
                  </button>
                </div>

                {/* Footer Link */}
                <div className="mt-8 text-center">
                  <p className="font-body-md text-on-surface-variant text-label-sm">
                    Already have an account?{' '}
                    <Link href="/login" className="text-primary font-bold hover:text-primary-fixed transition-colors">Sign In</Link>
                  </p>
                </div>
              </div>
            </div>
            
            {/* Trust Badge */}
            <div className="mt-8 text-center">
              <p className="font-label-sm text-label-sm text-on-surface-variant">
                By signing up, you agree to our{' '}
                <Link href="#" className="text-primary hover:underline transition-all">Terms</Link>{' '}
                and{' '}
                <Link href="#" className="text-primary hover:underline transition-all">Privacy Policy</Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
