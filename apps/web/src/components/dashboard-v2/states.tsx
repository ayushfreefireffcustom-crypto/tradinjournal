'use client';

// The dashboard when it has nothing to chart yet, or couldn't load: each one says what
// happened, what TRADElogs is doing about it, and what you can do now.
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowClockwise, ArrowRight, BellRinging, CalendarBlank, Check, Clock, ListChecks, Notebook, Rows, WifiSlash, X,
} from '@phosphor-icons/react';
import { timeAgo } from '@/components/app-shell';
import { ConnectArt, EmptyViewArt, ErrorArt, OfflineArt, SessionArt } from './art';

export type LoadErrorKind = 'offline' | 'auth' | 'server' | 'other';
export function errorKind(e: unknown): LoadErrorKind {
  const status = (e as { status?: number })?.status;
  if (status === 0 || (typeof navigator !== 'undefined' && !navigator.onLine)) return 'offline';
  if (status === 401 || status === 403) return 'auth';
  if (status != null && status >= 500) return 'server';
  return 'other';
}

/** Retries a failed load on its own: after 5 s, 15 s, then 30 s; offline it waits for the connection instead. */
export function useAutoRetry(fails: number, kind: LoadErrorKind | null, retry: () => void): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!fails || !kind || kind === 'auth') { setLeft(null); return; }
    if (kind === 'offline') {
      setLeft(null);
      const on = () => retry();
      window.addEventListener('online', on);
      return () => window.removeEventListener('online', on);
    }
    const wait = [5, 15, 30][fails - 1];
    if (wait == null) { setLeft(null); return; }
    setLeft(wait);
    const id = setInterval(() => setLeft(s => (s == null ? null : s - 1)), 1000);
    return () => clearInterval(id);
  }, [fails, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (left === 0) { setLeft(null); retry(); } }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  return left;
}

function Tile({ href, icon, title, note }: { href: string; icon: ReactNode; title: string; note: string }) {
  return (
    <Link href={href} className="d2-tile d2-go">
      <span className="d2-glyph sm" aria-hidden>{icon}</span>
      <span className="d2-go-t"><b>{title}</b><small>{note}</small></span>
      <ArrowRight size={14} className="d2-go-a" aria-hidden />
    </Link>
  );
}

/** Connected, history read, no closed trade yet. */
export function WaitingState({ broker, login, ok, syncedAt, checkedAt, checking, onCheck }: {
  broker: string; login: string; ok: boolean; syncedAt: string | null; checkedAt: number | null; checking: boolean; onCheck: () => void;
}) {
  const steps: Array<{ state: 'done' | 'now' | 'bad'; title: string; note: string }> = [
    ok ? { state: 'done', title: 'MT5 connected', note: `${broker} ·${login.slice(-4)} · read-only` } : { state: 'bad', title: 'MT5 needs attention', note: 'Check the investor password in Brokers' },
    syncedAt ? { state: 'done', title: 'History read', note: `No closed trades yet · synced ${timeAgo(syncedAt)}` } : { state: 'now', title: 'Reading your history', note: 'Usually about a minute' },
    { state: 'now', title: 'Your first closed trade', note: `We check every minute${checkedAt ? ` · last ${timeAgo(new Date(checkedAt).toISOString())}` : ''}` },
  ];
  return (
    <section className="d2-tray d2-state" data-testid="dashboard-waiting">
      <div className="d2-card d2-state-hd">
        <div className="d2-state-art"><ConnectArt waiting /></div>
        <div className="d2-state-t">
          <h2>Waiting for your first closed trade</h2>
          <p>Open positions don&rsquo;t count yet. The moment one closes, every number on this page fills in from it, usually within a few minutes.</p>
          <div className="d2-row">
            <button type="button" className="x-btn" onClick={onCheck} disabled={checking} data-testid="waiting-check"><ArrowClockwise size={15} className={checking ? 'x-spin' : undefined} />{checking ? 'Checking…' : 'Check now'}</button>
            <Link href="/brokers" className="x-btn x-btn--ghost">Manage brokers</Link>
          </div>
        </div>
      </div>
      <ol className="d2-steps" aria-label="Setup">
        {steps.map((s, i) => (
          <li key={i} className={`d2-tile d2-step ${s.state}`}>
            <span className="d2-step-i" aria-hidden>{s.state === 'done' ? <Check size={14} weight="bold" /> : s.state === 'bad' ? <X size={14} weight="bold" /> : <Clock size={14} />}</span>
            <span><b>{s.title}</b><small>{s.note}</small></span>
          </li>
        ))}
      </ol>
      <div className="d2-cap d2-state-cap">While you wait</div>
      <div className="d2-gos">
        <Tile href="/settings#trading-rules" icon={<ListChecks size={20} />} title="Set your trading rules" note="Every trade gets graded against them from the first one" />
        <Tile href="/journal" icon={<Notebook size={20} />} title="Plan today's session" note="A few lines before you trade, to review against later" />
        <Tile href="/alerts" icon={<BellRinging size={20} />} title="Add a price alert" note="Get told when price reaches your level" />
      </div>
    </section>
  );
}

const ERR_COPY: Record<LoadErrorKind, { title: string; body: string }> = {
  offline: { title: 'You’re offline', body: 'Nothing reached TRADElogs from this device. The dashboard loads again by itself as soon as you’re back online.' },
  auth: { title: 'Your session ended', body: 'For your security you were signed out. Sign in again and you’ll land back here.' },
  server: { title: 'Couldn’t load your dashboard', body: 'Something went wrong on our side, not with your account or your trades. We’ll keep trying.' },
  other: { title: 'Couldn’t load your dashboard', body: 'The request didn’t go through. Your trades are untouched; this is usually a blip.' },
};

