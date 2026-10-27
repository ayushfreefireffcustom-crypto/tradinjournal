'use client';

// Guard for the public auth pages (login / signup): if a valid session already
// exists, bounce the user to the dashboard. Users with zero brokers are then
// bounced on to /brokers by the app-wide broker gate (see use-accounts.ts), so
// returning users land on their dashboard while new users land on Brokers.
// Mirrors the inverse guard in app-shell.tsx (unauthenticated → /login).

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

/** Where to land after auth: the `?next=` the app shell sent us with, if it's a
 *  same-site path (never an absolute or protocol-relative URL), else `fallback`. */
export function safeNext(fallback = '/dashboard'): string {
  if (typeof window === 'undefined') return fallback;
  const n = new URLSearchParams(window.location.search).get('next');
  return n && n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/login') ? n : fallback;
}

export function useRedirectIfAuthed(fallback = '/dashboard') {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    // Mock mode is always signed in; `?stay` lets designers preview auth pages.
    if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true' && window.location.search.includes('stay')) return;
    if (!isPending && session?.session) router.replace(safeNext(fallback));
  }, [isPending, session, router, fallback]);

  // Callers can use this to hide their form until the check resolves.
  return { checking: isPending || !!session?.session };
}
