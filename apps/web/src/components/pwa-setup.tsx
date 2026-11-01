'use client';

// PWA setup (H14): registers the service worker (offline page for the
// installed app; web push uses the same worker) and keeps the browser's
// install prompt, which fires once and early, for the Settings card.
// The worker is skipped in development so hot reload never fights a cache.
import { useEffect } from 'react';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
declare global { interface Window { __tlInstall?: InstallPrompt | null } }

export default function PwaSetup() {
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); window.__tlInstall = e as InstallPrompt; window.dispatchEvent(new Event('tl-install-ready')); };
    const onInstalled = () => { window.__tlInstall = null; window.dispatchEvent(new Event('tl-install-ready')); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);
  return null;
}

/** Show the browser's install dialog if it offered one. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const p = window.__tlInstall;
  if (!p) return 'unavailable';
  await p.prompt();
  const { outcome } = await p.userChoice;
  window.__tlInstall = null;
  return outcome;
}
