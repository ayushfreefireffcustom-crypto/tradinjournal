'use client';

import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';

/** True once mounted with a live session (false during SSR, so markup matches). */
export function useSignedIn() {
  const { data: session } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted && !!session?.session;
}
