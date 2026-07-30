'use client';

// Topbar notification bell + center. Polls the in-app inbox for the unread count
// and shows a dropdown of recent notifications with deep links. Self-contained
// and self-hiding on error, so it never disturbs the shell.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Check } from '@phosphor-icons/react';
import { api, type AppNotification } from '@/lib/api';

const POLL_MS = 60_000;

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Currency → flag emoji, for the notification avatar.
const CCY_FLAG: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭',
  NZD: '🇳🇿', CNY: '🇨🇳', INR: '🇮🇳', BRL: '🇧🇷', KRW: '🇰🇷', MXN: '🇲🇽', ZAR: '🇿🇦',
  SEK: '🇸🇪', NOK: '🇳🇴', SGD: '🇸🇬', HKD: '🇭🇰', RUB: '🇷🇺', TRY: '🇹🇷', PLN: '🇵🇱',
};

/** Avatar glyph + impact-colored ring for a notification, parsed from its text. */
function visualFor(n: { kind?: string; title: string; body?: string | null }): { glyph: string; ring: string } {
  const ccy = (n.title.split(/[ ·]/)[0] ?? '').toUpperCase();
  const b = (n.body ?? '').toUpperCase();
  const ring = b.includes('HIGH') ? 'border-loss/50' : b.includes('MEDIUM') ? 'border-warning/50' : 'border-border-strong';
  const isNews = (n.kind ?? '').includes('news');
  const glyph = isNews ? '📰' : CCY_FLAG[ccy] ?? '📅';
  return { glyph, ring };
}

export default function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.notifications.list();
      setItems(res.items);
      setUnread(res.unread);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = useCallback(async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      setItems(prev => prev.map(i => ({ ...i, read: true })));
      try { await api.notifications.markRead(); } catch { /* ignore */ }
    }
  }, [open, unread]);

  if (failed) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        data-testid="notif-bell"
        className="relative w-8 h-8 rounded-md border border-border flex items-center justify-center text-fg-3 hover:text-fg hover:border-border-strong transition-colors"
      >
        <Bell size={15} weight={unread > 0 ? 'fill' : 'regular'} className={unread > 0 ? 'text-fg' : ''} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-loss text-white text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[86vw] rounded-[var(--radius-card)] border border-border-strong bg-app shadow-xl z-50 overflow-hidden" data-testid="notif-center">
          <div className="px-3.5 py-2.5 border-b border-border-soft flex items-center justify-between">
            <span className="text-[10px] tracking-[0.2em] uppercase text-fg-3">Notifications</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-3.5 py-8 text-center text-[12px] text-fg-3">
                <Check size={18} className="mx-auto mb-2 text-fg-3" />
                You&apos;re all caught up.
              </div>
            ) : (
              <ul className="divide-y divide-border-soft">
                {items.map(n => {
                  const v = visualFor(n);
                  const body = (
                    <div className="flex gap-2.5">
                      <span className={`shrink-0 w-8 h-8 rounded-full border ${v.ring} bg-surface flex items-center justify-center text-[15px] leading-none`} aria-hidden>{v.glyph}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] text-fg leading-snug">{n.title}</div>
                        {n.body && <div className="text-[11.5px] text-fg-3 mt-0.5 leading-snug">{n.body}</div>}
                        <div className="text-[9.5px] tracking-widest uppercase text-fg-3 mt-1">{ago(n.createdAt)} ago</div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id} className={n.read ? '' : 'bg-profit/[0.04]'}>
                      {n.href ? (
                        <Link href={n.href} onClick={() => setOpen(false)} className="block px-3.5 py-2.5 hover:bg-surface transition-colors">{body}</Link>
                      ) : (
                        <div className="px-3.5 py-2.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
