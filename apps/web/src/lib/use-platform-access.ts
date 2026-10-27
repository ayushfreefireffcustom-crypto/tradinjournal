'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { accessApi, type AccessStatusDto } from '@/lib/access-api';

// /partner: partners needn't be active traders — the API serves their portal
// without the trading gate, so the page mustn't bounce them to /access either.
const SKIP_PATHS = ['/access/', '/maintenance', '/admin', '/partner', '/brokers', '/notebook'];

/** Survives AppShell remounts between Next.js pages — without this, every
 *  sidebar click re-runs a multi-second access check and blanks the UI. */
let memoryCache: { status: AccessStatusDto; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidateAccessCache(): void {
  memoryCache = null;
}

export function primeAccessCache(status: AccessStatusDto): void {
  writeCache(status);
}

export function peekAccessCache(): AccessStatusDto | null {
  if (!memoryCache) return null;
  if (Date.now() - memoryCache.at > CACHE_TTL_MS) return null;
  return memoryCache.status;
}

function writeCache(status: AccessStatusDto): void {
  memoryCache = { status, at: Date.now() };
}

function isSkipPath(pathname: string): boolean {
  return SKIP_PATHS.some(p => pathname.startsWith(p));
}

async function fetchStatusWithRetry(): Promise<AccessStatusDto> {
  try {
    return await accessApi.status();
  } catch {
    await new Promise(r => setTimeout(r, 400));
    return accessApi.status();
  }
}

function redirectForStatus(
  s: AccessStatusDto,
  router: { replace: (href: string) => void },
): void {
  if (s.status === 'MAINTENANCE' && !s.isAdmin) {
    router.replace('/maintenance');
    return;
  }
  if (s.status === 'ELEFIN_REQUIRED') {
    router.replace('/access/elefin');
    return;
  }
  if (s.status === 'INACTIVE') {
    router.replace('/access/inactive');
  }
}

export function usePlatformAccess() {
  const pathname = usePathname();
  const router = useRouter();
  const skip = isSkipPath(pathname);

  // Seed from cache synchronously so we NEVER show a spinner if a valid
  // cache entry exists — this is what prevents the nav flash.
  const cached = peekAccessCache();
  const [status, setStatus] = useState<AccessStatusDto | null>(() => cached);
  // loading is only true when we genuinely need to hit the network.
  const [loading, setLoading] = useState(() => !cached && !skip);
  const [blocked, setBlocked] = useState(false);

  // Track whether we've ever completed a fetch so we don't re-show the
  // loading screen on subsequent route changes once resolved.
  const resolvedRef = useRef(!!cached || skip);

  useEffect(() => {
    if (skip) {
      setLoading(false);
      setBlocked(false);
      // Never gate or redirect here, but still learn the role flags quietly so
      // the sidebar can show the Admin / Partner sections on these pages too.
      if (peekAccessCache()) { setStatus(peekAccessCache()); return; }
      let cancelled = false;
      accessApi.status().then(s => { if (!cancelled) { writeCache(s); setStatus(s); } }).catch(() => {});
      return () => { cancelled = true; };
    }

    const fresh = peekAccessCache();
    if (fresh) {
      // Cache hit — update state if stale in component but don't flash.
      setStatus(fresh);
      setBlocked(false);
      // Only set loading false if it was somehow still true.
      if (!resolvedRef.current) {
        resolvedRef.current = true;
        setLoading(false);
      }
      redirectForStatus(fresh, router);
      return;
    }

    // Cache miss — need a real fetch. Only show the spinner on the FIRST
    // unresolved fetch; subsequent navigations keep the shell mounted.
    if (!resolvedRef.current) {
      setLoading(true);
    }

    let cancelled = false;
    fetchStatusWithRetry()
      .then(s => {
        if (cancelled) return;
        writeCache(s);
        setStatus(s);
        setBlocked(false);
        resolvedRef.current = true;
        redirectForStatus(s, router);
      })
      .catch(() => {
        if (cancelled) return;
        setBlocked(true);
        resolvedRef.current = true;
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
    // Intentionally exclude pathname — cache TTL handles refresh timing.
    // Re-running on every nav was the root cause of the flash bug.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, skip]);

  return { status, loading, blocked };
}

/** Call before entering the terminal; throws with ACCESS_INACTIVE on failure. */
export async function ensureActiveTrader(): Promise<AccessStatusDto> {
  const s = await accessApi.status();
  writeCache(s);
  if (s.status === 'FULL_ACCESS') return s;
  if (s.status === 'ELEFIN_REQUIRED') throw Object.assign(new Error('Elefin verification required'), { code: 'ACCESS_ELEFIN_REQUIRED' });
  const activity = await accessApi.checkActivity();
  if (!activity.active) {
    throw Object.assign(
      new Error(
        `Need ${activity.minTradesRequired} closed Elefin trades in the last ${activity.activityWindowDays} days. You have ${activity.tradeCount7d}.`,
      ),
      { code: 'ACCESS_INACTIVE', tradeCount7d: activity.tradeCount7d },
    );
  }
  const next = await accessApi.status();
  writeCache(next);
  return next;
}
