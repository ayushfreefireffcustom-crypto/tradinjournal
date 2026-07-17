'use client';

// Guard for the public auth pages (login / signup): if a valid session already
// exists, bounce the user to the dashboard. Users with zero brokers are then
// bounced on to /brokers by the app-wide broker gate (see use-accounts.ts), so
// returning users land on their dashboard while new users land on Brokers.
// Mirrors the inverse guard in app-shell.tsx (unauthenticated → /login).

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function useRedirectIfAuthed(to = '/dashboard') {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && session?.session) router.replace(to);
  }, [isPending, session, router, to]);

  // Callers can use this to hide their form until the check resolves.
  return { checking: isPending || !!session?.session };
}
