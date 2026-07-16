'use client';

// Small reusable confirm modal. Mirrors the ConnectBrokerModal overlay look
// (dimmed backdrop + tcard), but portals to <body> so an ancestor `transform`
// (card entrance animations) can't turn `position: fixed` into a local
// containing block and mis-place it. Esc closes; backdrop click closes.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

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
  confirmLabel = 'CONFIRM',
  cancelLabel = 'CANCEL',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="confirm-dialog">
      <div className="absolute inset-0 bg-app/80 backdrop-blur-sm" onClick={() => !loading && onClose()} />
      <div className="relative w-full max-w-sm tcard p-6 fade-up">
        <div className="text-[10px] tracking-[0.25em] text-fg-3">// CONFIRM</div>
        <h2 className="font-display font-black text-xl tracking-tight mt-1">{title}</h2>
        <p className="text-fg-2 text-[12px] mt-2 leading-relaxed">{message}</p>

        <div className="flex justify-end gap-2 pt-4 border-t border-border-soft mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            data-testid="confirm-cancel"
            className="btn btn-ghost"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            data-testid="confirm-accept"
            className={`btn ${danger ? 'bg-loss text-white hover:opacity-90' : 'btn-primary'} ${loading ? 'opacity-60 cursor-wait' : ''}`}
          >
            {loading ? 'WORKING…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
