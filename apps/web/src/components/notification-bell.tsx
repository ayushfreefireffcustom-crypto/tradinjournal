'use client';

// Top-bar notification bell + inbox. Polls the in-app inbox for the unread count
// and shows a dropdown of recent notifications with deep links. Self-contained,
// so a failed poll never disturbs the frame. Styled by styles/v6/frame.css.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, type AppNotification } from '@/lib/api';
import { getSoundOn, playChime } from '@/lib/notification-sound';
import { useOnScreen } from '@/components/v6/ui/use-on-screen';

const POLL_MS = 60_000;

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const CCY = /^(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD|CNY|INR|BRL|KRW|MXN|ZAR|SEK|NOK|SGD|HKD|RUB|TRY|PLN)$/;

/** Tile content + impact for a notification, parsed from its kind and text. */
function visualFor(n: AppNotification): { tile: React.ReactNode; high: boolean } {
  const ccy = (n.title.split(/[ ·]/)[0] ?? '').toUpperCase();
  const high = (n.body ?? '').toUpperCase().includes('HIGH');
  if (n.kind.includes('price')) return { tile: <IBell size={15} />, high };
  if (n.kind.includes('news')) return { tile: <IDoc />, high };
  if (CCY.test(ccy)) return { tile: <span className="m">{ccy}</span>, high };
  return { tile: <ICal />, high };
}

export default function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const pop = useOnScreen(open);
  const ref = useRef<HTMLDivElement>(null);
  // Newest notification seen so far; a newer one chimes if sound is on. Null until the first load.
  const newest = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.notifications.list();
      setItems(res.items);
      setUnread(res.unread);
      const top = res.items[0]?.createdAt ?? '';
      if (newest.current !== null && top > newest.current && res.items.some(i => !i.read && i.createdAt > newest.current!) && getSoundOn()) playChime();
      newest.current = top;
    } catch {
      // Keep the bell on a transient failure; the next poll retries.
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // What's new stays marked while the panel is open (A4.1), so you can see which
  // ones they are; it's all marked read when the panel closes.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const close = useCallback(() => {
    setOpen(false);
    if (!itemsRef.current.some(i => !i.read)) return;
    setUnread(0);
    setItems(prev => prev.map(i => ({ ...i, read: true })));
    void api.notifications.markRead().catch(() => { /* the next poll shows the true count */ });
  }, []);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open, close]);

  const toggle = useCallback(() => { if (open) close(); else setOpen(true); }, [open, close]);

  const fresh = items.filter(i => !i.read).length;

  return (
    <div className="nb" ref={ref}>
      <button onClick={toggle} aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open} aria-haspopup="dialog" data-testid="notif-bell" className="nb-btn">
        <IBell size={17} />
        {unread > 0 && <span className="nb-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div ref={pop} className="x-pop nb-pop" role="dialog" aria-label="Notifications" data-testid="notif-center">
          <div className="nb-hd"><b>Notifications</b>{fresh > 0 && <><span>{fresh} new</span><button type="button" className="nb-markall" onClick={close} data-testid="notif-mark-all">Mark all read</button></>}</div>
          {items.length === 0 ? (
            <div className="nb-empty"><span className="nb-tile"><ICheck /></span>You&rsquo;re all caught up.</div>
          ) : (
            <ul className="nb-list">
              {items.map(n => {
                const v = visualFor(n);
                const body = (
                  <>
                    <span className="nb-tile">{v.tile}{v.high && <i className="nb-hi" aria-label="High impact" />}</span>
                    <span className="nb-txt">
                      <b>{n.title}</b>
                      {n.body && <span>{n.body}</span>}
                      <small>{ago(n.createdAt)}</small>
                    </span>
                  </>
                );
                return (
                  <li key={n.id} className={n.read ? '' : 'nb-new'}>
                    {n.href ? <Link href={n.href} onClick={close}>{body}</Link> : <div>{body}</div>}
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/notifications" className="nb-all" onClick={close} data-testid="notif-view-all">Open the inbox</Link>
        </div>
      )}
    </div>
  );
}

function IBell({ size = 17 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 20a2 2 0 004 0" /></svg>;
}
function IDoc() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 4h11l3 3v13H5z" /><path d="M9 10h6M9 14h6" /></svg>;
}
function ICal() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>;
}
function ICheck() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
}
