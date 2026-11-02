'use client';

// The partner's link, codes (primary + custom) and per-channel tracked links,
// with the most recent clicks so they can see what's landing.
import { useCallback, useEffect, useState } from 'react';
import AppShell, { timeAgo } from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { partnerApi, PartnerApiError, type PartnerChannel, type PartnerCode, type PartnerLinks } from '@/lib/partner-api';
import { IPlus } from '@/components/v6/icons';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v6/account/partner-gate';
import { ChannelTable, CopyButton, LinkBox, Qr, ShareRow, n, pct, place } from '@/components/v6/account/partner-parts';
import { useConfirm } from '@/components/confirm-dialog';
import '@/styles/v6/account.css';

const msg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

export default function PartnerLinkPage() {
  const { accounts, selected, select } = useAccounts();
  const [d, setD] = useState<PartnerLinks | null>(null);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [newCode, setNewCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, ask] = useConfirm();
  const [formError, setFormError] = useState<{ form: 'channel' | 'code' | 'table'; text: string } | null>(null);

  const load = useCallback(async () => {
    try { setD(await partnerApi.links()); setError(''); }
    catch (e) {
      if (e instanceof PartnerApiError && GATE_CODES.includes(e.code)) setGate(e.code as GateReason);
      else setError(msg(e, 'Could not load your links.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(key: string, form: 'channel' | 'code' | 'table', fn: () => Promise<unknown>) {
    setBusy(key); setFormError(null);
    try { await fn(); await load(); return true; }
    catch (e) { setFormError({ form, text: msg(e, 'That didn’t work. Try again.') }); return false; }
    finally { setBusy(null); }
  }

  const addChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('channel', 'channel', () => partnerApi.createChannel(label.trim()))) { setLabel(''); setAdding(false); }
  };
  const reserve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('code', 'code', () => partnerApi.reserveCode(newCode.trim()))) setNewCode('');
  };
  const release = async (c: PartnerCode) => {
    if (await ask({ title: `Release ${c.code}?`, body: 'Anyone can book it afterwards, and links using it stop working. People who already joined with it stay your clients.', confirmLabel: 'Release code', tone: 'danger' }))
      void run(`rel:${c.id}`, 'code', () => partnerApi.releaseCode(c.id));
  };
  const archive = async (c: PartnerChannel) => {
    if (await ask({ title: `Archive “${c.label}”?`, body: 'New clicks on it count for your default link instead. Its history stays.', confirmLabel: 'Archive', tone: 'danger' }))
      void run(`arc:${c.id}`, 'table', () => partnerApi.archiveChannel(c.id));
  };

  const clicks = d?.totals.clicks ?? 0;
  const signups = d?.totals.signups ?? 0;
  const converted = d?.totals.converted ?? 0;
  const customCodes = d?.codes.filter(c => !c.isPrimary) ?? [];
  const canAddCode = !!d && d.codes.length < d.limits.maxCodes;
  const liveChannels = d?.channels.filter(c => c.slug).length ?? 0;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="My link"
      pageSubtitle="Anyone who signs up through your link or with your code counts as your client, for good">
      <div className="x-page" data-testid="partner-link">
        {gate ? <PartnerGate reason={gate} onApplied={() => {}} /> : <>
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!d && !error && <div className="x-skel ac-sk-320" />}

          {d && <>
            <div className="ac-lk">
              <section className="x-card ac-lk-main">
                <div className="x-ch"><h2>Referral link</h2><div className="x-r"><span className="x-tag x-tag--g ac-st-pill"><i />Tracking</span></div></div>
                <div className="ac-lk-body">
                  <div className="ac-lk-l">
                    <LinkBox url={d.baseUrl} testId="link-copy" />
                    <ShareRow url={d.baseUrl} />
                    <div className="x-strip ac-strip3">
                      <div><span>Clicks</span><b className="m">{n(clicks)}</b></div>
                      <div><span>Signups</span><b className="m">{n(signups)}</b></div>
                      <div><span>Conversion</span><b className="m">{pct(converted, clicks)}</b></div>
                    </div>
                  </div>
                  <Qr url={d.baseUrl} id="pt-qr-main" size={148} />
                </div>
              </section>

              <section className="x-card ac-lk-code">
                <div className="x-ch"><h2>Signup codes</h2><span className="x-sub"><span className="m">{d.codes.length}</span> of <span className="m">{d.limits.maxCodes}</span></span></div>
                <div className="x-inset ac-code">
                  <b className="m">{d.partner.code}</b>
                  <CopyButton text={d.partner.code} label="Copy" className="x-btn x-btn--sm" testId="code-copy" />
                </div>
                <p className="ac-p">People who don&rsquo;t click your link can type a code in the referral code box when they sign up. Every code counts exactly like your link.</p>
                {customCodes.length > 0 && (
                  <ul className="ac-codes">
                    {customCodes.map(c => (
                      <li key={c.id}>
                        <span><b className="m">{c.code}</b><small><span className="m">{n(c.clicks)}</span> clicks · <span className="m">{n(c.signups)}</span> signups</small></span>
                        <CopyButton text={c.url} label="Link" className="x-btn x-btn--sm" />
                        <button type="button" className="x-btn x-btn--sm x-btn--ghost" disabled={busy === `rel:${c.id}`} onClick={() => release(c)}>Release</button>
                      </li>
                    ))}
                  </ul>
                )}
                {canAddCode ? (
                  <form className="ac-inline-form" onSubmit={reserve}>
                    <input className="x-input m" value={newCode} maxLength={20} onChange={e => setNewCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase())} placeholder="Add a custom code" aria-label="Custom code" data-testid="code-input" />
                    <button type="submit" className="x-btn x-btn--hi" disabled={newCode.length < 3 || busy === 'code'}>{busy === 'code' ? 'Saving…' : 'Reserve'}</button>
                  </form>
                ) : <p className="ac-p x-dim">You&rsquo;re holding the most codes allowed. Release one to add another.</p>}
                {formError?.form === 'code' && <div className="x-banner x-banner--err" role="alert"><span>{formError.text}</span></div>}
                <ul className="ac-rules">
                  <li>The first partner a person signs up with keeps them.</li>
                  <li>A typed code beats a link they clicked earlier.</li>
                  <li>Link clicks are remembered for {d.partner.cookieDays} days.</li>
                </ul>
              </section>
            </div>

            <ChannelTable channels={d.channels} withLinks onArchive={archive} right={
              !adding ? <button type="button" className="x-btn x-btn--sm" onClick={() => setAdding(true)} disabled={liveChannels >= d.limits.maxChannels} data-testid="channel-add"><IPlus size={14} />New channel link</button> : null
            } />
            {formError?.form === 'table' && <div className="x-banner x-banner--err" role="alert"><span>{formError.text}</span></div>}
            {adding && (
              <form className="x-card ac-add" onSubmit={addChannel}>
                <div className="x-field">
                  <label htmlFor="ch-label">Channel name</label>
                  <input id="ch-label" className="x-input" autoFocus maxLength={40} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. YouTube, pinned comment" />
                  {formError?.form === 'channel'
                    ? <span className="x-err">{formError.text}</span>
                    : <span className="x-help">You&rsquo;ll get a separate link, so you can see which post or group brings people in. <span className="m">{liveChannels}</span> of <span className="m">{d.limits.maxChannels}</span> used.</span>}
                </div>
                <div className="ac-add-btns">
                  <button type="button" className="x-btn" onClick={() => { setAdding(false); setLabel(''); setFormError(null); }}>Cancel</button>
                  <button type="submit" className="x-btn x-btn--hi" disabled={!label.trim() || busy === 'channel'}>{busy === 'channel' ? 'Creating…' : 'Create link'}</button>
                </div>
              </form>
            )}

            <section className="x-card" data-testid="recent-clicks">
              <div className="x-ch"><h2>Recent clicks</h2></div>
              {d.recentClicks.length === 0 ? <div className="x-empty"><b>No clicks yet</b><p>Share your link. Each click shows up here.</p></div> : (
                <div className="x-tblwrap ac-scroll">
                  <table className="x-tbl ac-tbl ac-clicks">
                    <thead><tr><th>When</th><th>Channel</th><th>Device</th><th>Country</th><th className="n">Result</th></tr></thead>
                    <tbody>{d.recentClicks.map(c => (
                      <tr key={c.id}>
                        <td className="x-muted">{timeAgo(c.at)}</td><td>{c.channel}</td><td>{c.device}</td><td>{c.country ? place(null, c.country) : <span className="x-dim">—</span>}</td>
                        <td className="n">{c.converted ? <span className="x-tag x-tag--g">Signed up</span> : <span className="x-dim">—</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
          </>}
        </>}
      </div>
      {dialog}
    </AppShell>
  );
}
