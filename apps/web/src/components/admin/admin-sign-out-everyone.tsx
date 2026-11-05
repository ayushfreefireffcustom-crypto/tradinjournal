'use client';

// Admin › System: sign every user out (everyone but you). Used when the access rule
// changes, so people sign in again and get checked against the new rule.
import { useState } from 'react';
import ConfirmDialog from '@/components/confirm-dialog';
import { adminApi } from '@/lib/admin-api';

export function AdminSignOutEveryone({ onDone }: { onDone?: (count: number) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    try {
      const r = await adminApi.signOutEveryone();
      setResult(`${r.signedOut.toLocaleString('en-US')} session${r.signedOut === 1 ? '' : 's'} ended. Everyone has to sign in again within 5 minutes.`);
      setOpen(false);
      onDone?.(r.signedOut);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign everyone out.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="x-card" data-testid="admin-sign-out-everyone">
      <div className="x-ch"><h2>Sessions</h2></div>
      <div className="ad-maint">
        <div className="ad-maint-t">
          <b>Sign everyone out</b>
          <span>Ends every session except yours. When they sign back in, the access rule (Elefin accounts only) applies.</span>
        </div>
        <button type="button" className="x-btn x-btn--danger" onClick={() => setOpen(true)} disabled={busy} data-testid="sign-out-everyone">
          Sign everyone out
        </button>
      </div>
      {result && <p className="x-help" role="status" data-testid="sign-out-everyone-result">{result}</p>}
      {error && <p className="x-help neg" role="alert">{error}</p>}
      {open && (
        <ConfirmDialog
          title="Sign everyone out?"
          message="Every user except you is signed out. They’ll need to sign in again, and only people with an Elefin MT5 account (or a manual grant) get past the access check. This can’t be undone."
          confirmLabel="Sign everyone out"
          danger
          loading={busy}
          onConfirm={() => void run()}
          onClose={() => !busy && setOpen(false)}
        />
      )}
    </section>
  );
}
