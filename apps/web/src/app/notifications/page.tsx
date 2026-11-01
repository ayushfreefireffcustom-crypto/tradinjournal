'use client';

// Notification inbox (C6.5): one tab per group with unread counts, empty groups
// dimmed, Unread / All / Archived, mark read and archive per item or per tab,
// and a per-device sound toggle for new notifications.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { api, NOTIFICATION_GROUPS, NOTIFICATION_GROUP_LABELS, type Inbox, type InboxItem, type InboxStatus, type NotificationGroup } from '@/lib/api';
import { getSoundOn, setSoundOn } from '@/lib/notification-sound';
import '@/styles/v6/inbox.css';

const STATUSES: Array<{ id: InboxStatus; label: string }> = [
  { id: 'unread', label: 'Unread' },
  { id: 'all', label: 'All' },
  { id: 'archived', label: 'Archived' },
];

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function NotificationsPage() {
  const toast = useToast();
  const [group, setGroup] = useState<NotificationGroup | null>(null);
  const [status, setStatus] = useState<InboxStatus>('all');
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sound, setSound] = useState(false);

  useEffect(() => setSound(getSoundOn()), []);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.notifications.inbox({ group: group ?? undefined, status }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications');
    }
  }, [group, status]);

  useEffect(() => { setData(null); void load(); }, [load]);

  async function loadMore() {
    if (!data?.nextCursor) return;
    setMore(true);
    try {
      const next = await api.notifications.inbox({ group: group ?? undefined, status, cursor: data.nextCursor });
      setData(d => (d ? { ...next, items: [...d.items, ...next.items] } : next));
    } catch {
      toast.error('Could not load more');
    } finally {
      setMore(false);
    }
  }

  async function act(action: 'read' | 'archive' | 'unarchive', ids?: string[]) {
    setBusy(true);
    try {
      const r = await api.notifications.inboxAction({ action, ...(ids ? { ids } : {}), ...(!ids && group ? { group } : {}) });
      if (!ids) toast.success(action === 'read' ? (r.updated ? `Marked ${r.updated} as read` : 'Nothing unread') : action === 'archive' ? `Archived ${r.updated}` : `Restored ${r.updated}`);
      await load();
    } catch {
      toast.error('Could not update');
    } finally {
      setBusy(false);
    }
  }

  async function open(n: InboxItem) {
    if (!n.read) void api.notifications.inboxAction({ action: 'read', ids: [n.id] }).catch(() => undefined);
  }

  const unreadAll = data ? NOTIFICATION_GROUPS.reduce((t, g) => t + data.unread[g], 0) : 0;
  const totalAll = data ? NOTIFICATION_GROUPS.reduce((t, g) => t + data.total[g], 0) : 0;
  const unreadHere = data ? (group ? data.unread[group] : unreadAll) : 0;

  return (
    <AppShell legacy={false} pageTitle="Notifications" pageSubtitle="Everything TRADElogs told you, by type"
      actions={<Link href="/settings#notifications" className="x-btn">Settings</Link>}>
      <div className="x-page ib" data-testid="inbox-page">
        <div className="x-tabs ib-tabs" role="tablist" aria-label="Notification types">
          <button role="tab" aria-selected={group === null} onClick={() => setGroup(null)} data-testid="inbox-tab-all">
            All{unreadAll > 0 && <span className="x-badge">{unreadAll}</span>}
          </button>
          {NOTIFICATION_GROUPS.map(g => {
            const empty = !!data && data.total[g] === 0 && status !== 'archived';
            return (
              <button key={g} role="tab" aria-selected={group === g} onClick={() => setGroup(g)} className={empty ? 'ib-empty' : ''}
                title={NOTIFICATION_GROUP_LABELS[g].hint} data-testid={`inbox-tab-${g}`}>
                {NOTIFICATION_GROUP_LABELS[g].label}
                {data && data.unread[g] > 0 && <span className="x-badge">{data.unread[g]}</span>}
              </button>
            );
          })}
        </div>

        <section className="x-card ib-card" aria-label="Notifications">
          <div className="x-ch ib-bar">
            <div className="x-seg x-seg--in x-seg--sm" role="tablist" aria-label="Show">
              {STATUSES.map(s => <button key={s.id} role="tab" aria-selected={status === s.id} onClick={() => setStatus(s.id)} data-testid={`inbox-status-${s.id}`}>{s.label}</button>)}
            </div>
            <div className="ib-acts">
              <label className="ib-sound">
                <button type="button" className="x-switch" role="switch" aria-checked={sound} aria-label="Sound for new notifications"
                  onClick={() => { const v = !sound; setSound(v); setSoundOn(v); }} data-testid="inbox-sound" />
                <span>Sound</span>
              </label>
              {status !== 'archived' ? (
                <>
                  <button className="x-btn x-btn--sm" onClick={() => void act('read')} disabled={busy || unreadHere === 0} data-testid="inbox-read-all">Mark all read</button>
                  <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => void act('archive')} disabled={busy || !data?.items.length} data-testid="inbox-archive-all">Archive all</button>
                </>
              ) : (
                <button className="x-btn x-btn--sm" onClick={() => void act('unarchive')} disabled={busy || !data?.items.length} data-testid="inbox-restore-all">Restore all</button>
              )}
            </div>
          </div>

          {error ? (
            <div className="x-empty"><b>Couldn&rsquo;t load notifications</b><p>{error}</p><button className="x-btn" onClick={() => void load()}>Try again</button></div>
          ) : !data ? (
            <div className="ib-sk">{[0, 1, 2, 3].map(i => <i key={i} className="x-skel x-skel--in" />)}</div>
          ) : data.items.length === 0 ? (
            <div className="x-empty" data-testid="inbox-empty">
              <b>{status === 'archived' ? 'Nothing archived' : status === 'unread' ? 'You’re all caught up' : totalAll === 0 ? 'No notifications yet' : 'Nothing here yet'}</b>
              <p>{group ? NOTIFICATION_GROUP_LABELS[group].hint : 'Trade fills, risk alerts, AI signals, news and system messages show up here.'}</p>
            </div>
          ) : (
            <ul className="ib-list" data-testid="inbox-list">
              {data.items.map(n => (
                <li key={n.id} className={n.read ? '' : 'ib-new'} data-testid={`inbox-item-${n.id}`}>
                  <span className={`ib-dot ib-dot--${n.group}`} aria-hidden />
                  {n.href ? (
                    <Link href={n.href} className="ib-txt" onClick={() => void open(n)}>
                      <b>{n.title}</b>{n.body && <span>{n.body}</span>}
                    </Link>
                  ) : (
                    <div className="ib-txt"><b>{n.title}</b>{n.body && <span>{n.body}</span>}</div>
                  )}
                  <span className="ib-meta">
                    <span className="x-tag">{NOTIFICATION_GROUP_LABELS[n.group].label}</span>
                    <small>{ago(n.createdAt)}</small>
                  </span>
                  <span className="ib-row-acts">
                    {!n.read && !n.archived && <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => void act('read', [n.id])} disabled={busy} aria-label={`Mark “${n.title}” read`}>Read</button>}
                    {n.archived
                      ? <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => void act('unarchive', [n.id])} disabled={busy} aria-label={`Restore “${n.title}”`}>Restore</button>
                      : <button className="x-btn x-btn--sm x-btn--ghost" onClick={() => void act('archive', [n.id])} disabled={busy} aria-label={`Archive “${n.title}”`} data-testid={`inbox-archive-${n.id}`}>Archive</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data?.nextCursor && (
            <div className="ib-more"><button className="x-btn x-btn--sm" onClick={() => void loadMore()} disabled={more} data-testid="inbox-more">{more ? 'Loading…' : 'Load more'}</button></div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
