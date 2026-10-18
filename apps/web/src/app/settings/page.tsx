'use client';

// Settings. Currently one section — the weekly AI review email, which is opt-in:
// nothing is sent until the trader turns it on here.
import { useCallback, useEffect, useState } from 'react';
import Toggle from '@/components/v3/toggle';
import AppShell from '@/components/app-shell';
import NotificationSettings from '@/components/settings/notification-settings';
import ProfileCard from '@/components/settings/profile-card';
import SettingsAside from '@/components/settings/settings-aside';
import { useAccounts } from '@/lib/use-accounts';
import { api, type BrokerAccount } from '@/lib/api';

function sentLabel(iso: string | null): string {
  if (!iso) return 'Never sent';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never sent';
  return `Last sent ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export default function SettingsPage() {
  const { accounts, selected, select } = useAccounts();
  const [enabled, setEnabled] = useState(false);
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pref = await api.ai.weeklyReview();
        if (!alive) return;
        setEnabled(pref.enabled);
        setLastSentAt(pref.lastSentAt);
      } catch {
        if (alive) setError('Could not load your email preferences.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [saved]);

  const toggle = useCallback(async () => {
    if (saving || loading) return;
    const next = !enabled;
    setSaving(true);
    setError('');
    // Optimistic: the switch moves immediately and reverts if the save fails.
    setEnabled(next);
    try {
      const pref = await api.ai.setWeeklyReview(next);
      setEnabled(pref.enabled);
      setLastSentAt(pref.lastSentAt);
      setSaved(true);
    } catch {
      setEnabled(!next);
      setError('Could not save that. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [enabled, saving, loading]);

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)} crumbParent="Account" pageTitle="Settings">
      <div className="v3-page" data-testid="settings-page">
        <ProfileCard accountCount={accounts.length} />
        <div className="st-grid">
          <div className="st-main">
            <NotificationSettings />
            <section className="v3-card st-card st-wr" aria-labelledby="st-wr">
              <div className="st-wr-top">
                <span className="ic"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7l8.5 6 8.5-6" /></svg></span>
                <div><h3 id="st-wr">Weekly review</h3><p>A short note every Saturday morning: what worked, what leaked, one thing to fix — written from your own closed trades. Every email carries an unsubscribe link.</p></div>
                <Toggle on={enabled} onClick={toggle} disabled={loading || saving} label="Weekly review email" testId="weekly-review-toggle" />
              </div>
              <div className="st-wr-ft">
                <span className={enabled ? 'on' : ''}><i />{enabled ? 'Sending weekly' : 'Not subscribed'}</span>
                <span className="mute">{loading ? 'Loading…' : sentLabel(lastSentAt)}</span>
                {saved && <span className="st-saved" data-testid="settings-saved">Saved ✓</span>}
              </div>
              {error && <p className="r-err" data-testid="settings-error" role="alert">{error}</p>}
            </section>
          </div>
          <SettingsAside />
        </div>
      </div>
    </AppShell>
  );
}
