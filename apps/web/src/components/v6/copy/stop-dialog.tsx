'use client';

// Stop a copy (C4.5): choose to close the follow's open copies (reduce-only,
// never more than was copied) or keep them, then show what happened.
import { useState } from 'react';
import Modal from '@/components/v6/ui/modal';
import { followsApi, type Follow, type StopResult } from '@/lib/copy-api';
import '@/styles/v6/dialogs.css';
import '@/styles/v6/kit.css';

export default function StopDialog({ follow, onClose, onDone }: { follow: Follow; onClose: () => void; onDone: (r: StopResult) => void }) {
  const [close, setClose] = useState(follow.openPositions > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StopResult | null>(null);

  async function stop() {
    setBusy(true);
    setError(null);
    try {
      const r = await followsApi.stop(follow.id, close);
      // Show per-position outcomes when there are any; otherwise we're done.
      if (r.closes.length) setResult(r);
      else onDone(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stop');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const bad = result.closes.filter(c => !c.ok);
    return (
      <Modal title="Copying stopped" sub={bad.length ? 'Some positions are still open on your exchange account.' : 'Nothing more will be copied.'} onClose={() => onDone(result)} testId="stop-result">
        <ul className="cp-closes">
          {result.closes.map(c => (
            <li key={c.symbol} className={c.ok ? '' : 'bad'}><b>{c.symbol}</b><span>{c.message}</span></li>
          ))}
        </ul>
        <footer className="ac-dlg-ft"><button className="x-btn x-btn--hi" onClick={() => onDone(result)} autoFocus>Done</button></footer>
      </Modal>
    );
  }

  return (
    <Modal title={`Stop copying ${follow.leader.displayName}?`} sub="New trades won’t be copied. You can start again later from the leader’s page." onClose={onClose} busy={busy} testId="stop-dialog">
      {follow.openPositions > 0 ? (
        <div className="cp-choice" role="radiogroup" aria-label="Open copies">
          <label className={close ? 'on' : ''}>
            <input type="radio" name="stop-close" checked={close} onChange={() => setClose(true)} data-testid="stop-close" />
            <span><b>Close my open copies</b><small>Market orders that only reduce what this copy opened ({follow.openPositions} {follow.openPositions === 1 ? 'position' : 'positions'}). Anything you opened yourself is left alone.</small></span>
          </label>
          <label className={!close ? 'on' : ''}>
            <input type="radio" name="stop-close" checked={!close} onChange={() => setClose(false)} data-testid="stop-keep" />
            <span><b>Keep them open</b><small>They stay on your exchange account and you manage them yourself.</small></span>
          </label>
        </div>
      ) : <p className="x-muted">This copy has no open positions.</p>}
      {error && <div className="x-banner x-banner--err" role="alert">{error}</div>}
      <footer className="ac-dlg-ft">
        <button className="x-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="x-btn x-btn--danger" onClick={stop} disabled={busy} data-testid="stop-confirm">{busy ? (close ? 'Closing positions…' : 'Stopping…') : 'Stop copying'}</button>
      </footer>
    </Modal>
  );
}
