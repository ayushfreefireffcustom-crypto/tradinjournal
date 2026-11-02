'use client';

import '@/styles/v6/tokens.css';
import '@/styles/v6/components.css';
import '@/styles/v6/dialogs.css';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';
import { accessApi } from '@/lib/access-api';
import { primeAccessCache } from '@/lib/use-platform-access';
import { useDialog } from '@/components/v6/ui/use-dialog';

export function useTerminalEntry() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const modalRef = useDialog({ open: modalOpen });
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
    <div className="v6">
    <div className="x-dialog-scrim" role="dialog" aria-modal="true" aria-labelledby="inactive-t" data-testid="inactive-modal">
      <div ref={modalRef} className="x-dialog te-dlg">
        <span className="x-tag x-tag--r">Access paused</span>
        <h2 id="inactive-t">Not enough recent trading activity</h2>
        <p className="x-lead">{modalMessage}</p>
        <p className="x-lead">Trade actively on your Elefin account under our referral, then try again.</p>
        <button type="button" onClick={() => void confirmInactiveLogout()} className="x-btn x-btn--hi x-btn--lg x-btn--full">
          OK, sign out
        </button>
      </div>
    </div>
    </div>
  ) : null;

  return { enterTerminal, checking, InactiveModal };
}
