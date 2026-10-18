'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || '';
const INTERVAL_MS = 30_000;

function featureFromPath(path: string): string {
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/charts')) return 'charts';
  if (path.startsWith('/macro')) return 'macro';
  if (path.startsWith('/coach')) return 'coach';
  if (path.startsWith('/notebook') || path.startsWith('/journal')) return 'journal';
  if (path.startsWith('/trades') || path.startsWith('/analytics')) return 'trades';
  if (path.startsWith('/dashboard')) return 'dashboard';
  if (path.startsWith('/brokers')) return 'brokers';
  if (path.startsWith('/trader')) return 'trader';
  if (path.startsWith('/markets') || path.startsWith('/calendar')) return 'markets';
  return 'other';
}

async function sendHeartbeat(path: string, ended = false) {
  if (process.env.NEXT_PUBLIC_USE_MOCKS === 'true') return; // no usage API in mock mode
  try {
    await fetch(`${API}/api/usage/heartbeat`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        feature: featureFromPath(path),
        ended,
      }),
      keepalive: ended,
    });
  } catch {
    // Non-blocking — analytics must never break the app
  }
}

/** Visibility-aware product usage tracker. Mount once inside authenticated AppShell. */
export function UsageTracker() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
    if (document.visibilityState === 'visible') {
      void sendHeartbeat(pathname, false);
    }
  }, [pathname]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') {
        void sendHeartbeat(pathRef.current, false);
      }
    };
    const id = window.setInterval(tick, INTERVAL_MS);

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        void sendHeartbeat(pathRef.current, true);
      } else {
        void sendHeartbeat(pathRef.current, false);
      }
    };
    const onUnload = () => {
      void sendHeartbeat(pathRef.current, true);
    };

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onUnload);

    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onUnload);
    };
  }, []);

  return null;
}
