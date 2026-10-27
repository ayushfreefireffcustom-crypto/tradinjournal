'use client';

// The partner's link, codes (primary + custom) and per-channel tracked links,
// with the most recent clicks so they can see what's landing.
import { useCallback, useEffect, useState } from 'react';
import AppShell, { timeAgo } from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { partnerApi, PartnerApiError, type PartnerChannel, type PartnerCode, type PartnerLinks } from '@/lib/partner-api';
import { IPlus } from '@/components/v3/icons';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v3/partner-gate';
import { ChannelTable, CopyButton, LinkBox, Qr, ShareRow, n, pct, place } from '@/components/v3/partner-parts';
import { useConfirm } from '@/components/v3/confirm-dialog';

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
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Partner" pageTitle="My link">
      <div className="v3-page" data-testid="partner-link">
        {gate ? <PartnerGate reason={gate} onApplied={() => {}} /> : <>
          <div>
            <h1 className="v3-h1">My <b>link.</b></h1>
            <p className="v3-sub">Anyone who signs up through your link or with your code is counted as your client — for good.</p>
          </div>
          {error && <div className="v3-card d-empty" role="alert"><b>Something went wrong</b>{error}</div>}
          {!d && !error && <div className="skel d-sk" style={{ height: 300 }} />}

          {d && <>
            <div className="pt-lk">
              <section className="v3-card pt-lk-main">
                <div className="v3-ch"><h3>Referral link</h3><span className="v3-pill g pt-st"><i />Tracking</span></div>
                <div className="pt-lk-body">
                  <div className="pt-lk-l">
                    <LinkBox url={d.baseUrl} testId="link-copy" />
                    <ShareRow url={d.baseUrl} />
                    <div className="pt-lk-stats">
                      <div><span>Clicks</span><b className="num">{n(clicks)}</b></div>
                      <div><span>Signups</span><b className="num">{n(signups)}</b></div>
                      <div><span>Conversion</span><b className="num">{pct(converted, clicks)}</b></div>
                    </div>
                  </div>
                  <Qr url={d.baseUrl} id="pt-qr-main" size={148} />
                </div>
              </section>

              <section className="v3-card pt-lk-code">
                <div className="v3-ch"><h3>Signup codes</h3><span className="mute pt-count">{d.codes.length} of {d.limits.maxCodes}</span></div>
                <div className="pt-code">
                  <b>{d.partner.code}</b>
                  <CopyButton text={d.partner.code} label="Copy" className="v3-btn v3-btn--o pt-copy-sm" testId="code-copy" />
                </div>
                <p>People who don&rsquo;t click your link can type a code in the <i>Referral code</i> box when they sign up. Every code counts exactly like your link.</p>
                {customCodes.length > 0 && (
                  <ul className="pt-codes">
                    {customCodes.map(c => (
                      <li key={c.id}>
                        <b>{c.code}</b><span className="mute">{n(c.clicks)} clicks · {n(c.signups)} signups</span>
                        <CopyButton text={c.url} label="Link" className="v3-btn v3-btn--o pt-copy-sm" />
                        <button type="button" className="pt-rowbtn" disabled={busy === `rel:${c.id}`} onClick={() => release(c)}>Release</button>
                      </li>
                    ))}
                  </ul>
                )}
                {canAddCode ? (
                  <form className="pt-reserve" onSubmit={reserve}>
                    <input value={newCode} maxLength={20} onChange={e => setNewCode(e.target.value.replace(/[^A-Za-z0-9_-]/g, '').toUpperCase())} placeholder="Add a custom code" aria-label="Custom code" data-testid="code-input" />
                    <button type="submit" className="v3-btn v3-btn--ink pt-copy-ink" disabled={newCode.length < 3 || busy === 'code'}>{busy === 'code' ? 'Saving…' : 'Reserve'}</button>
                  </form>
                ) : <p className="mute pt-small">You&rsquo;re holding the most codes allowed. Release one to add another.</p>}
                {formError?.form === 'code' && <p className="pt-err" role="alert">{formError.text}</p>}
                <ul className="pt-rules">
                  <li>The first partner a person signs up with keeps them.</li>
                  <li>A typed code beats a link they clicked earlier.</li>
                  <li>Link clicks are remembered for {d.partner.cookieDays} days.</li>
                </ul>
              </section>
            </div>

            <ChannelTable channels={d.channels} withLinks onArchive={archive} right={
              !adding ? <button className="v3-btn v3-btn--o" onClick={() => setAdding(true)} disabled={liveChannels >= d.limits.maxChannels} data-testid="channel-add"><IPlus size={15} />New channel link</button> : null
            } />
            {formError?.form === 'table' && <p className="pt-err" role="alert">{formError.text}</p>}
            {adding && (
              <form className="v3-card pt-add" onSubmit={addChannel}>
                <div>
                  <label htmlFor="ch-label">Channel name</label>
                  <input id="ch-label" autoFocus maxLength={40} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. YouTube — pinned comment" />
                  <small>{formError?.form === 'channel' ? <span className="pt-err">{formError.text}</span> : <>You&rsquo;ll get a separate link, so you can see which post or group brings people in. {liveChannels} of {d.limits.maxChannels} used.</>}</small>
                </div>
                <div className="pt-add-btns">
                  <button type="button" className="v3-btn v3-btn--o" onClick={() => { setAdding(false); setLabel(''); setFormError(null); }}>Cancel</button>
                  <button type="submit" className="v3-btn v3-btn--acc" disabled={!label.trim() || busy === 'channel'}>{busy === 'channel' ? 'Creating…' : 'Create link'}</button>
                </div>
              </form>
            )}

            <section className="v3-card a-flush" data-testid="recent-clicks">
              <div className="v3-ch"><h3>Recent clicks</h3></div>
              {d.recentClicks.length === 0 ? <div className="d-empty"><b>No clicks yet</b>Share your link — each click shows up here.</div> : (
                <div className="v3-tbl-wrap">
                  <table className="v3-table pt-clicks">
                    <thead><tr><th>When</th><th>Channel</th><th>Device</th><th>Country</th><th className="r">Result</th></tr></thead>
                    <tbody>{d.recentClicks.map(c => (
                      <tr key={c.id} className="static">
                        <td className="mute">{timeAgo(c.at)}</td><td>{c.channel}</td><td>{c.device}</td><td>{c.country ? place(null, c.country) : <span className="mute">—</span>}</td>
                        <td className="r">{c.converted ? <span className="v3-pill g">Signed up</span> : <span className="mute">—</span>}</td>
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
