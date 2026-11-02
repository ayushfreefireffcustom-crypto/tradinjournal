'use client';

// Name a new watchlist or rename one. The API's refusal (a taken name, the
// 8-list cap) shows under the field and the dialog stays open.
import { useState } from 'react';
import Modal from './modal';

export default function WatchlistNameDialog({ title, sub, initial = '', submitLabel, onSubmit, onClose }: {
  title: string; sub?: string; initial?: string; submitLabel: string; onSubmit: (name: string) => Promise<unknown>; onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    setErr(null);
    try { await onSubmit(trimmed); onClose(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title={title} sub={sub} onClose={onClose} busy={busy} testId="wl-name-dialog"
      footer={<>
        <button type="button" className="x-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" form="wl-name-form" className="x-btn x-btn--hi" disabled={!trimmed || busy} data-testid="wl-name-save">{busy ? 'Saving…' : submitLabel}</button>
      </>}>
      <form id="wl-name-form" className="x-field" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <label htmlFor="wl-name">Name</label>
        <input id="wl-name" className="x-input" value={name} maxLength={32} onChange={(e) => { setName(e.target.value); setErr(null); }}
          aria-invalid={!!err || undefined} aria-describedby={err ? 'wl-name-err' : undefined} autoComplete="off" data-autofocus data-testid="wl-name-input" />
        {err ? <span className="x-err" id="wl-name-err" role="alert">{err}</span> : <span className="x-help">Up to 32 characters.</span>}
      </form>
    </Modal>
  );
}
