'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => router.push('/dashboard'), 400);
  }

  return (
    <div className="min-h-screen bg-app grid lg:grid-cols-2" data-testid="signup-page">
      <aside className="hidden lg:flex flex-col justify-between border-r border-border p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-grid bg-grid-fade opacity-40" />
        <Link href="/" className="relative flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 bg-profit pulse-dot" />
          <span className="font-display font-black text-[15px] tracking-tighter">TRADIN<span className="text-fg-2">X</span></span>
        </Link>
        <div className="relative">
          <h2 className="font-display font-black text-5xl tracking-tighter leading-[1.05]">
            ENLIST <br /> THE <span className="text-profit">PROTOCOL.</span>
          </h2>
          <p className="text-fg-2 text-[13px] mt-5 max-w-md">
            90-second MT5 link. Behavioural diagnostics by tomorrow morning. No credit card.
          </p>
        </div>
        <div className="relative text-[10px] tracking-[0.22em] text-fg-3">// READ-ONLY · ENCRYPTED AT REST</div>
      </aside>

      <main className="flex items-center justify-center p-5 sm:p-8 lg:p-10">
        <form onSubmit={submit} className="w-full max-w-sm" data-testid="signup-form">
          <div className="text-[10px] tracking-[0.25em] text-fg-3">[ AUTH // REGISTER ]</div>
          <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2">CREATE ACCOUNT</h1>
          <p className="text-fg-2 text-[12px] mt-2">Free tier · 1 MT5 slot · no credit card.</p>

          <div className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.22em] text-fg-3">FULL NAME</span>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} className="tinput" data-testid="signup-name" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.22em] text-fg-3">EMAIL</span>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="tinput" data-testid="signup-email" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] tracking-[0.22em] text-fg-3">PASSWORD</span>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="tinput" data-testid="signup-password" />
            </label>

            <button
              type="submit"
              disabled={loading}
              data-testid="signup-submit"
              className={`btn btn-primary justify-center py-3 ${loading ? 'opacity-70' : ''}`}
            >
              {loading ? 'PROVISIONING...' : 'PROVISION TERMINAL →'}
            </button>

            <p className="text-center text-[12px] text-fg-3 mt-4">
              Already enlisted? <Link href="/login" className="text-fg hover:text-profit">SIGN IN →</Link>
            </p>
          </div>
        </form>
      </main>
    </div>
  );
}
