'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle, WarningCircle, Info, X } from '@phosphor-icons/react';
import '@/styles/v6/tokens.css';
import '@/styles/v6/auth.css';

type ToastType = 'success' | 'error' | 'info';
interface Toast { id: number; type: ToastType; message: string }

interface Ctx { push: (type: ToastType, message: string) => void }
const ToastContext = createContext<Ctx | null>(null);

// Fire-and-forget notifications. `useToast().success('Synced')` etc. No-ops
// safely if used outside the provider.
export function useToast() {
  const ctx = useContext(ToastContext);
  // Stable identity so it's safe to use in effect/callback dependency arrays.
  return useMemo(() => ({
    success: (m: string) => ctx?.push('success', m),
    error: (m: string) => ctx?.push('error', m),
    info: (m: string) => ctx?.push('info', m),
  }), [ctx]);
}

const meta: Record<ToastType, { Icon: typeof CheckCircle; tone: string }> = {
  success: { Icon: CheckCircle, tone: 'ok' },
  error: { Icon: WarningCircle, tone: 'err' },
  info: { Icon: Info, tone: 'info' },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { Icon, tone } = meta[toast.type];
  return (
    <div className={`au-toast ${tone}`} data-testid={`toast-${toast.type}`} role="status">
      <Icon size={20} weight="fill" />
      <span>{toast.message}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss">
        <X size={13} weight="bold" />
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
  const ctx = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="v6 au-toasts" data-testid="toaster">
        {toasts.map(t => <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  );
}
