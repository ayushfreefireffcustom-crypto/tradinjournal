'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { accessApi } from '@/lib/access-api';
import { primeAccessCache } from '@/lib/use-platform-access';

export function useTerminalEntry() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [checking, setChecking] = useState(false);

  async function enterTerminal(href = '/dashboard') {
    setChecking(true);
    try {
      const status = await accessApi.status();
      if (status.status === 'MAINTENANCE' && !status.isAdmin) {
        router.push('/maintenance');
        return;
      }
      if (status.status === 'ELEFIN_REQUIRED') {
        router.push('/access/elefin');
        return;
      }
      if (status.status === 'FULL_ACCESS') {
        primeAccessCache(status);
        router.push(href);
        return;
      }
      try {
        const activity = await accessApi.checkActivity();
        if (activity.active) {
          const next = await accessApi.status();
          primeAccessCache(next);
          router.push(href);
          return;
        }
        const min = activity.minTradesRequired ?? status.minTradesRequired;
        const days = activity.activityWindowDays ?? status.activityWindowDays;
        setModalMessage(
          `You need at least ${min} closed trades on your Elefin account in the last ${days} days to access TradeLogs. You have ${activity.tradeCount7d}.`,
        );
        setModalOpen(true);
      } catch (err) {
        const e = err as Error & { code?: string };
        const min = status.minTradesRequired;
        const days = status.activityWindowDays;
        setModalMessage(
          e.message ||
            `You need at least ${min} closed trades on your Elefin account in the last ${days} days to access TradeLogs.`,
        );
        setModalOpen(true);
      }
    } catch {
      router.push(href);
    } finally {
      setChecking(false);
    }
  }

  async function confirmInactiveLogout() {
    setModalOpen(false);
    await authClient.signOut();
    router.replace('/login');
  }

  const InactiveModal = modalOpen ? (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" role="dialog" aria-modal="true" data-testid="inactive-modal">
      <div className="tcard p-6 max-w-md w-full">
        <div className="text-[10px] tracking-[0.2em] text-loss">// ACCESS DENIED</div>
        <h2 className="font-display font-black text-lg mt-2 text-fg">Not enough recent trading activity</h2>
        <p className="text-sm text-fg-3 mt-2 leading-relaxed">{modalMessage}</p>
        <p className="text-sm text-fg-3 mt-2">
          Trade actively on your Elefin account under our referral, then try again.
        </p>
        <button
          type="button"
          onClick={() => void confirmInactiveLogout()}
          className="btn btn-primary w-full mt-5 py-2.5"
        >
          OK — SIGN OUT
        </button>
      </div>
    </div>
  ) : null;

  return { enterTerminal, checking, InactiveModal };
}
