'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('trader@tradinx.io');
  const [password, setPassword] = useState('demo-mode');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => router.push('/dashboard'), 400);
  }

  return (
    <div className="min-h-screen bg-app grid lg:grid-cols-2" data-testid="login-page">
      {/* Left: visual */}
      <aside className="hidden lg:flex flex-col justify-between border-r border-border p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />
        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 bg-profit pulse-dot" />
          <span className="font-display font-black text-[15px] tracking-tighter">TRADIN<span className="text-fg-2">X</span></span>
        </Link>
        <div className="relative">
          <h2 className="font-display font-black text-5xl tracking-tighter leading-[1.05]">
            EXECUTE <br /> WITH <span className="text-profit">CLARITY.</span>
          </h2>
          <p className="text-fg-2 text-[13px] mt-5 max-w-md">
            Your behavioural edge, reconstructed from every MT5 fill. Connect once, journal forever.
          </p>
          <div className="mt-10 grid grid-cols-3 max-w-md border border-border">
            {[
              { l: 'Trades synced', v: '14.2M' },
              { l: 'Median R:R',    v: '1:2.4' },
              { l: 'Edge uplift',   v: '+25%' },
            ].map(s => (
              <div key={s.l} className="border-r border-border last:border-r-0 px-4 py-3">
                <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{s.l}</div>
                <div className="font-display font-black text-2xl mt-1 tracking-tight">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-[10px] tracking-[0.22em] text-fg-3">// PRECISION JOURNAL · EST 2026</div>
      </aside>

      {/* Right: form */}
      <main className="flex items-center justify-center p-5 sm:p-8 lg:p-10">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="login-form">
          <div className="text-[10px] tracking-[0.25em] text-fg-3">[ AUTH // SIGN IN ]</div>
          <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2">ACCESS TERMINAL</h1>
          <p className="text-fg-2 text-[12px] mt-2">Demo mode — any credentials route you straight into the dashboard.</p>

          <div className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.22em] text-fg-3">EMAIL</span>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="tinput" data-testid="login-email" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.22em] text-fg-3">PASSWORD</span>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="tinput" data-testid="login-password" />
            </label>
            <div className="flex items-center justify-between text-[11px] text-fg-3">
              <label className="flex items-center gap-2"><input type="checkbox" className="accent-white" /> KEEP SIGNED IN</label>
              <a href="#" className="hover:text-fg">FORGOT?</a>
            </div>

            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit"
              className={`btn btn-primary justify-center py-3 ${loading ? 'opacity-70' : ''}`}
            >
              {loading ? 'ACCESSING...' : 'ENTER TERMINAL →'}
            </button>

            <Link href="/dashboard" className="btn btn-ghost justify-center py-3" data-testid="login-guest">
              CONTINUE AS GUEST
            </Link>

            <p className="text-center text-[12px] text-fg-3 mt-4">
              No account? <Link href="/signup" className="text-fg hover:text-profit">REGISTER →</Link>
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
