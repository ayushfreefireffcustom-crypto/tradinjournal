'use client';

// Create a price alert for the active symbol. Threshold is pre-filled with the
// current price so the user just nudges it; direction is explicit (above/below).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { BellRinging, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import type { CreateAlertBody } from '@/lib/alerts-api';

interface Props {
  symbol: string;
  currentPrice: number | null;
  accountId?: string;
  onCreate: (body: CreateAlertBody) => Promise<void>;
  onClose: () => void;
}

export default function AlertDialog({ symbol, currentPrice, accountId, onCreate, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [threshold, setThreshold] = useState(currentPrice != null ? String(currentPrice) : '');
  const [recurring, setRecurring] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setMounted(true); }, []);
  // The current price is fetched async after the dialog opens — prefill the
  // threshold when it arrives, unless the user has already typed one.
  useEffect(() => {
    if (currentPrice != null) setThreshold(prev => (prev === '' ? String(currentPrice) : prev));
  }, [currentPrice]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !submitting) onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, submitting]);

  const submit = async () => {
    const t = Number(threshold);
    if (!Number.isFinite(t) || t <= 0) { setError('Enter a valid price.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await onCreate({ symbol, direction, threshold: t, accountId, recurring, note: note.trim() || undefined, seedPrice: currentPrice ?? undefined });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the alert.');
      setSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="alert-dialog">
      <div className="absolute inset-0 bg-app/80 backdrop-blur-sm" onClick={() => !submitting && onClose()} />
      <div className="relative w-full max-w-sm tcard p-6 fade-up">
        <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] text-fg-3">
          <BellRinging size={13} weight="fill" className="text-profit" /> // PRICE ALERT
        </div>
        <h2 className="font-display font-black text-xl tracking-tight mt-1">{symbol}</h2>
        {currentPrice != null && (
          <p className="text-fg-3 text-[11px] mt-1 numeric">Current price: <span className="text-fg-2">{currentPrice}</span></p>
        )}

        {/* Direction */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          {(['above', 'below'] as const).map(d => {
            const I = d === 'above' ? ArrowUp : ArrowDown;
            const on = direction === d;
            const onClass = d === 'above' ? 'text-profit border-profit/40 bg-profit/10' : 'text-loss border-loss/40 bg-loss/10';
            return (
              <button
                key={d}
                onClick={() => setDirection(d)}
                data-testid={`alert-dir-${d}`}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-[var(--radius-btn)] text-[11px] tracking-widest uppercase border transition-colors ${
                  on ? onClass : 'text-fg-3 border-border-soft hover:text-fg'
                }`}
              >
                <I size={13} weight="bold" /> {d}
              </button>
            );
          })}
        </div>

        {/* Threshold */}
        <label className="block mt-4">
          <span className="text-[10px] tracking-[0.16em] uppercase text-fg-3">Threshold price</span>
          <input
            type="number"
            value={threshold}
            onChange={e => setThreshold(e.target.value)}
            data-testid="alert-threshold"
            className="tinput w-full mt-1 numeric"
            placeholder="0.00"
            autoFocus
          />
        </label>

        {/* Recurring + note */}
        <label className="flex items-center gap-2 mt-4 cursor-pointer">
          <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} data-testid="alert-recurring" />
          <span className="text-[12px] text-fg-2">Recurring — re-arm after it fires</span>
        </label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={200}
          placeholder="Note (optional)"
          className="tinput w-full mt-3 text-[12px]"
        />

        {error && <p className="text-loss text-[11px] mt-3" data-testid="alert-error">{error}</p>}

        <div className="flex justify-end gap-2 pt-4 border-t border-border-soft mt-5">
          <button type="button" onClick={onClose} disabled={submitting} className="btn btn-ghost">CANCEL</button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            data-testid="alert-create"
            className={`btn btn-primary ${submitting ? 'opacity-60 cursor-wait' : ''}`}
          >
            {submitting ? 'CREATING…' : 'CREATE ALERT'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
