'use client';

// Settings sections: profile, location, notifications (alerts + the weekly
// review email) and a short "how alerts reach you" companion column. Each
// editable section keeps a draft and saves with its own button.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authClient } from '@/lib/auth-client';
import { countryName } from '@/lib/countries';
import { locationApi, type UserLocationDto } from '@/lib/location-api';
import { api, NOTIFICATION_GROUPS, NOTIFICATION_GROUP_LABELS, type EventImpact, type NotificationChannel, type NotificationGroup, type NotificationGroupPrefs, type NotificationPrefs, type TelegramStatus } from '@/lib/api';
import { enablePush, disablePush } from '@/lib/push-client';
import TestNotification from './test-notification';
import LocationForm from '@/components/location-form';
import { ICheck, ILock } from '@/components/v6/icons';
import '@/styles/v6/account.css';

function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'T';
}

function sentLabel(iso: string | null): string {
  if (!iso) return 'Never sent';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never sent';
  return `Last sent ${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function Switch({ on, onClick, disabled, label, testId }: { on: boolean; onClick: () => void; disabled?: boolean; label: string; testId?: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} disabled={disabled} data-testid={testId} className="x-switch" />;
}

function Row({ title, desc, children }: { title: string; desc?: ReactNode; children: ReactNode }) {
  return (
    <div className="ac-st-row">
      <div className="ac-st-row-t"><b>{title}</b>{desc && <span>{desc}</span>}</div>
      <div className="ac-st-row-c">{children}</div>
    </div>
  );
}

// ── Profile ────────────────────────────────────────────────────────────────
export function ProfileSection({ accountCount }: { accountCount: number }) {
  const { data: session } = authClient.useSession();
  const name = session?.user?.name ?? 'Trader';
  const email = session?.user?.email ?? '';
  return (
    <section className="x-card ac-st-card" data-testid="profile-card" aria-labelledby="ac-st-pf">
      <div className="x-ch"><h2 id="ac-st-pf">Profile</h2></div>
      <div className="ac-pf">
        <span className="ac-pf-av" aria-hidden>{initialsOf(name)}</span>
        <div className="ac-pf-nm"><b>{name}</b><span>{email}</span></div>
        <button onClick={() => authClient.signOut()} data-testid="profile-signout" className="x-btn">Sign out</button>
      </div>
      <div className="x-strip ac-pf-strip">
        <div><span>Connected accounts</span><b className="m">{accountCount} / 2</b></div>
        <div><span>Plan</span><b>Free</b></div>
        <div><span>Data source</span><b>MT5 auto-sync</b></div>
      </div>
    </section>
  );
}

// ── Location ───────────────────────────────────────────────────────────────
export function LocationSection() {
  const [loc, setLoc] = useState<UserLocationDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const loadLoc = useCallback(() => {
    locationApi.get().then(setLoc).catch(() => setLoc(null)).finally(() => setLoaded(true));
  }, []);
  useEffect(() => { loadLoc(); }, [loadLoc]);

  return (
    <section className="x-card ac-st-card" data-testid="profile-location" aria-labelledby="ac-st-loc">
      <div className="x-ch">
        <h2 id="ac-st-loc">Location</h2>
        <div className="x-r"><button type="button" className="x-btn x-btn--sm" onClick={() => setEditing(e => !e)}>{editing ? 'Cancel' : 'Edit'}</button></div>
      </div>
      {!editing ? (
        <div className="ac-st-loc">
          {!loaded ? <i className="x-skel x-skel--in ac-st-loc-sk" />
            : loc?.complete ? <><b>{loc.city}, {countryName(loc.country)}</b><span className="m x-muted">{loc.postalCode}</span></>
            : <span className="x-tag x-tag--r">Not set, required</span>}
          <p>Used for product insights only. It is never shown to other traders.</p>
        </div>
      ) : (
        <LocationForm initial={loc ?? undefined} submitLabel="Save location" onSaved={() => { setEditing(false); loadLoc(); }} />
      )}
    </section>
  );
}

// ── Notifications ──────────────────────────────────────────────────────────
const IMPACTS: EventImpact[] = ['LOW', 'MEDIUM', 'HIGH'];
const IMP_LABEL: Record<EventImpact, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
type Editable = Pick<NotificationPrefs, 'inApp' | 'email' | 'push' | 'minImpact' | 'leadMinutes' | 'newsAlerts' | 'priceAlerts'>;
const KEYS: (keyof Editable)[] = ['inApp', 'email', 'push', 'minImpact', 'leadMinutes', 'newsAlerts', 'priceAlerts'];
const BLOCKED = 'Notifications are blocked for this site. Click the site icon at the left of the address bar → Notifications → Allow, then try again. (In Brave, also turn on brave://settings/privacy → “Use Google services for push messaging”.)';

export function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [draft, setDraft] = useState<Editable | null>(null);
  const [groupsDraft, setGroupsDraft] = useState<NotificationGroupPrefs>({});
  const [tg, setTg] = useState<TelegramStatus | null>(null);
  const [weekly, setWeekly] = useState<{ enabled: boolean; lastSentAt: string | null } | null>(null);
  const [weeklyDraft, setWeeklyDraft] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, w, t] = await Promise.allSettled([api.notifications.preferences(), api.ai.weeklyReview(), api.notifications.telegram()]);
      if (!alive) return;
      if (t.status === 'fulfilled') setTg(t.value);
      if (p.status === 'fulfilled') {
        const v = p.value;
        // Adopt the browser's timezone on first visit if still the UTC default.
        if (v.timezone === 'UTC') {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (tz && tz !== 'UTC') { v.timezone = tz; void api.notifications.setPreferences({ timezone: tz }).catch(() => {}); }
        }
        setPrefs(v);
        setDraft(pick(v));
        setGroupsDraft(v.groups ?? {});
      }
      if (w.status === 'fulfilled') { setWeekly(w.value); setWeeklyDraft(w.value.enabled); }
      if (p.status === 'rejected') setError('Could not load notification preferences.');
      else if (w.status === 'rejected') setError('Could not load your email preferences.');
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const changes = useMemo(() => {
    if (!prefs || !draft) return {} as Partial<Editable>;
    const out: Partial<Editable> = {};
    for (const k of KEYS) if (draft[k] !== prefs[k]) (out as Record<string, unknown>)[k] = draft[k];
    return out;
  }, [prefs, draft]);
  const weeklyChanged = !!weekly && weeklyDraft !== weekly.enabled;
  const groupsChanged = !!prefs && NOTIFICATION_GROUPS.some(g => (['email', 'push', 'telegram'] as const).some(ch => groupOn(groupsDraft, g, ch) !== groupOn(prefs.groups ?? {}, g, ch)));
  const dirty = Object.keys(changes).length > 0 || weeklyChanged || groupsChanged;
  const toggleGroup = (g: NotificationGroup, ch: NotificationChannel) => {
    setGroupsDraft(d => ({ ...d, [g]: { ...d[g], [ch]: !groupOn(d, g, ch) } }));
    setError('');
  };

  const set = <K extends keyof Editable>(k: K, v: Editable[K]) => { setDraft(d => (d ? { ...d, [k]: v } : d)); setError(''); };

  async function save() {
    if (!dirty || saving || !prefs) return;
    setSaving(true); setError('');
    try {
      // Push needs the browser's permission and a subscription before the server flag flips.
      if (changes.push === true) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') { setError(BLOCKED); return; }
        const res = prefs.vapidPublicKey ? await enablePush(prefs.vapidPublicKey) : { ok: false, reason: 'unavailable' };
        if (!res.ok) {
          setError(res.reason === 'denied' ? BLOCKED : res.reason === 'unsupported' ? 'This browser doesn’t support web push.' : 'Could not enable push on this device.');
          return;
        }
      } else if (changes.push === false) {
        await disablePush().catch(() => {});
      }
      if (Object.keys(changes).length || groupsChanged) {
        const updated = await api.notifications.setPreferences({ ...changes, ...(groupsChanged ? { groups: fullGroups(groupsDraft) } : {}) });
        setPrefs(updated); setDraft(pick(updated)); setGroupsDraft(updated.groups ?? {});
      }
      if (weeklyChanged) {
        const w = await api.ai.setWeeklyReview(weeklyDraft);
        setWeekly(w); setWeeklyDraft(w.enabled);
      }
      setSaved(true);
    } catch {
      setError('Could not save that. Please try again.');
      try { const p = await api.notifications.preferences(); setPrefs(p); } catch { /* keep the draft */ }
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (prefs) { setDraft(pick(prefs)); setGroupsDraft(prefs.groups ?? {}); }
    if (weekly) setWeeklyDraft(weekly.enabled);
    setError('');
  }

  return (
    <section className="x-card ac-st-card" id="notifications" data-testid="notification-settings" aria-labelledby="ac-st-al">
      <div className="x-ch">
        <h2 id="ac-st-al">Notifications</h2>
        <span className="x-sub">Events, news and the weekly review</span>
      </div>
      {loading ? (
        <div className="ac-st-sk">{[0, 1, 2, 3, 4].map(i => <i key={i} className="x-skel x-skel--in" />)}</div>
      ) : (
        <>
          {draft && prefs && (
            <div className="ac-st-grp">
              <h3>Channels</h3>
              <Row title="In-app" desc="Bell notifications inside TRADElogs"><Switch on={draft.inApp} onClick={() => set('inApp', !draft.inApp)} label="In-app alerts" /></Row>
              <Row title="Email digest" desc="One email a day with what’s coming up"><Switch on={draft.email} onClick={() => set('email', !draft.email)} label="Email digest" /></Row>
              {prefs.pushAvailable && (
                <Row title="Browser push" desc="Real-time alerts, even when the tab is closed"><Switch on={draft.push} onClick={() => set('push', !draft.push)} label="Push alerts" /></Row>
              )}
              {tg?.available && <TelegramRow status={tg} onChange={setTg} />}
              <Row title="Check delivery" desc="Sends one test to every channel that’s on, and says what arrived"><TestNotification /></Row>
            </div>
          )}
          {draft && prefs && (
            <div className="ac-st-grp" data-testid="notification-groups">
              <h3>By type</h3>
              <p className="ac-st-note">Turn a channel off for one kind of notification. Everything still lands in your <a className="x-link" href="/notifications">inbox</a>.</p>
              <div className="x-tblwrap">
                <table className="x-tbl ac-st-grid">
                  <thead><tr><th>Type</th><th className="c">Email</th>{prefs.pushAvailable && <th className="c">Push</th>}{tg?.linked && <th className="c">Telegram</th>}</tr></thead>
                  <tbody>
                    {NOTIFICATION_GROUPS.map(g => (
                      <tr key={g}>
                        <td><b>{NOTIFICATION_GROUP_LABELS[g].label}</b><span>{NOTIFICATION_GROUP_LABELS[g].hint}</span></td>
                        <td className="c"><Switch on={draft.email && groupOn(groupsDraft, g, 'email')} disabled={!draft.email} onClick={() => toggleGroup(g, 'email')} label={`${NOTIFICATION_GROUP_LABELS[g].label} by email`} testId={`group-${g}-email`} /></td>
                        {prefs.pushAvailable && <td className="c"><Switch on={draft.push && groupOn(groupsDraft, g, 'push')} disabled={!draft.push} onClick={() => toggleGroup(g, 'push')} label={`${NOTIFICATION_GROUP_LABELS[g].label} by push`} testId={`group-${g}-push`} /></td>}
                        {tg?.linked && <td className="c"><Switch on={groupOn(groupsDraft, g, 'telegram')} onClick={() => toggleGroup(g, 'telegram')} label={`${NOTIFICATION_GROUP_LABELS[g].label} on Telegram`} testId={`group-${g}-telegram`} /></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(!draft.email || (prefs.pushAvailable && !draft.push)) && <p className="ac-st-note x-dim">Columns are greyed out while that channel is off under Channels.</p>}
            </div>
          )}
          {weekly && (
            <div className="ac-st-grp">
              <h3>Weekly review email</h3>
              <Row title="Weekly review" desc={<>A short note every Saturday morning: what worked, what leaked, one thing to fix, written from your own closed trades. <span className="x-dim ac-st-meta">{weekly.enabled ? 'Sending weekly' : 'Not subscribed'} · {sentLabel(weekly.lastSentAt)}</span></>}>
                <Switch on={weeklyDraft} onClick={() => { setWeeklyDraft(v => !v); setError(''); }} disabled={saving} label="Weekly review email" testId="weekly-review-toggle" />
              </Row>
            </div>
          )}
          {draft && prefs && (
            <div className="ac-st-grp">
              <h3>What to alert on</h3>
              <Row title="Minimum impact" desc="Only alert for events at or above">
                <div className="x-seg x-seg--sm" role="group" aria-label="Minimum impact">
                  {IMPACTS.map(i => <button key={i} type="button" aria-pressed={draft.minImpact === i} onClick={() => set('minImpact', i)}>{IMP_LABEL[i]}</button>)}
                </div>
              </Row>
              <Row title="Lead time" desc="How early to warn before an event">
                <div className="ac-step">
                  <button type="button" onClick={() => set('leadMinutes', Math.max(0, draft.leadMinutes - 5))} aria-label="Less lead time" disabled={draft.leadMinutes <= 0}>−</button>
                  <b className="m">{draft.leadMinutes} min</b>
                  <button type="button" onClick={() => set('leadMinutes', Math.min(1440, draft.leadMinutes + 5))} aria-label="More lead time">+</button>
                </div>
              </Row>
              <Row title="High-impact news" desc="Breaking headlines for your markets"><Switch on={draft.newsAlerts} onClick={() => set('newsAlerts', !draft.newsAlerts)} label="News alerts" /></Row>
              <Row title="Price alerts" desc="From your chart alerts"><Switch on={draft.priceAlerts} onClick={() => set('priceAlerts', !draft.priceAlerts)} label="Price alerts" /></Row>
            </div>
          )}
          {error && <div className="x-banner x-banner--err ac-st-err" data-testid="settings-error" role="alert"><span>{error}</span></div>}
          {(draft || weekly) && (
            <footer className="ac-st-ft">
              <span className="ac-st-tz">{prefs ? `Times shown in ${prefs.timezone.replace(/_/g, ' ')}` : ''}</span>
              {saved && <span className="ac-st-saved" data-testid="settings-saved" role="status"><ICheck size={14} />Saved</span>}
              {dirty && !saving && <button type="button" className="x-btn x-btn--ghost" onClick={discard}>Discard</button>}
              <button type="button" className="x-btn x-btn--hi" onClick={() => void save()} disabled={!dirty || saving} data-testid="notifications-save">{saving ? 'Saving…' : 'Save changes'}</button>
            </footer>
          )}
        </>
      )}
    </section>
  );
}

/** A group's channel is on unless explicitly switched off. */
function groupOn(groups: NotificationGroupPrefs, g: NotificationGroup, ch: NotificationChannel): boolean {
  return groups[g]?.[ch] !== false;
}

/** Every group with both channels spelled out, so a save fully replaces the old overrides. */
function fullGroups(groups: NotificationGroupPrefs): NotificationGroupPrefs {
  return Object.fromEntries(NOTIFICATION_GROUPS.map(g => [g, { email: groupOn(groups, g, 'email'), push: groupOn(groups, g, 'push'), telegram: groupOn(groups, g, 'telegram') }]));
}

/**
 * Connect / disconnect Telegram. Connecting opens the bot with a one-time code
 * in a new tab (or the Telegram app on a phone); this row then checks every few
 * seconds, for as long as the code lasts, until the bot reports the link.
 */
function TelegramRow({ status, onChange }: { status: TelegramStatus; onChange: (s: TelegramStatus) => void }) {
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!waiting) return;
    const until = new Date(waiting).getTime();
    const t = setInterval(async () => {
      if (Date.now() > until) { setWaiting(null); return; }
      try {
        const s = await api.notifications.telegram();
        if (s.linked) { onChange(s); setWaiting(null); }
      } catch { /* keep trying until the code expires */ }
    }, 3000);
    return () => clearInterval(t);
  }, [waiting, onChange]);

  async function connect() {
    setBusy(true); setErr('');
    // Open the tab synchronously so pop-up blockers allow it, then point it at the bot.
    const tab = window.open('about:blank', '_blank');
    try {
      const l = await api.notifications.telegramLink();
      if (tab) tab.location.href = l.url; else window.location.href = l.url;
      setWaiting(l.expiresAt);
    } catch {
      tab?.close();
      setErr('Could not start the Telegram connection. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true); setErr('');
    try {
      await api.notifications.telegramUnlink();
      onChange({ ...status, linked: false, username: null, linkedAt: null });
    } catch {
      setErr('Could not disconnect. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const desc = status.linked
    ? <>Connected{status.username ? <> as <b className="m">@{status.username}</b></> : null}. Every alert type below can be turned off for Telegram.</>
    : waiting ? 'Waiting for Telegram: press Start in the chat that opened.' : 'Alerts in a Telegram chat with the TRADElogs bot';
  return (
    <Row title="Telegram" desc={<>{desc}{err && <span className="x-dim ac-st-meta" role="alert"> {err}</span>}</>}>
      {status.linked
        ? <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => void disconnect()} disabled={busy} data-testid="telegram-disconnect">Disconnect</button>
        : <button type="button" className="x-btn x-btn--sm" onClick={() => void connect()} disabled={busy} data-testid="telegram-connect">{waiting ? 'Open again' : 'Connect'}</button>}
    </Row>
  );
}

function pick(p: NotificationPrefs): Editable {
  return { inApp: p.inApp, email: p.email, push: p.push, minImpact: p.minImpact, leadMinutes: p.leadMinutes, newsAlerts: p.newsAlerts, priceAlerts: p.priceAlerts };
}

// ── Companion column ───────────────────────────────────────────────────────
const I = {
  push: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden><path d="M13 3L5 14h6l-1 7 8-11h-6z" /></svg>,
  mail: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></svg>,
  doc: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M6 3h9l3 3v15H6z" /><path d="M9 11h6M9 15h6" /></svg>,
};
const CHANNELS = [
  { icon: I.push, title: 'Real-time push', cadence: 'Instant', desc: 'Price alerts and high-impact events the moment they fire.' },
  { icon: I.mail, title: 'Email digest', cadence: 'Daily', desc: 'Tomorrow’s calendar and the headlines for your markets.' },
  { icon: I.doc, title: 'Weekly review', cadence: 'Saturday', desc: 'Your week in one note, written from your real trades.' },
];

export function SettingsAside() {
  return (
    <aside className="ac-st-aside" data-testid="settings-aside">
      <section className="x-card ac-st-card">
        <div className="x-ch"><h2>How alerts reach you</h2></div>
        <ul className="ac-st-ch">
          {CHANNELS.map(c => (
            <li key={c.title}>
              <span className="ac-st-ic">{c.icon}</span>
              <div><b>{c.title} <span className="x-tag">{c.cadence}</span></b><p>{c.desc}</p></div>
            </li>
          ))}
        </ul>
      </section>
      <section className="x-card ac-st-card ac-st-priv">
        <span className="ac-st-ic"><ILock size={16} /></span>
        <div><b>Your MT5 stays read-only</b><p>TRADElogs only reads your MT5 history; it never trades on your broker account. Exchange trading happens only on accounts you connect with trading keys.</p></div>
      </section>
    </aside>
  );
}