/** Nothing to show yet and the load failed. */
export function LoadError({ kind, message, retryIn, busy, fails, onRetry }: { kind: LoadErrorKind; message: string; retryIn: number | null; busy: boolean; fails: number; onRetry: () => void }) {
  const c = ERR_COPY[kind];
  const status = busy ? 'Trying again…'
    : kind === 'offline' ? 'Waiting for your connection'
      : retryIn != null ? `Trying again in ${retryIn} s`
        : kind === 'auth' ? null
          : fails > 3 ? 'Still not loading. Try again in a minute, or tell us if it keeps happening.' : null;
  return (
    <section className="d2-tray d2-state" role="alert" data-testid="dashboard-error">
      <div className="d2-card d2-state-hd">
        <div className="d2-state-art d2-state-art--err">{kind === 'offline' ? <OfflineArt /> : kind === 'auth' ? <SessionArt /> : <ErrorArt />}</div>
        <div className="d2-state-t">
          <h2>{c.title}</h2>
          <p>{c.body}</p>
          {status && <p className="d2-state-live" aria-live="polite"><i aria-hidden className={busy ? 'on' : ''} />{status}</p>}
          <div className="d2-row">
            {kind === 'auth'
              ? <Link href={`/login?next=${encodeURIComponent('/dashboard')}`} className="x-btn x-btn--hi">Sign in again</Link>
              : <button type="button" className="x-btn x-btn--hi" onClick={onRetry} disabled={busy}><ArrowClockwise size={15} className={busy ? 'x-spin' : undefined} />{busy ? 'Trying…' : 'Try again now'}</button>}
            <Link className="x-btn x-btn--ghost" href="/help">Get help</Link>
          </div>
          {kind !== 'offline' && <small className="d2-state-code">{message}</small>}
        </div>
      </div>
      {kind !== 'auth' && kind !== 'offline' && (
        <>
          <div className="d2-cap d2-state-cap">These load on their own</div>
          <div className="d2-gos">
            <Tile href="/trades" icon={<Rows size={20} />} title="Trade log" note="Every trade, with filters and notes" />
            <Tile href="/journal" icon={<Notebook size={20} />} title="Journal" note="Your entries and session plans" />
            <Tile href="/calendar" icon={<CalendarBlank size={20} />} title="Calendar" note="Day-by-day P&L" />
          </div>
        </>
      )}
    </section>
  );
}

/** The numbers on screen are from an earlier load; the refresh failed. */
export function RefreshBanner({ kind, at, retryIn, busy, onRetry }: { kind: LoadErrorKind; at: number | null; retryIn: number | null; busy: boolean; onRetry: () => void }) {
  return (
    <div className="d2-refresh" role="status" data-testid="dashboard-stale">
      <span className="d2-refresh-i" aria-hidden>{kind === 'offline' ? <WifiSlash size={16} /> : <ArrowClockwise size={16} />}</span>
      <span className="d2-refresh-t">
        <b>{kind === 'offline' ? 'You’re offline.' : kind === 'auth' ? 'Your session ended.' : 'Couldn’t refresh.'}</b>{' '}
        {at ? <>Showing numbers last updated {timeAgo(new Date(at).toISOString())}.</> : 'These numbers may be out of date.'}
        {busy ? ' Trying again…' : retryIn != null ? ` Trying again in ${retryIn} s.` : ''}
      </span>
      {kind === 'auth'
        ? <Link href={`/login?next=${encodeURIComponent('/dashboard')}`} className="x-btn x-btn--sm">Sign in</Link>
        : <button type="button" className="x-btn x-btn--sm" onClick={onRetry} disabled={busy}>{busy ? 'Trying…' : 'Try again'}</button>}
    </div>
  );
}

/** Closed trades exist, but none in this range and filters. */
export function NoTradesState({ inWindow, all, rangeLabel, chips, onClear, onAllTime }: {
  inWindow: number; all: number; rangeLabel: string; chips: Array<{ key: string; label: string; onRemove: () => void }>; onClear?: () => void; onAllTime?: () => void;
}) {
  return (
    <section className="d2-card d2-state-hd d2-state--slim" data-testid="dashboard-no-trades">
      <div className="d2-state-art d2-state-art--sm"><EmptyViewArt /></div>
      <div className="d2-state-t">
        <h2>No closed trades in this view</h2>
        <p>{inWindow
          ? <><b className="d2-n">{inWindow.toLocaleString('en-US')}</b> {inWindow === 1 ? 'trade' : 'trades'} closed in {rangeLabel.toLowerCase()}, but none match these filters.</>
          : <>Nothing closed in {rangeLabel.toLowerCase()}. You have <b className="d2-n">{all.toLocaleString('en-US')}</b> closed {all === 1 ? 'trade' : 'trades'} in total.</>}</p>
        {chips.length > 0 && (
          <div className="d2-fchips" aria-label="Active filters">
            {chips.map(c => <button key={c.key} type="button" className="d2-fchip" onClick={c.onRemove} aria-label={`Remove ${c.label}`}>{c.label}<X size={12} weight="bold" /></button>)}
          </div>
        )}
        <div className="d2-row">
          {onClear && <button type="button" className="x-btn" onClick={onClear}>Clear filters</button>}
          {onAllTime && <button type="button" className={`x-btn${onClear ? ' x-btn--ghost' : ''}`} onClick={onAllTime}>Show all time</button>}
        </div>
      </div>
    </section>
  );
}
