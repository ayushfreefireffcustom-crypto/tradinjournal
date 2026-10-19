'use client';

// What /partner/* shows when the caller isn't an active partner: an application
// form, "waiting for review", or why access is off. Driven by the API error code.
import { useState } from 'react';
import { partnerApi, PartnerApiError } from '@/lib/partner-api';

export type GateReason = 'NOT_A_PARTNER' | 'PARTNER_PENDING' | 'PARTNER_SUSPENDED' | 'PARTNER_REVOKED';
export const GATE_CODES: string[] = ['NOT_A_PARTNER', 'PARTNER_PENDING', 'PARTNER_SUSPENDED', 'PARTNER_REVOKED'];

export default function PartnerGate({ reason, onApplied }: { reason: GateReason; onApplied: () => void }) {
  const [audience, setAudience] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await partnerApi.apply({ audience: audience.trim(), ...(code.trim() ? { code: code.trim() } : {}) });
      setSent(true);
      onApplied();
    } catch (err) {
      setError(err instanceof PartnerApiError ? err.message : 'Could not send your application. Try again.');
    } finally { setBusy(false); }
  }

  if (reason === 'PARTNER_PENDING' || sent) {
    return (
      <section className="v3-card pt-gate" data-testid="partner-gate-pending">
        <span className="pt-gate-ic a">⏳</span>
        <h2>Your application is in review.</h2>
        <p>We check every partner by hand. You&rsquo;ll get access to your link and dashboard here as soon as you&rsquo;re approved.</p>
      </section>
    );
  }
  if (reason === 'PARTNER_SUSPENDED') {
    return (
      <section className="v3-card pt-gate" data-testid="partner-gate-suspended">
        <span className="pt-gate-ic r">!</span>
        <h2>Your partner account is suspended.</h2>
        <p>Your links have stopped tracking new signups. Email <a href="mailto:hello@tradelogs.com">hello@tradelogs.com</a> and we&rsquo;ll go through it with you.</p>
      </section>
    );
  }
  return (
    <section className="v3-card pt-gate pt-apply" data-testid="partner-apply">
      <div>
        <p className="pt-gate-k">Partner programme</p>
        <h2>{reason === 'PARTNER_REVOKED' ? 'Apply to rejoin the partner programme.' : 'Bring traders to TRADElogs.'}</h2>
        <p>Get your own link and code, and see who signed up through you, who connected MT5 and who&rsquo;s actively trading. Applications are reviewed by hand.</p>
        <ul className="pt-rules">
          <li>You see your clients&rsquo; names, location and activity level — never their email, balance or trades.</li>
          <li>The programme is tracking only for now; there are no payouts.</li>
          <li>Promote TRADElogs honestly — no fake results or &ldquo;guaranteed profit&rdquo; claims.</li>
        </ul>
      </div>
      <form onSubmit={apply} className="pt-apply-form">
        <label>Where&rsquo;s your audience?
          <input required minLength={2} maxLength={120} value={audience} onChange={e => setAudience(e.target.value)} placeholder="e.g. Telegram group · 12k members" data-testid="apply-audience" />
        </label>
        <label><span className="pt-lbl">Code you&rsquo;d like <span>(optional)</span></span>
          <input value={code} maxLength={20} onChange={e => setCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase())} placeholder="YOURNAME" data-testid="apply-code" />
          <small>3–20 letters, numbers, hyphens or underscores. Leave blank and we&rsquo;ll make one from your name.</small>
        </label>
        {error && <p className="pt-err" role="alert">{error}</p>}
        <button type="submit" className="v3-btn v3-btn--acc" disabled={busy || audience.trim().length < 2} data-testid="apply-submit">{busy ? 'Sending…' : 'Apply to be a partner'}</button>
      </form>
    </section>
  );
}
