'use client';

// The one confirm dialog for the app, in two shapes:
//   <ConfirmDialog title message onConfirm onClose … />   controlled component
//   const [dialog, ask] = useConfirm();                    promise-based, for window.confirm-style flows
//     const r = await ask({ title: 'Suspend Rohan?', confirmLabel: 'Suspend', tone: 'danger', reason: true });
//     if (!r) return;   // cancelled
//     r.reason          // trimmed text or undefined
// Both portal to <body> inside their own `.v6` scope (so an ancestor transform
// can't trap `position: fixed`), close on Esc and backdrop click, and become a
// bottom sheet on phones.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IClose } from '@/components/v3/icons';
import '@/styles/v6/tokens.css';
import '@/styles/v6/components.css';
import '@/styles/v6/dialogs.css';

/** Render children in a `.v6` scope under <body>. Nothing renders on the server. */
export function V6Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return createPortal(<div className="v6 ac-portal">{children}</div>, document.body);
}

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
  // Esc to close + lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, loading]);

  return (
    <V6Portal>
      <div className="x-dialog-scrim" onMouseDown={() => !loading && onClose()}>
        <div className="x-dialog ac-dlg" role="alertdialog" aria-modal="true" aria-labelledby="cd-t" aria-describedby="cd-m" data-testid="confirm-dialog" onMouseDown={e => e.stopPropagation()}>
          <h2 id="cd-t">{title}</h2>
          <p id="cd-m" className="ac-dlg-msg">{message}</p>
          <footer className="ac-dlg-ft">
            <button type="button" onClick={onClose} disabled={loading} data-testid="confirm-cancel" className="x-btn">{cancelLabel}</button>
            <button type="button" onClick={onConfirm} disabled={loading} data-testid="confirm-accept" className={`x-btn ${danger ? 'x-btn--danger' : 'x-btn--hi'}`} autoFocus>{loading ? 'Working…' : confirmLabel}</button>
          </footer>
        </div>
      </div>
    </V6Portal>
  );
}

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  /** Show an optional reason field (kept on the partner's note trail). */
  reason?: boolean;
  reasonLabel?: string;
  /** The reason must be given (3+ characters) before confirming. */
  reasonRequired?: boolean;
}
export type ConfirmResult = { reason?: string } | null;

export function useConfirm(): [ReactNode, (o: ConfirmOptions) => Promise<ConfirmResult>] {
  const [open, setOpen] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState('');
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const ask = useCallback((o: ConfirmOptions) => new Promise<ConfirmResult>(resolve => {
    resolver.current?.(null);
    resolver.current = resolve;
    setReason('');
    setOpen(o);
  }), []);

  const close = useCallback((r: ConfirmResult) => {
    resolver.current?.(r);
    resolver.current = null;
    setOpen(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    // The portal mounts a tick later; focus once it's there.
    const t = setTimeout(() => (open.reason ? reasonRef.current : confirmRef.current)?.focus(), 0);
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
    window.addEventListener('keydown', k);
    return () => { clearTimeout(t); window.removeEventListener('keydown', k); };
  }, [open, close]);

  const dialog = open ? (
    <V6Portal>
      <div className="x-dialog-scrim" onMouseDown={() => close(null)}>
        <form className="x-dialog ac-dlg" role="alertdialog" aria-modal="true" aria-labelledby="ac-confirm-t" onMouseDown={e => e.stopPropagation()}
          onSubmit={e => { e.preventDefault(); if (open.reasonRequired && reason.trim().length < 3) return; close({ reason: reason.trim() || undefined }); }} data-testid="confirm-dialog">
          <div className="ac-dlg-h">
            <h2 id="ac-confirm-t">{open.title}</h2>
            <button type="button" className="x-btn x-btn--ghost x-btn--icon x-btn--sm" onClick={() => close(null)} aria-label="Close"><IClose size={16} /></button>
          </div>
          {open.body && (typeof open.body === 'string' ? <p className="ac-dlg-msg">{open.body}</p> : <div className="ac-dlg-msg">{open.body}</div>)}
          {open.reason && (
            <div className="x-field ac-dlg-reason">
              <label htmlFor="ac-confirm-reason">{open.reasonLabel ?? 'Reason'} {!open.reasonRequired && <span className="x-dim">(optional, kept on the note trail)</span>}</label>
              <textarea id="ac-confirm-reason" ref={reasonRef} rows={2} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} data-testid="confirm-reason" className="x-textarea ac-dlg-ta"
                // Enter confirms (what people expect in a dialog); Shift+Enter adds a line.
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
            </div>
          )}
          <footer className="ac-dlg-ft">
            <button type="button" className="x-btn" onClick={() => close(null)} data-testid="confirm-cancel">Cancel</button>
            <button ref={confirmRef} type="submit" className={`x-btn ${open.tone === 'danger' ? 'x-btn--danger' : 'x-btn--hi'}`} data-testid="confirm-ok" disabled={!!open.reasonRequired && reason.trim().length < 3}>{open.confirmLabel ?? 'Confirm'}</button>
          </footer>
        </form>
      </div>
    </V6Portal>
  ) : null;

  return [dialog, ask];
}
