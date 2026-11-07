'use client';

// What /partner/* shows when the caller isn't an active partner: an application
// form, "waiting for review", or why access is off. Driven by the API error code.
import { useEffect, useState } from 'react';
import { partnerApi, PartnerApiError } from '@/lib/partner-api';
import { IAlert, IPartner } from '@/components/v6/icons';
import '@/styles/v6/account.css';
import '@/styles/v6/ib.css';

export type GateReason = 'NOT_A_PARTNER' | 'PARTNER_PENDING' | 'PARTNER_NEEDS_INFO' | 'PARTNER_REJECTED' | 'PARTNER_SUSPENDED' | 'PARTNER_REVOKED';
export const GATE_CODES: string[] = ['NOT_A_PARTNER', 'PARTNER_PENDING', 'PARTNER_NEEDS_INFO', 'PARTNER_REJECTED', 'PARTNER_SUSPENDED', 'PARTNER_REVOKED'];

const BROKERS = [['elefin', 'Elefin'], ['xellion', 'Xellion'], ['exness', 'Exness'], ['xm', 'XM'], ['vantage', 'Vantage'], ['icmarkets', 'IC Markets'], ['pepperstone', 'Pepperstone'], ['other', 'Other']] as const;
const PLATFORMS = ['YouTube', 'Telegram', 'Instagram', 'X', 'Website'] as const;

const IClock = () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;

