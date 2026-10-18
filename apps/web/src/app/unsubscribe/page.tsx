'use client';

// Public unsubscribe landing page, reached from a link in the weekly review email.
// No session required — the token in the URL is the credential.
//
// The unsubscribe only happens on an explicit click, never on page load: mail
// clients and security scanners routinely prefetch links, and an automatic
// unsubscribe would silently opt people out of mail they still wanted.
import { Suspense, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import StatusCard, { SC_ICONS } from '@/components/v3/status-card';
import { AuthSubmit } from '@/components/v3/auth-shell';
import { LoadingScreen } from '@/components/loader';
import { api } from '@/lib/api';

type State = 'idle' | 'working' | 'done' | 'error';

function UnsubscribeInner() {
  const token = useSearchParams().get('token') ?? '';
  const [state, setState] = useState<State>('idle');
  const [message, setMessage] = useState('');

  const confirm = useCallback(async () => {
    if (!token || state === 'working') return;
    setState('working');
    try {
      await api.ai.unsubscribeWeeklyReview(token);
      setState('done');
    } catch (err) {
      setMessage((err as Error).message || 'That link is no longer valid.');
      setState('error');
    }
  }, [token, state]);

  if (state === 'done') {
    return (
      <StatusCard icon={SC_ICONS.check} tone="g" kicker="Done" title={<><b>You’re</b> <em>unsubscribed.</em></>}
        body="You won’t receive the weekly review any more. You can turn it back on any time in Settings.">
        <div className="sc-actions"><Link href="/settings" className="sc-ghost">Open settings</Link></div>
      </StatusCard>
    );
  }
  if (!token) {
    return (
      <StatusCard icon={SC_ICONS.warn} tone="r" kicker="Link incomplete" title={<><b>This link is</b> <em>missing a token.</em></>}
        body="Open the link directly from the email, or change the setting from your account.">
        <div className="sc-actions"><Link href="/settings" className="sc-ghost">Go to settings</Link></div>
      </StatusCard>
    );
  }
  return (
    <StatusCard icon={SC_ICONS.mail} tone="v" kicker="Weekly review" title={<><b>Stop the weekly</b> <em>review?</em></>}
      body="Confirm below and we’ll stop emailing your Saturday trading review. Nothing else about your account changes.">
      <form className="sc-actions" onSubmit={e => { e.preventDefault(); void confirm(); }}>
        <AuthSubmit loading={state === 'working'} testId="unsubscribe-confirm">{state === 'working' ? 'Unsubscribing…' : 'Unsubscribe me'}</AuthSubmit>
        {state === 'error' && <div className="au-err" data-testid="unsubscribe-error" role="alert">{message}</div>}
        <Link href="/dashboard" className="sc-ghost">Keep it — back to TRADElogs</Link>
      </form>
    </StatusCard>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="h-dvh"><LoadingScreen label="Loading" /></div>}>
      <UnsubscribeInner />
    </Suspense>
  );
}
