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
import StatusCard, { SC_ICONS } from '@/components/v6/auth/status-card';
import { AuthError, AuthSubmit } from '@/components/v6/auth/auth-shell';
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
      <StatusCard icon={SC_ICONS.check} tone="g" kicker="Done" title="You’re unsubscribed"
        body="You won’t receive the weekly review any more. You can turn it back on any time in Settings.">
        <div className="au-stacts"><Link href="/settings" className="x-btn x-btn--lg x-btn--full">Open settings</Link></div>
      </StatusCard>
    );
  }
  if (!token) {
    return (
      <StatusCard icon={SC_ICONS.warn} tone="r" kicker="Link incomplete" title="This link is missing a token"
        body="Open the link directly from the email, or change the setting from your account.">
        <div className="au-stacts"><Link href="/settings" className="x-btn x-btn--lg x-btn--full">Go to settings</Link></div>
      </StatusCard>
    );
  }
  return (
    <StatusCard icon={SC_ICONS.mail} kicker="Weekly review" title="Stop the weekly review?"
      body="Confirm below and we’ll stop emailing your Saturday trading review. Nothing else about your account changes.">
      <form className="au-stacts" onSubmit={e => { e.preventDefault(); void confirm(); }}>
        {state === 'error' && <AuthError testId="unsubscribe-error">{message}</AuthError>}
        <AuthSubmit loading={state === 'working'} testId="unsubscribe-confirm">{state === 'working' ? 'Unsubscribing…' : 'Unsubscribe me'}</AuthSubmit>
        <Link href="/dashboard" className="x-btn x-btn--lg x-btn--full x-btn--ghost">Keep it and go back to TRADElogs</Link>
      </form>
    </StatusCard>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<LoadingScreen label="Loading" />}>
      <UnsubscribeInner />
    </Suspense>
  );
}
