'use client';

// Create a price alert for the active symbol. Threshold is pre-filled with the
// current price so the user just nudges it; direction is explicit (above/below).
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IClose } from '@/components/v3/icons';
import '@/styles/app-v3.css';
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
    <div className="v3 v3-modal" data-testid="alert-dialog" role="dialog" aria-modal="true" aria-labelledby="ad-t">
      <div className="v3-modal-bg" onClick={() => !submitting && onClose()} />
      <div className="v3-modal-card ad-card">
        <header className="v3-modal-hd">
          <div style={{ minWidth: 0 }}>
            <small>Price alert</small>
            <h2 id="ad-t">{symbol}</h2>
            <p className="num">{currentPrice != null ? <>Now <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{currentPrice.toLocaleString('en-US', { maximumFractionDigits: 5 })}</b></> : 'Fetching price…'}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="v3-modal-x" style={{ marginLeft: 'auto' }}><IClose size={16} /></button>
        </header>
        <div className="ad-bd">
          <div className="v3-seg ad-dir" role="group" aria-label="Direction">
            {(['above', 'below'] as const).map(d => (
              <button key={d} aria-pressed={direction === d} onClick={() => setDirection(d)} data-testid={`alert-dir-${d}`}>{d === 'above' ? 'Crosses above ≥' : 'Crosses below ≤'}</button>
            ))}
          </div>
          <label className="n-fld"><span>Price</span>
            <input type="number" inputMode="decimal" value={threshold} onChange={e => setThreshold(e.target.value)} data-testid="alert-threshold" className="n-in num" placeholder="0.00" autoFocus
              onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
          </label>
          <label className="n-fld"><span>Note <em>· optional</em></span>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="breakout watch" className="n-in" />
          </label>
          <label className="ad-check">
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} data-testid="alert-recurring" />
            <span className="box" aria-hidden />
            <span>Recurring <small>Re-arm after it fires</small></span>
          </label>
          {error && <p className="r-err" data-testid="alert-error">{error}</p>}
        </div>
        <footer className="v3-modal-ft" style={{ gap: 10 }}>
          <button type="button" onClick={onClose} disabled={submitting} className="v3-btn v3-btn--o">Cancel</button>
          <button type="button" onClick={submit} disabled={submitting} data-testid="alert-create" className="v3-btn v3-btn--ink" style={{ paddingRight: 18 }}>{submitting ? 'Creating…' : 'Create alert'}</button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
