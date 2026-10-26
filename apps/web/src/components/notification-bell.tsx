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
  const kind = n.kind ?? '';
  const glyph = kind.includes('price') ? '🔔' : kind.includes('news') ? '📰' : CCY_FLAG[ccy] ?? '📅';
  return { glyph, ring };
}

export default function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.notifications.list();
      setItems(res.items);
      setUnread(res.unread);
    } catch {
      // Keep the bell visible on a transient failure (e.g. a DB blip) — the
      // poll retries. Hiding it permanently made it vanish on some page loads.
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        aria-label="Notifications"
        data-testid="notif-bell"
        className="relative w-[38px] h-[38px] rounded-full border border-border bg-surface flex items-center justify-center text-fg-3 hover:text-fg hover:border-border-strong transition-colors focus-ring"
      >
        <Bell size={17} weight={unread > 0 ? 'fill' : 'regular'} className={unread > 0 ? 'text-fg' : ''} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[var(--acc)] text-[var(--on-acc,#fff)] text-[10px] font-bold flex items-center justify-center ring-2 ring-[var(--color-app)]">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[340px] max-w-[86vw] rounded-[18px] border border-border bg-surface shadow-[0_30px_70px_-25px_rgba(16,15,23,.45)] z-50 overflow-hidden fade-up" data-testid="notif-center">
          <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
            <span className="text-[14px] font-semibold text-fg">Notifications</span>{unread > 0 && <span className="text-[12px] text-fg-3">{unread} new</span>}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13.5px] text-fg-3">
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
                        <div className="text-[13.5px] text-fg leading-snug font-medium">{n.title}</div>
                        {n.body && <div className="text-[12.5px] text-fg-3 mt-0.5 leading-snug">{n.body}</div>}
                        <div className="text-[11.5px] text-fg-3 mt-1">{ago(n.createdAt) === 'now' ? 'Just now' : `${ago(n.createdAt)} ago`}</div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id} className={n.read ? '' : 'bg-[rgba(var(--acc-rgb),.06)]'}>
                      {n.href ? (
                        <Link href={n.href} onClick={() => setOpen(false)} className="block px-4 py-3 hover:bg-surface-hover transition-colors">{body}</Link>
                      ) : (
                        <div className="px-4 py-3">{body}</div>
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
