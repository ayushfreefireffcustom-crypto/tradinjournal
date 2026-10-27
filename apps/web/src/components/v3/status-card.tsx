'use client';

// Centered status card for the access / maintenance / unsubscribe screens.
import Link from 'next/link';
import type { ReactNode } from 'react';
import '@/styles/app-v3.css';
import '@/styles/app-v5-auto.css';
import '@/styles/app-v5.css';
import Logo from '@/components/logo';

type Tone = 'v' | 'a' | 'g' | 'r';
export const SC_ICONS = {
  shield: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></svg>,
  warn: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>,
  tool: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 6.5a4 4 0 00-5.4 5L3.5 17.1a1.5 1.5 0 002.1 2.1l5.6-5.6a4 4 0 005-5.4l-2.4 2.4-2.1-.6-.6-2.1z" /></svg>,
  mail: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>,
  check: <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
};

export default function StatusCard({ icon, tone = 'v', kicker, title, body, children, onSignOut, testId, bar }: {
  icon: ReactNode; tone?: Tone; kicker: string; title: ReactNode; body?: ReactNode; children?: ReactNode;
  onSignOut?: () => void; testId?: string; bar?: boolean;
}) {
  return (
    <div className="v3 v5 sc" data-testid={testId}>
      <header className="sc-top">
        <Link href="/" className="au-wm sm" style={{ display: 'block' }} aria-label="TRADElogs home"><Logo height={26} /></Link>
        {onSignOut && <button type="button" onClick={onSignOut} className="sc-out">Sign out</button>}
      </header>
      <main className="sc-main">
        <section className={`sc-card ${bar ? `bar ${tone}` : ''}`}>
          <span className={`sc-ic ${tone}`}>{icon}</span>
          <p className={`sc-k ${tone}`}>{kicker}</p>
          <h1>{title}</h1>
          {body && <div className="sc-body">{body}</div>}
          {children}
        </section>
      </main>
    </div>
  );
}
