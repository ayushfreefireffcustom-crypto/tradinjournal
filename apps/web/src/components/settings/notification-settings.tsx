'use client';

// Notification preferences: which channels, what impact threshold, how much lead
// time, and whether to get high-impact news alerts. Saves optimistically. The
// browser-push opt-in is added in the push phase and only shows when the server
// reports push is configured.
import { useCallback, useEffect, useState } from 'react';
import Toggle from '@/components/v3/toggle';
import { api, type NotificationPrefs, type EventImpact } from '@/lib/api';
import { enablePush, disablePush } from '@/lib/push-client';

const IMPACTS: EventImpact[] = ['LOW', 'MEDIUM', 'HIGH'];

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="st-row">
      <div><b>{title}</b>{desc && <span>{desc}</span>}</div>
      {children}
    </div>
  );
}

export default function NotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = await api.notifications.preferences();
        if (!alive) return;
        // Adopt the browser's timezone on first visit if still the UTC default.
        if (p.timezone === 'UTC') {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (tz && tz !== 'UTC') { p.timezone = tz; void api.notifications.setPreferences({ timezone: tz }).catch(() => {}); }
        }
        setPrefs(p);
      } catch {
        if (alive) setError('Could not load notification preferences.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 1800);
    return () => clearTimeout(t);
  }, [saved]);

  const patch = useCallback(async (change: Partial<NotificationPrefs>) => {
    setPrefs(prev => (prev ? { ...prev, ...change } : prev));
    setError('');
    try {
      const updated = await api.notifications.setPreferences(change);
      setPrefs(updated);
      setSaved(true);
    } catch {
      setError('Could not save. Please try again.');
      try { setPrefs(await api.notifications.preferences()); } catch { /* ignore */ }
    }
  }, []);

  const IMP_LABEL: Record<EventImpact, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
  return (
    <section className="v3-card st-card" data-testid="notification-settings" aria-labelledby="st-al">
      <div className="st-hd"><h3 id="st-al">Alerts <span>· event &amp; news notifications</span></h3>{saved && <span className="st-saved">Saved ✓</span>}</div>
      {loading ? (
        <div style={{ display: 'grid', gap: 10, padding: '6px 0 4px' }}>{[0, 1, 2, 3].map(i => <div key={i} className="skel d-sk" style={{ height: 44 }} />)}</div>
      ) : prefs ? (
        <>
          <Row title="In-app" desc="Bell notifications inside TRADElogs"><Toggle on={prefs.inApp} onClick={() => patch({ inApp: !prefs.inApp })} label="In-app alerts" /></Row>
          <Row title="Email digest" desc="One email a day with what’s coming up"><Toggle on={prefs.email} onClick={() => patch({ email: !prefs.email })} label="Email digest" /></Row>
          {prefs.pushAvailable && (
            <Row title="Browser push" desc="Real-time alerts, even when the tab is closed">
              <Toggle on={prefs.push} label="Push alerts" onClick={async () => {
                if (!prefs.push) {
                  if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
                    setError('Notifications are blocked for this site. Click the site icon at the left of the address bar → Notifications → Allow, then toggle again. (In Brave, also turn on brave://settings/privacy → “Use Google services for push messaging”.)');
                    return;
                  }
                  const res = prefs.vapidPublicKey ? await enablePush(prefs.vapidPublicKey) : { ok: false, reason: 'unavailable' };
                  if (!res.ok) {
                    setError(res.reason === 'denied' ? 'Notifications are blocked for this site. Allow them via the site icon in the address bar → Notifications → Allow, then try again.'
                      : res.reason === 'unsupported' ? 'This browser doesn’t support web push.' : 'Could not enable push on this device.');
                    return;
                  }
                  void patch({ push: true });
                } else {
                  await disablePush().catch(() => {});
                  void patch({ push: false });
                }
              }} />
            </Row>
          )}
          <Row title="Minimum impact" desc="Only alert for events at or above">
            <div className="v3-seg" role="group" aria-label="Minimum impact">{IMPACTS.map(i => <button key={i} aria-pressed={prefs.minImpact === i} onClick={() => patch({ minImpact: i })}>{IMP_LABEL[i]}</button>)}</div>
          </Row>
          <Row title="Lead time" desc="How early to warn before an event">
            <div className="st-step">
              <button onClick={() => patch({ leadMinutes: Math.max(0, prefs.leadMinutes - 5) })} aria-label="Less lead time" disabled={prefs.leadMinutes <= 0}>−</button>
              <b className="num">{prefs.leadMinutes} min</b>
              <button onClick={() => patch({ leadMinutes: Math.min(1440, prefs.leadMinutes + 5) })} aria-label="More lead time">+</button>
            </div>
          </Row>
          <Row title="High-impact news alerts" desc="Breaking headlines for your markets"><Toggle on={prefs.newsAlerts} onClick={() => patch({ newsAlerts: !prefs.newsAlerts })} label="News alerts" /></Row>
          <Row title="Price alerts" desc="From your chart alerts"><Toggle on={prefs.priceAlerts} onClick={() => patch({ priceAlerts: !prefs.priceAlerts })} label="Price alerts" /></Row>
          <p className="st-foot">Times shown in {prefs.timezone.replace(/_/g, ' ')}</p>
          {error && <p className="r-err" role="alert">{error}</p>}
        </>
      ) : <p className="r-err">{error}</p>}
    </section>
  );
}
