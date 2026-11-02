'use client';

// The form/content dialog for the app pages: portalled into its own .v6 scope,
// a centred dialog on desktop and a bottom sheet on phones, with the keyboard
// behaviour from useDialog. For yes/no questions use components/confirm-dialog.
import type { ReactNode } from 'react';
import { V6Portal } from '@/components/confirm-dialog';
import { IClose } from '@/components/v6/icons';
import { useDialog } from './use-dialog';
import '@/styles/v6/kit.css';
import '@/styles/v6/dialogs.css';

export default function Modal({ title, sub, onClose, children, footer, busy, wide, testId }: {
  title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; busy?: boolean; wide?: boolean; testId?: string;
}) {
  const ref = useDialog({ onClose, locked: busy });
  return (
    <V6Portal>
      <div className="x-dialog-scrim" onMouseDown={() => !busy && onClose()}>
        <div ref={ref} className={`x-dialog ac-dlg cp-dlg ${wide ? 'cp-dlg--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="cp-dlg-t" data-testid={testId} onMouseDown={e => e.stopPropagation()}>
          <div className="ac-dlg-h">
            <div><h2 id="cp-dlg-t">{title}</h2>{sub && <p className="ac-dlg-msg">{sub}</p>}</div>
            <button type="button" className="x-btn x-btn--ghost x-btn--icon x-btn--sm" onClick={onClose} disabled={busy} aria-label="Close"><IClose size={16} /></button>
          </div>
          <div className="cp-dlg-body">{children}</div>
          {footer && <footer className="ac-dlg-ft cp-dlg-ft">{footer}</footer>}
        </div>
      </div>
    </V6Portal>
  );
}