export default function PartnerGate({ reason, onApplied }: { reason: GateReason; onApplied: () => void }) {
  const [audience, setAudience] = useState('');
  const [code, setCode] = useState('');
  // TRADElogs is for Elefin clients, so Elefin starts ticked.
  const [brokers, setBrokers] = useState<string[]>(['elefin']);
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [size, setSize] = useState('');
  const [pitch, setPitch] = useState('');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (reason !== 'PARTNER_NEEDS_INFO' && reason !== 'PARTNER_REJECTED') return;
    partnerApi.me().then(p => setNote(p?.reviewNote ?? null)).catch(() => {});
  }, [reason]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const links = Object.entries(socials).map(([platform, url]) => ({ platform, url: url.trim() })).filter(x => x.url);
      await partnerApi.apply({
        audience: audience.trim(), ...(code.trim() ? { code: code.trim() } : {}), brokers, socials: links,
        ...(size.trim() ? { audienceSize: size.trim() } : {}), ...(pitch.trim() ? { pitch: pitch.trim() } : {}),
      });
      setSent(true);
      onApplied();
    } catch (err) {
      setError(err instanceof PartnerApiError ? err.message : 'Could not send your application. Try again.');
    } finally { setBusy(false); }
  }

  if (reason === 'PARTNER_PENDING' || sent) {
    return (
      <section className="x-card x-empty ac-gate" data-testid="partner-gate-pending">
        <span className="x-ic"><IClock /></span>
        <b>Your application is in review</b>
        <p>We check every partner by hand. Your link and dashboard appear here as soon as you&rsquo;re approved.</p>
      </section>
    );
  }
  if (reason === 'PARTNER_SUSPENDED') {
    return (
      <section className="x-card x-empty ac-gate" data-testid="partner-gate-suspended">
        <span className="x-ic ac-ic-r"><IAlert size={22} /></span>
        <b>Your partner account is suspended</b>
        <p>Your links have stopped tracking new signups. Email <a className="x-link" href="mailto:hello@tradelogs.com">hello@tradelogs.com</a> and we&rsquo;ll go through it with you.</p>
      </section>
    );
  }
  const again = reason === 'PARTNER_REVOKED' || reason === 'PARTNER_REJECTED' || reason === 'PARTNER_NEEDS_INFO';
  const badUrl = Object.values(socials).some(u => u.trim() && !/^https?:\/\/\S+\.\S+/.test(u.trim()));
  return (
    <section className="x-card ac-apply" data-testid="partner-apply">
      <div className="ac-apply-l">
        <span className="ac-st-ic"><IPartner size={17} /></span>
        <h2>{reason === 'PARTNER_NEEDS_INFO' ? 'We need a little more' : again ? 'Apply to the partner programme again' : 'Bring traders to TRADElogs'}</h2>
        {reason === 'PARTNER_NEEDS_INFO' || reason === 'PARTNER_REJECTED'
          ? <p className="ib-app-note" data-testid="partner-review-note">{reason === 'PARTNER_REJECTED' ? 'Your last application wasn’t approved' : 'Our team asked'}{note ? <>: <b>{note}</b></> : '.'} Update the details and send it again.</p>
          : <p>Get your own link and code, connect the broker you&rsquo;re an IB with, and offer TRADElogs tools to clients who open accounts under you. Applications are reviewed by hand.</p>}
        <ul className="ac-rules">
          <li>You see your clients&rsquo; names, location, broker check and activity, never their email, balance or trades. P&amp;L only if they choose to share it.</li>
          <li>The programme is tracking only for now; there are no payouts.</li>
          <li>Promote TRADElogs honestly: no fake results or &ldquo;guaranteed profit&rdquo; claims.</li>
        </ul>
      </div>
      <form onSubmit={apply} className="x-inset ac-apply-form">
        <div className="x-field">
          <label htmlFor="ac-apply-aud">Where&rsquo;s your audience?</label>
          <input id="ac-apply-aud" className="x-input" required minLength={2} maxLength={120} value={audience} onChange={e => setAudience(e.target.value)} placeholder="e.g. Telegram group · 12k members" data-testid="apply-audience" />
        </div>
        <div className="x-field">
          <span className="ib-legend">Brokers you&rsquo;re an IB with</span>
          <div className="x-seg x-seg--sm ib-tabs" role="group" aria-label="Brokers">
            {BROKERS.map(([k, l]) => <button key={k} type="button" aria-pressed={brokers.includes(k)} onClick={() => setBrokers(b => b.includes(k) ? b.filter(x => x !== k) : [...b, k])}>{l}</button>)}
          </div>
        </div>
        <div className="x-field">
          <label htmlFor="ac-apply-size">Audience size <span className="x-dim">(optional)</span></label>
          <input id="ac-apply-size" className="x-input" maxLength={40} value={size} onChange={e => setSize(e.target.value)} placeholder="e.g. 40,000 subscribers" />
        </div>
        {PLATFORMS.map(pl => (
          <div className="x-field" key={pl}>
            <label htmlFor={`ac-apply-${pl}`}>{pl} link <span className="x-dim">(optional)</span></label>
            <input id={`ac-apply-${pl}`} className="x-input" type="url" maxLength={300} value={socials[pl] ?? ''} onChange={e => setSocials(s => ({ ...s, [pl]: e.target.value }))} placeholder="https://" />
          </div>
        ))}
        <div className="x-field">
          <label htmlFor="ac-apply-pitch">Anything else we should know <span className="x-dim">(optional)</span></label>
          <textarea id="ac-apply-pitch" className="x-textarea" rows={3} maxLength={2000} value={pitch} onChange={e => setPitch(e.target.value)} placeholder="What you teach, your IB id at the broker, how you'd use TRADElogs with clients" />
        </div>
        <div className="x-field">
          <label htmlFor="ac-apply-code">Code you&rsquo;d like <span className="x-dim">(optional)</span></label>
          <input id="ac-apply-code" className="x-input m" value={code} maxLength={20} onChange={e => setCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase())} placeholder="YOURNAME" data-testid="apply-code" />
          <span className="x-help">3–20 letters, numbers, hyphens or underscores. Leave blank and we&rsquo;ll make one from your name.</span>
        </div>
        {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span></div>}
        <button type="submit" className="x-btn x-btn--hi" disabled={busy || audience.trim().length < 2 || badUrl} data-testid="apply-submit">{busy ? 'Sending…' : again ? 'Send application' : 'Apply to be a partner'}</button>
      </form>
    </section>
  );
}
