'use client';

// Guard for the public auth pages (login / signup): if a valid session already
// exists, bounce the user to /brokers (the post-auth landing page — from there
// the broker-gate lets them through to the rest of the app). Mirrors the
// inverse guard in app-shell.tsx (which sends unauthenticated users to /login).

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export function useRedirectIfAuthed(to = '/brokers') {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && session?.session) router.replace(to);
  }, [isPending, session, router, to]);

  // Callers can use this to hide their form until the check resolves.
  return { checking: isPending || !!session?.session };
}
