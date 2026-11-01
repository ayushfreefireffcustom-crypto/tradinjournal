'use client';

// Settings › Notifications › Send a test (QW.15). The server says what each
// channel did; whether this device showed the push only this browser knows,
// so we wait for the service worker to report it and say so plainly if not.
import { useState } from 'react';
import { api } from '@/lib/api';

type Outcome = { tone: 'ok' | 'warn'; lines: string[] };

/** Why this device might not show a push, best guess from what the browser tells us. */
async function deviceIssue(): Promise<string | null> {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'this browser can’t show push notifications';
  if (Notification.permission === 'denied') return 'notifications are blocked for this site in the browser’s settings';
  if (Notification.permission !== 'granted') return 'this browser hasn’t been allowed to show notifications yet (turn on Browser push above)';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (!sub) return 'push isn’t switched on for this device (turn on Browser push above)';
  return null;
}

export default function TestNotification() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Outcome | null>(null);

  async function run() {
    setBusy(true);
    setOut(null);
    // Listen before sending, so a fast push isn't missed.
    let seen = false;
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'tl-test-push') seen = true; };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    try {
      const r = await api.notifications.test();
      const lines: string[] = [];
      let tone: Outcome['tone'] = 'ok';
      if (!r.push.available) lines.push('Push isn’t set up on this server, so nothing was pushed.');
      else if (r.push.devices === 0) { lines.push('No device has push turned on yet.'); tone = 'warn'; }
      else {
        lines.push(`Pushed to ${r.push.sent} of ${r.push.devices} device${r.push.devices === 1 ? '' : 's'}${r.push.removed ? ` (${r.push.removed} no longer reachable, removed)` : ''}.`);
        // Give the push a few seconds to arrive here.
        for (let i = 0; i < 12 && !seen; i++) await new Promise(res => setTimeout(res, 500));
        if (seen) lines.push('This device showed it.');
        else {
          tone = 'warn';
          const why = await deviceIssue();
          lines.push(`This device didn’t show it${why ? `: ${why}.` : '. Check that do-not-disturb or focus mode isn’t hiding notifications.'}`);
        }
      }
      if (r.telegram === 'sent') lines.push('Sent to your Telegram chat.');
      else if (r.telegram === 'failed') { lines.push('Telegram didn’t take it; try unlinking and linking the chat again.'); tone = 'warn'; }
      setOut({ tone, lines });
    } catch (e) {
      setOut({ tone: 'warn', lines: [e instanceof Error ? e.message : 'Couldn’t send the test.'] });
    } finally {
      navigator.serviceWorker?.removeEventListener('message', onMsg);
      setBusy(false);
    }
  }

  return (
    <div className="ac-test" data-testid="notification-test">
      <button type="button" className="x-btn x-btn--sm" onClick={run} disabled={busy} aria-busy={busy} data-testid="notification-test-send">{busy ? 'Sending…' : 'Send a test'}</button>
      {out && (
        <p className={`ac-test-out ${out.tone === 'warn' ? 'is-warn' : ''}`} role="status" data-testid="notification-test-result">{out.lines.join(' ')}</p>
      )}
    </div>
  );
}
