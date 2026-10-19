'use client';

// In-app replacement for window.confirm / window.prompt. Native dialogs block the
// page (and browser automation), can't be styled, and lose the reason field's
// context. Usage:
//   const [dialog, ask] = useConfirm();
//   const r = await ask({ title: 'Suspend Rohan?', confirmLabel: 'Suspend', tone: 'danger', reason: true });
//   if (!r) return;            // cancelled
//   r.reason                   // trimmed text or undefined
//   …render {dialog} once in the component.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { IClose } from '@/components/v3/icons';

export interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  /** Show an optional reason field (kept on the partner's note trail). */
  reason?: boolean;
  reasonLabel?: string;
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
    (open.reason ? reasonRef.current : confirmRef.current)?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, close]);

  const dialog = open ? (
    <div className="v3 v3-modal-scrim pt-scrim" onMouseDown={() => close(null)}>
      <form className="pt-modal pt-confirm" role="alertdialog" aria-modal="true" aria-labelledby="pt-confirm-t" onMouseDown={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); close({ reason: reason.trim() || undefined }); }} data-testid="confirm-dialog">
        <div className="pt-modal-h"><h2 id="pt-confirm-t">{open.title}</h2><button type="button" onClick={() => close(null)} aria-label="Close"><IClose size={16} /></button></div>
        {open.body && <p>{open.body}</p>}
        {open.reason && (
          <label><span className="pt-lbl">{open.reasonLabel ?? 'Reason'} <span>(optional — kept on the note trail)</span></span>
            <textarea ref={reasonRef} rows={2} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} data-testid="confirm-reason"
              // Enter confirms (what people expect in a dialog); Shift+Enter adds a line.
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
          </label>
        )}
        <div className="pt-modal-f">
          <button type="button" className="v3-btn v3-btn--o" onClick={() => close(null)} data-testid="confirm-cancel">Cancel</button>
          <button ref={confirmRef} type="submit" className={`v3-btn ${open.tone === 'danger' ? 'pt-btn-danger' : 'v3-btn--acc'}`} data-testid="confirm-ok">{open.confirmLabel ?? 'Confirm'}</button>
        </div>
      </form>
    </div>
  ) : null;

  return [dialog, ask];
}
