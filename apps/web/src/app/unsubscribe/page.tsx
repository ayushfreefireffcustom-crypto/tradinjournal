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
import { EnvelopeSimple, Check, Warning } from '@phosphor-icons/react';
import Logo from '@/components/logo';
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

  return (
    <main className="min-h-screen bg-app flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8">
          <Logo height={34} />
        </div>

        <div className="tcard p-7 text-center">
          {state === 'done' ? (
            <>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-profit/12 ring-1 ring-profit/20 mb-4">
                <Check size={20} weight="bold" className="text-profit" />
              </span>
              <h1 className="font-display font-bold text-[18px] tracking-tight">You&apos;re unsubscribed</h1>
              <p className="text-fg-2 text-[13px] leading-relaxed mt-2">
                You won&apos;t receive the weekly review any more. You can turn it back on
                any time in Settings.
              </p>
            </>
          ) : !token ? (
            <>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-loss/12 ring-1 ring-loss/20 mb-4">
                <Warning size={20} weight="bold" className="text-loss" />
              </span>
              <h1 className="font-display font-bold text-[18px] tracking-tight">Link incomplete</h1>
              <p className="text-fg-2 text-[13px] leading-relaxed mt-2">
                This unsubscribe link is missing its token. Open the link directly from the
                email, or change the setting from your account.
              </p>
            </>
          ) : (
            <>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-profit/12 ring-1 ring-profit/20 mb-4">
                <EnvelopeSimple size={20} weight="fill" className="text-profit" />
              </span>
              <h1 className="font-display font-bold text-[18px] tracking-tight">
                Stop the weekly review?
              </h1>
              <p className="text-fg-2 text-[13px] leading-relaxed mt-2">
                Confirm below and we&apos;ll stop emailing you your Saturday trading review.
                Nothing else about your account changes.
              </p>
              <button
                onClick={confirm}
                disabled={state === 'working'}
                data-testid="unsubscribe-confirm"
                className="btn btn-primary w-full justify-center mt-6 disabled:opacity-60"
              >
                {state === 'working' ? 'Unsubscribing…' : 'Unsubscribe me'}
              </button>
              {state === 'error' && (
                <p className="text-[11px] text-loss mt-3" data-testid="unsubscribe-error">
                  {message}
                </p>
              )}
            </>
          )}

          <Link
            href="/dashboard"
            className="inline-block text-[11px] tracking-[0.16em] uppercase text-fg-3 hover:text-fg transition-colors mt-6"
          >
            Back to TRADElogs
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="h-dvh bg-app"><LoadingScreen label="Loading" /></div>}>
      <UnsubscribeInner />
    </Suspense>
  );
}
