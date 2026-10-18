'use client';

// Small reusable confirm modal. Mirrors the ConnectBrokerModal overlay look
// (dimmed backdrop + tcard), but portals to <body> so an ancestor `transform`
// (card entrance animations) can't turn `position: fixed` into a local
// containing block and mis-place it. Esc closes; backdrop click closes.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import '@/styles/app-v3.css';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Esc to close + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, loading]);

  if (!mounted) return null;

  return createPortal(
    <div className="v3 v3-modal" role="alertdialog" aria-modal="true" aria-labelledby="cd-t" aria-describedby="cd-m" data-testid="confirm-dialog">
      <div className="v3-modal-bg" onClick={() => !loading && onClose()} />
      <div className="v3-modal-card cd">
        <h2 id="cd-t">{title}</h2>
        <p id="cd-m">{message}</p>
        <footer>
          <button type="button" onClick={onClose} disabled={loading} data-testid="confirm-cancel" className="v3-btn v3-btn--o">{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={loading} data-testid="confirm-accept" className={`v3-btn ${danger ? 'cd-danger' : 'v3-btn--ink'}`} autoFocus>{loading ? 'Working…' : confirmLabel}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
