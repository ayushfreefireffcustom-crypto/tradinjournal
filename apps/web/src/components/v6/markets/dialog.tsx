'use client';

// Modal for the charts + markets pages. Portalled under <body> with its own
// `.v6` scope so tokens and both themes apply outside the frame.
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IClose } from '@/components/v6/icons';
import { useDialog } from '@/components/v6/ui/use-dialog';
import '@/styles/v6/markets.css';

export default function MkDialog({ onClose, labelledBy, testId, className = '', locked = false, children }: {
  onClose: () => void;
  labelledBy: string;
  testId?: string;
  className?: string;
  /** While true (e.g. saving), Esc and the backdrop don't close it. */
  locked?: boolean;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const ref = useDialog({ onClose, locked });
  if (!mounted) return null;
  return createPortal(
    <div className="v6 mk-portal">
      <div className="x-dialog-scrim" onMouseDown={e => { if (e.target === e.currentTarget && !locked) onClose(); }}>
        <div ref={ref} className={`x-dialog mk-dlg ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} data-testid={testId}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function MkClose({ onClose, disabled }: { onClose: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClose} disabled={disabled} aria-label="Close" className="x-btn x-btn--ghost x-btn--icon x-btn--sm mk-dlg-x">
      <IClose size={15} />
    </button>
  );
}
