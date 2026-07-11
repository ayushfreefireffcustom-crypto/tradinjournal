'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle, WarningCircle, Info, X } from '@phosphor-icons/react';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; type: ToastType; message: string }

interface Ctx { push: (type: ToastType, message: string) => void }
const ToastContext = createContext<Ctx | null>(null);

// Fire-and-forget notifications. `useToast().success('Synced')` etc. No-ops
// safely if used outside the provider.
export function useToast() {
  const ctx = useContext(ToastContext);
  return {
    success: (m: string) => ctx?.push('success', m),
    error: (m: string) => ctx?.push('error', m),
    info: (m: string) => ctx?.push('info', m),
  };
}

const meta: Record<ToastType, { Icon: typeof CheckCircle; color: string }> = {
  success: { Icon: CheckCircle, color: 'var(--color-profit)' },
  error: { Icon: WarningCircle, color: 'var(--color-loss)' },
  info: { Icon: Info, color: 'var(--color-fg-2)' },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { Icon, color } = meta[toast.type];
  return (
    <div
      className="toast-in pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-card)] border border-border bg-surface/95 backdrop-blur px-3.5 py-3 shadow-[var(--shadow-hover)]"
      style={{ borderLeft: `2px solid ${color}` }}
      data-testid={`toast-${toast.type}`}
      role="status"
    >
      <Icon size={18} weight="fill" color={color} className="shrink-0 mt-px" />
      <span className="text-[12px] leading-snug flex-1 min-w-0">{toast.message}</span>
      <button onClick={onClose} aria-label="Dismiss" className="shrink-0 text-fg-3 hover:text-fg press focus-ring rounded">
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, type, message }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3800);
  }, []);

  const dismiss = (id: number) => setToasts(t => t.filter(x => x.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        className="fixed z-[999] bottom-4 right-4 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-[340px] pointer-events-none"
        data-testid="toaster"
      >
        {toasts.map(t => <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}
