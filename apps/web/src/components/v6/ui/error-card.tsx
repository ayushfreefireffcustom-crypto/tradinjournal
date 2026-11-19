'use client';

// A card-sized "couldn't load" state, centred, with a still drawing in a disc. It says what
// happened in plain words, tries again on its own (after 5 s, 15 s, then 30 s; offline it waits
// for the connection), and keeps a manual "Try again".
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowClockwise } from '@phosphor-icons/react';
import { ErrorArt, OfflineArt, SessionArt } from '@/components/dashboard-v2/art';
import { SceneDisc } from './scene-art';

type Kind = 'offline' | 'auth' | 'other';
const kindOf = (message: string): Kind => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
  if (/failed to fetch|networkerror|network request failed|load failed|internet/i.test(message)) return 'offline';
  if (/\b401\b|unauthori[sz]ed|sign in again|session (ended|expired)/i.test(message)) return 'auth';
  return 'other';
};

const COPY: Record<Kind, { title: string; body: string }> = {
  offline: { title: 'You’re offline', body: 'Nothing reached TRADElogs from this device. This loads again by itself as soon as you’re back online.' },
  auth: { title: 'Your session ended', body: 'For your security you were signed out. Sign in again and you’ll come back to this page.' },
  other: { title: 'Couldn’t load this', body: 'The request didn’t go through. Your data is safe; this is usually a blip.' },
};

// Auto-retries are counted per page and message, so a card that remounts on every failed retry
// still stops after three tries in five minutes.
const tries = new Map<string, number[]>();
const WAITS = [5, 15, 30];

/** `bare`: inside an existing card, so no card of its own. */
export default function ErrorCard({ message, onRetry, title, compact, bare }: { message: string; onRetry?: () => void; title?: string; compact?: boolean; bare?: boolean }) {
  const kind = kindOf(message);
  const c = COPY[kind];
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!onRetry || kind === 'auth') return;
    if (kind === 'offline') {
      const on = () => onRetry();
      window.addEventListener('online', on);
      return () => window.removeEventListener('online', on);
    }
    const key = `${window.location.pathname}|${message}`;
    const now = Date.now();
    const recent = (tries.get(key) ?? []).filter(t => now - t < 300_000);
    const wait = WAITS[recent.length];
    if (wait == null) return;
    setLeft(wait);
    const id = setInterval(() => setLeft(s => (s == null ? null : s - 1)), 1000);
    return () => clearInterval(id);
  }, [kind, message]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (left !== 0 || !onRetry) return;
    const key = `${window.location.pathname}|${message}`;
    tries.set(key, [...(tries.get(key) ?? []).filter(t => Date.now() - t < 300_000), Date.now()]);
    setLeft(null);
    onRetry();
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = kind === 'offline' ? 'Waiting for your connection' : left != null ? `Trying again in ${left} s` : null;
  const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/dashboard';
  return (
    <div className={`${bare ? '' : 'x-card '}st-state${compact ? ' st-state--sm' : ''}`} role="alert" data-testid="error-card">
      <SceneDisc size={compact ? 'sm' : undefined}>{kind === 'offline' ? <OfflineArt tight /> : kind === 'auth' ? <SessionArt tight /> : <ErrorArt tight />}</SceneDisc>
      <b className="st-t">{title ?? c.title}</b>
      <p>{c.body}</p>
      {status && <span className="st-live" aria-live="polite"><i aria-hidden className={left != null && left <= 1 ? 'on' : ''} />{status}</span>}
      <div className="st-row">
        {kind === 'auth'
          ? <Link href={`/login?next=${encodeURIComponent(next)}`} className="x-btn x-btn--hi">Sign in again</Link>
          : onRetry && <button type="button" className="x-btn x-btn--hi" onClick={() => { setLeft(null); onRetry(); }}><ArrowClockwise size={15} aria-hidden />Try again now</button>}
        <Link className="x-btn x-btn--ghost" href="/help">Get help</Link>
      </div>
      {kind === 'other' && !/unexpected token|<!doctype|json/i.test(message) && <small className="st-code">{message}</small>}
    </div>
  );
}
