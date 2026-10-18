'use client';

// v3 auth layout: a night "showcase" panel on the left (per-screen content) and
// the form on paper on the right, with a top-right switch link and a quiet
// footer. Collapses to the form column alone on small screens.
import Link from 'next/link';
import { type ReactNode, useRef } from 'react';
import '@/styles/app-v3.css';

type Variant = 'signin' | 'signup' | 'verify' | 'forgot';

const LOCK = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>;
const SHIELD = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>;

function Showcase({ variant }: { variant: Variant }) {
  if (variant === 'signin') {
    return (
      <div className="au-demo" aria-hidden>
        <div className="au-pnl">
          <span>Net P&amp;L · sample account</span>
          <b>+$265<small>.97</small></b>
          <svg viewBox="0 0 400 120" preserveAspectRatio="none"><defs><linearGradient id="au-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
            <path d="M0 96 L30 98 L60 104 L95 50 L125 36 L150 80 L175 88 L205 44 L235 56 L280 60 L330 61 L400 58 L400 120 L0 120Z" fill="url(#au-g)" />
            <path className="au-ln" d="M0 96 L30 98 L60 104 L95 50 L125 36 L150 80 L175 88 L205 44 L235 56 L280 60 L330 61 L400 58" fill="none" stroke="#fff" strokeWidth="2.4" vectorEffect="non-scaling-stroke" /></svg>
        </div>
        <div className="au-fix"><span><i>!</i> One thing to fix this week</span><p>Close losing trades at your stop — don’t wait for them to come back.</p><small>From your weekly review</small></div>
      </div>
    );
  }
  return null;
}

const COPY: Record<Variant, { h: ReactNode; p?: string; foot: ReactNode }> = {
  signin: { h: <>Your trades know.<br /><em>Now</em> you will too.</>, p: 'Pick up where you left off — your journal synced while you were away.', foot: <><span>{LOCK} Read-only MT5 access</span><span>{SHIELD} Can’t trade or withdraw</span></> },
  signup: { h: <>Start journaling<br />in <em>90 seconds.</em></>, foot: <><span>{LOCK} We never place trades</span><span>{SHIELD} Your data is never sold</span></> },
  verify: { h: <>One step<br />from your <em>edge.</em></>, p: 'Confirm your email, connect MT5 read-only, and your history backfills automatically.', foot: <span>{LOCK} Codes expire after 10 minutes</span> },
  forgot: { h: <>Locked out?<br /><em>We’ve got you.</em></>, p: 'Reset your password with a 6-digit code. Your journal and broker connections stay exactly as they are.', foot: <span>{LOCK} Codes expire after 10 minutes</span> },
};

const STEPS = [
  ['Create your account', 'Free · no card required'],
  ['Connect MT5 read-only', 'Investor password · any broker'],
  ['Get your first review', 'Every week · one thing to fix'],
];

export default function AuthShell({ variant, top, children, testId }: { variant: Variant; top?: ReactNode; children: ReactNode; testId?: string }) {
  const c = COPY[variant];
  const asideRef = useRef<HTMLElement>(null);
  return (
    <div className="v3 au" data-testid={testId}>
      <aside className="au-side" ref={asideRef}
        onPointerMove={e => { const r = asideRef.current?.getBoundingClientRect(); if (r) asideRef.current!.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`), asideRef.current!.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`); }}>
        <Link href="/" className="au-wm">TRADE<span>logs</span></Link>
        <Showcase variant={variant} />
        <div className="au-copy">
          <h2>{c.h}</h2>
          {c.p && <p>{c.p}</p>}
          {variant === 'signup' && (
            <ol className="au-steps">
              {STEPS.map(([t, s], i) => (
                <li key={t} className={i === 0 ? 'on' : ''}><i>{i + 1}</i><span><b>{t}</b><small>{s}</small></span>{i === 0 && <em>You’re here</em>}</li>
              ))}
            </ol>
          )}
          <div className="au-foot">{c.foot}</div>
        </div>
      </aside>
      <main className="au-main">
        <div className="au-top"><Link href="/" className="au-wm sm">TRADE<span>logs</span></Link>{top}</div>
        <div className="au-form">{children}</div>
        <div className="au-legal"><span>© {new Date().getFullYear()} TRADElogs</span><span>·</span><Link href="/terms">Terms</Link><span>·</span><Link href="/privacy">Privacy</Link></div>
      </main>
    </div>
  );
}

/** Pill submit: violet, label left, white circle arrow right. */
export function AuthSubmit({ children, loading, disabled, testId }: { children: ReactNode; loading?: boolean; disabled?: boolean; testId?: string }) {
  return (
    <button type="submit" disabled={disabled || loading} className="au-submit" data-testid={testId} aria-busy={loading}>
      <span>{children}</span>
      <i>{loading ? <span className="au-spin" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}</i>
    </button>
  );
}

export function PasswordStrength({ score, label }: { score: number; label: string }) {
  const tone = score >= 3 ? 'g' : score === 2 ? 'a' : 'r';
  return (
    <div className={`au-pw ${tone}`} aria-live="polite">
      {[0, 1, 2, 3].map(i => <i key={i} className={i < score ? 'on' : ''} />)}
      <span>{label}</span>
    </div>
  );
}

export function EyeButton({ shown, onClick, testId }: { shown: boolean; onClick: () => void; testId?: string }) {
  return (
    <button type="button" className="au-eye" onClick={onClick} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} data-testid={testId}>
      {shown
        ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 6c5 0 9 6 9 6a17 17 0 01-3.2 3.6M6.4 7.6C4.3 9.2 3 12 3 12s4 6 9 6a9 9 0 004.3-1.1" /></svg>
        : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.6" /></svg>}
    </button>
  );
}
