'use client';

// Create a price alert for the active symbol. Threshold is pre-filled with the
// current price so the user just nudges it; direction is explicit (above/below).
import { useEffect, useState } from 'react';
import MkDialog, { MkClose } from '@/components/v6/markets/dialog';
import type { CreateAlertBody } from '@/lib/alerts-api';

interface Props {
  symbol: string;
  currentPrice: number | null;
  accountId?: string;
  onCreate: (body: CreateAlertBody) => Promise<void>;
  onClose: () => void;
}

export default function AlertDialog({ symbol, currentPrice, accountId, onCreate, onClose }: Props) {
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [threshold, setThreshold] = useState(currentPrice != null ? String(currentPrice) : '');
  const [recurring, setRecurring] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // The current price is fetched async after the dialog opens: prefill the
  // threshold when it arrives, unless the user has already typed one.
  useEffect(() => {
    if (currentPrice != null) setThreshold(prev => (prev === '' ? String(currentPrice) : prev));
  }, [currentPrice]);

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

  return (
    <MkDialog onClose={onClose} labelledBy="mk-ad-t" testId="alert-dialog" locked={submitting}>
      <div className="mk-dh">
        <div className="mk-dh-m">
          <span className="x-muted">Price alert</span>
          <h2 id="mk-ad-t">{symbol}</h2>
          <p className="x-muted">{currentPrice != null ? <>Now <b className="m">{currentPrice.toLocaleString('en-US', { maximumFractionDigits: 5 })}</b></> : 'Fetching price…'}</p>
        </div>
        <MkClose onClose={onClose} disabled={submitting} />
      </div>
      <div className="mk-dbody">
        <div className="x-seg x-seg--in mk-ad-dir" role="group" aria-label="Direction">
          {(['above', 'below'] as const).map(d => (
            <button key={d} aria-pressed={direction === d} onClick={() => setDirection(d)} data-testid={`alert-dir-${d}`}>{d === 'above' ? 'Crosses above' : 'Crosses below'}</button>
          ))}
        </div>
        <div className="x-field">
          <label htmlFor="mk-ad-price">Price</label>
          <input id="mk-ad-price" type="number" inputMode="decimal" value={threshold} onChange={e => setThreshold(e.target.value)} data-testid="alert-threshold" className="x-input m" placeholder="0.00" autoFocus
            aria-invalid={error ? true : undefined} onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        </div>
        <div className="x-field">
          <label htmlFor="mk-ad-note">Note <span className="x-dim">optional</span></label>
          <input id="mk-ad-note" value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Breakout watch" className="x-input" />
        </div>
        <label className="mk-check">
          <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} data-testid="alert-recurring" />
          <span><b>Recurring</b><small>Re-arm after it fires</small></span>
        </label>
        {error && <p className="mk-err" role="alert" data-testid="alert-error">{error}</p>}
      </div>
      <div className="mk-dfoot">
        <button type="button" onClick={onClose} disabled={submitting} className="x-btn">Cancel</button>
        <button type="button" onClick={submit} disabled={submitting} data-testid="alert-create" className="x-btn x-btn--hi">{submitting ? 'Creating…' : 'Create alert'}</button>
      </div>
    </MkDialog>
  );
}
