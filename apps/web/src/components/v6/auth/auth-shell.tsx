'use client';

// v6 auth layout: a quiet brand column (logo, one line about the screen, what
// TRADElogs does) beside the form card. Phones get the form column alone with
// the logo in its top bar.
import Link from '@/components/v6/ui/link';
import type { ReactNode } from 'react';
import Logo from '@/components/logo';
import '@/styles/v6/tokens.css';
import '@/styles/v6/components.css';
import '@/styles/v6/auth.css';

type Variant = 'signin' | 'signup' | 'verify' | 'forgot';

const LOCK = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>;
const SHIELD = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>;
export const I_CHECK = <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
const I_ALERT = <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>;

const COPY: Record<Variant, { h: ReactNode; p: string; foot: ReactNode }> = {
  signin: { h: <>Welcome back.<br />Your trades <em>kept syncing.</em></>, p: 'Sign in to pick up where you left off.', foot: <><span>{LOCK} Read-only MT5 access</span><span>{SHIELD} Can’t trade or withdraw</span></> },
  signup: { h: <>Start journaling<br />in <em>90 seconds.</em></>, p: 'Free, no card needed. Connect MT5 read-only and your history fills in on its own.', foot: <><span>{LOCK} We never place trades</span><span>{SHIELD} Your data is never sold</span></> },
  verify: { h: <>One step <em>left.</em></>, p: 'Confirm your email, connect MT5 read-only, and your history backfills automatically.', foot: <span>{LOCK} Codes expire after 10 minutes</span> },
  forgot: { h: <>Reset your <em>password.</em></>, p: 'We’ll email you a 6-digit code. Your journal and brokers stay as they are.', foot: <span>{LOCK} Codes expire after 10 minutes</span> },
};

const STEPS = ['Create your account', 'Connect MT5 read-only', 'Get your first review'];

export default function AuthShell({ variant, top, children, testId, wide }: { variant: Variant; top?: ReactNode; children: ReactNode; testId?: string; wide?: boolean }) {
  const c = COPY[variant];
  return (
    <div className="v6 au-root au-auth" data-testid={testId}>
      <aside className="au-brand">
        <div className="au-brand-in">
          <Link href="/" className="au-logo" aria-label="TRADElogs home"><Logo height={28} /></Link>
          <div className="au-pitch">
            <h2>{c.h}</h2>
            <p>{c.p}</p>
            {variant === 'signup' && (
              <ol className="au-steps">{STEPS.map((t, i) => <li key={t} className={i === 0 ? 'on' : ''}><i>{i + 1}</i>{t}</li>)}</ol>
            )}
          </div>
          {/* The product, so the page shows what you're signing in to. Demo data. */}
          <figure className="au-shot" aria-hidden>
            <img src="/landing/dashboard-v5.jpg" alt="" width={2160} height={1350} decoding="async" />
            <figcaption className="au-float"><span className="au-float-k">One thing to fix</span><b>No new entries after 15:00</b></figcaption>
          </figure>
          <div className="au-trust">{c.foot}</div>
        </div>
      </aside>
      <main className="au-col">
        <div className="au-bar">
          <Link href="/" className="au-logo" aria-label="TRADElogs home"><Logo height={24} /></Link>
          {top && <span>{top}</span>}
        </div>
        <div className="au-center">
          <div className={`x-card au-card ${wide ? 'au-card--wide' : ''}`}>{children}</div>
        </div>
        <div className="au-fine"><span>© {new Date().getFullYear()} TRADElogs</span><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link></div>
      </main>
    </div>
  );
}

/** Full-width primary submit with an inline spinner while busy. */
export function AuthSubmit({ children, loading, disabled, testId }: { children: ReactNode; loading?: boolean; disabled?: boolean; testId?: string }) {
  return (
    <button type="submit" disabled={disabled || loading} className="x-btn x-btn--hi x-btn--lg x-btn--full au-sub-btn" data-testid={testId} aria-busy={loading}>
      {loading && <Spinner />}
      <span>{children}</span>
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="x-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function PasswordStrength({ score, label }: { score: number; label: string }) {
  const tone = score >= 3 ? 'g' : score === 2 ? 'n' : 'r';
  return (
    <div className={`au-meter ${tone}`} aria-live="polite">
      {[0, 1, 2, 3].map(i => <i key={i} className={i < score ? 'on' : ''} />)}
      <span>{label}</span>
    </div>
  );
}

export function EyeButton({ shown, onClick, testId }: { shown: boolean; onClick: () => void; testId?: string }) {
  return (
    <button type="button" className="au-reveal" onClick={onClick} aria-label={shown ? 'Hide password' : 'Show password'} aria-pressed={shown} data-testid={testId}>
      {shown
        ? <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0112 6c5 0 9 6 9 6a17 17 0 01-3.2 3.6M6.4 7.6C4.3 9.2 3 12 3 12s4 6 9 6a9 9 0 004.3-1.1" /></svg>
        : <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z" /><circle cx="12" cy="12" r="2.6" /></svg>}
    </button>
  );
}

/** Red message under a field or form; pass through id/testid/role as needed. */
export function AuthError({ children, testId }: { children: ReactNode; testId?: string }) {
  return <p className="au-error" data-testid={testId} role="alert">{I_ALERT}<span>{children}</span></p>;
}

export function AuthOk({ children }: { children: ReactNode }) {
  return <p className="au-done" role="status">{I_CHECK}<span>{children}</span></p>;
}
