'use client';

// Settings. Currently one section — the weekly AI review email, which is opt-in:
// nothing is sent until the trader turns it on here.
import { useCallback, useEffect, useState } from 'react';
import { EnvelopeSimple, Check } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { api, type BrokerAccount } from '@/lib/api';

function sentLabel(iso: string | null): string {
  if (!iso) return 'Never sent';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Never sent';
  return `Last sent ${d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}`;
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
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="Settings"
      pageSubtitle="// PREFERENCES"
    >
      <div className="p-3 sm:p-4 lg:p-6 max-w-2xl" data-testid="settings-page">
        <div className="tcard p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-profit/12 ring-1 ring-profit/20 shrink-0">
              <EnvelopeSimple size={16} weight="fill" className="text-profit" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Email</div>
              <div className="font-display font-bold text-[16px] tracking-tight mt-0.5">Weekly review</div>
            </div>
          </div>

          <p className="text-fg-2 text-[13px] leading-relaxed mt-4">
            Every Saturday morning, the coach writes a short review of each account you&apos;ve
            connected — what worked, what leaked, and what to focus on — and emails it to you.
            It&apos;s built from your own closed trades. Off by default; you can turn it off again
            any time, and every email carries an unsubscribe link.
          </p>

          <div className="flex items-center justify-between gap-4 mt-5 pt-5 border-t border-border-soft">
            <div className="min-w-0">
              <div className="text-[13px] text-fg">{enabled ? 'Sending weekly' : 'Not subscribed'}</div>
              <div className="text-[10px] tracking-[0.14em] uppercase text-fg-3 mt-1">
                {loading ? 'Loading…' : sentLabel(lastSentAt)}
              </div>
            </div>

            <button
              role="switch"
              aria-checked={enabled}
              aria-label="Weekly review email"
              onClick={toggle}
              disabled={loading || saving}
              data-testid="weekly-review-toggle"
              className={`relative shrink-0 h-6 w-11 rounded-full border transition-colors disabled:opacity-50 ${
                enabled ? 'bg-profit/30 border-profit/50' : 'bg-surface border-border-strong'
              }`}
            >
              <span
                className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full transition-all ${
                  enabled ? 'left-[calc(100%-1.25rem)] bg-profit' : 'left-1 bg-fg-3'
                }`}
              />
            </button>
          </div>

          {saved && (
            <p className="flex items-center gap-1.5 text-[11px] text-profit mt-3" data-testid="settings-saved">
              <Check size={12} weight="bold" /> Saved
            </p>
          )}
          {error && (
            <p className="text-[11px] text-loss mt-3" data-testid="settings-error">
              {error}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
