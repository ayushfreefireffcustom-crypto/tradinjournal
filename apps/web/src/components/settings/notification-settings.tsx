'use client';

// Notification preferences: which channels, what impact threshold, how much lead
// time, and whether to get high-impact news alerts. Saves optimistically. The
// browser-push opt-in is added in the push phase and only shows when the server
// reports push is configured.
import { useCallback, useEffect, useState } from 'react';
import { BellRinging, Check } from '@phosphor-icons/react';
import { api, type NotificationPrefs, type EventImpact } from '@/lib/api';

const IMPACTS: EventImpact[] = ['LOW', 'MEDIUM', 'HIGH'];

function Toggle({ on, onClick, disabled, label }: { on: boolean; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`relative shrink-0 h-6 w-11 rounded-full border transition-colors disabled:opacity-50 ${
        on ? 'bg-profit/30 border-profit/50' : 'bg-surface border-border-strong'
      }`}
    >
      <span className={`absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full transition-all ${on ? 'left-[calc(100%-1.25rem)] bg-profit' : 'left-1 bg-fg-3'}`} />
    </button>
  );
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-border-soft first:border-t-0">
      <div className="min-w-0">
        <div className="text-[13px] text-fg">{title}</div>
        {desc && <div className="text-[11px] text-fg-3 mt-0.5 leading-snug">{desc}</div>}
      </div>
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

  return (
    <div className="tcard p-5" data-testid="notification-settings">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-profit/12 ring-1 ring-profit/20 shrink-0">
          <BellRinging size={16} weight="fill" className="text-profit" />
        </span>
        <div>
          <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Alerts</div>
          <div className="font-display font-bold text-[16px] tracking-tight mt-0.5">Event & news notifications</div>
        </div>
      </div>

      <p className="text-fg-2 text-[13px] leading-relaxed mt-4">
        Get reminded before high-impact economic events and (optionally) when market-moving news breaks.
        In-app alerts show in the bell; email uses your account address.
      </p>

      {loading ? (
        <div className="mt-4 flex flex-col gap-2">{[0, 1, 2].map(i => <div key={i} className="shimmer h-8" />)}</div>
      ) : prefs ? (
        <div className="mt-4">
          <Row title="In-app" desc="Show alerts in the notification bell.">
            <Toggle on={prefs.inApp} onClick={() => patch({ inApp: !prefs.inApp })} label="In-app alerts" />
          </Row>
          <Row title="Email" desc="Send event reminders to your account email.">
            <Toggle on={prefs.email} onClick={() => patch({ email: !prefs.email })} label="Email alerts" />
          </Row>
          {prefs.pushAvailable && (
            <Row title="Browser push" desc="Push notifications even when the tab is closed.">
              <Toggle on={prefs.push} onClick={() => patch({ push: !prefs.push })} label="Push alerts" />
            </Row>
          )}
          <Row title="Minimum impact" desc="Only remind me for events at or above this level.">
            <div className="inline-flex rounded-[var(--radius-btn)] border border-border-soft overflow-hidden">
              {IMPACTS.map(i => (
                <button
                  key={i}
                  onClick={() => patch({ minImpact: i })}
                  className={`px-2.5 py-1.5 text-[10px] tracking-[0.12em] uppercase transition-colors ${
                    prefs.minImpact === i ? 'bg-profit/15 text-fg' : 'text-fg-3 hover:text-fg'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </Row>
          <Row title="Lead time" desc="How long before an event to remind you.">
            <div className="inline-flex items-center gap-2">
              <button onClick={() => patch({ leadMinutes: Math.max(0, prefs.leadMinutes - 5) })} className="w-7 h-7 rounded-[var(--radius-btn)] border border-border-soft text-fg-2 hover:text-fg">−</button>
              <span className="text-[12px] text-fg w-14 text-center numeric">{prefs.leadMinutes} min</span>
              <button onClick={() => patch({ leadMinutes: Math.min(1440, prefs.leadMinutes + 5) })} className="w-7 h-7 rounded-[var(--radius-btn)] border border-border-soft text-fg-2 hover:text-fg">+</button>
            </div>
          </Row>
          <Row title="High-impact news alerts" desc="Notify me when market-moving news breaks.">
            <Toggle on={prefs.newsAlerts} onClick={() => patch({ newsAlerts: !prefs.newsAlerts })} label="News alerts" />
          </Row>

          <p className="text-[10px] tracking-[0.14em] uppercase text-fg-3 mt-3">Timezone · {prefs.timezone}</p>
          {saved && <p className="flex items-center gap-1.5 text-[11px] text-profit mt-2"><Check size={12} weight="bold" /> Saved</p>}
          {error && <p className="text-[11px] text-loss mt-2">{error}</p>}
        </div>
      ) : (
        <p className="text-[12px] text-loss mt-4">{error}</p>
      )}
    </div>
  );
}
