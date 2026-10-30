'use client';

// Centred status card for the access, maintenance, unsubscribe and 404 screens.
import Link from 'next/link';
import type { ReactNode } from 'react';
import Logo from '@/components/logo';
import '@/styles/v6/tokens.css';
import '@/styles/v6/components.css';
import '@/styles/v6/auth.css';

/** n = neutral, g = done / fine, r = problem. */
type Tone = 'n' | 'g' | 'r';

export const SC_ICONS = {
  shield: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  warn: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>,
  tool: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 6.5a4 4 0 00-5.4 5L3.5 17.1a1.5 1.5 0 002.1 2.1l5.6-5.6a4 4 0 005-5.4l-2.4 2.4-2.1-.6-.6-2.1z" /></svg>,
  mail: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>,
  check: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  search: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>,
  lock: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>,
};

export default function StatusCard({ icon, tone = 'n', kicker, title, body, children, onSignOut, testId }: {
  icon: ReactNode; tone?: Tone; kicker: string; title: ReactNode; body?: ReactNode; children?: ReactNode;
  onSignOut?: () => void; testId?: string;
}) {
  return (
    <div className="v6 au-root au-st" data-testid={testId}>
      <header className="au-sthd">
        <Link href="/" className="au-logo" aria-label="TRADElogs home"><Logo height={24} /></Link>
        {onSignOut && <button type="button" onClick={onSignOut} className="x-btn x-btn--sm">Sign out</button>}
      </header>
      <main className="au-center">
        <section className="x-card au-stcard">
          <span className={`au-sticon ${tone}`}>{icon}</span>
          <p className={`au-stk ${tone}`}>{kicker}</p>
          <h1 className="au-t">{title}</h1>
          {body && <div className="au-stbody">{body}</div>}
          {children}
        </section>
      </main>
    </div>
  );
}
