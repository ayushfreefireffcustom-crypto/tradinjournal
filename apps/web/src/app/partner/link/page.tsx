'use client';

// The partner's link, signup code and per-channel tracked links, with the
// most recent clicks so they can see what's landing.
import { useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { partnerApi, type PartnerLinks } from '@/lib/partner-api';
import { IPlus } from '@/components/v3/icons';
import { timeAgo } from '@/components/app-shell';
import { ChannelTable, CopyButton, LinkBox, Qr, ShareRow, n, pct } from '@/components/v3/partner-parts';

export default function PartnerLinkPage() {
  const { accounts, selected, select } = useAccounts();
  const [d, setD] = useState<PartnerLinks | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    partnerApi.links().then(x => alive && setD(x)).catch(e => alive && setError(e instanceof Error ? e.message : 'Could not load your links.'));
    return () => { alive = false; };
  }, []);

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !d) return;
    setSaving(true);
    try {
      const ch = await partnerApi.createChannel(label.trim());
      setD({ ...d, channels: [...d.channels.filter(c => c.id !== ch.id), ch] });
      setLabel(''); setAdding(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create that link.'); }
    finally { setSaving(false); }
  }

  const clicks = d?.channels.reduce((a, c) => a + c.clicks, 0) ?? 0;
  const signups = d?.channels.reduce((a, c) => a + c.signups, 0) ?? 0;

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Partner" pageTitle="My link">
      <div className="v3-page" data-testid="partner-link">
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
                    <div><span>Click → signup</span><b className="num">{pct(signups, clicks)}</b></div>
                  </div>
                </div>
                <Qr url={d.baseUrl} id="pt-qr-main" size={148} />
              </div>
            </section>

            <section className="v3-card pt-lk-code">
              <div className="v3-ch"><h3>Signup code</h3></div>
              <div className="pt-code">
                <b>{d.partner.code}</b>
                <CopyButton text={d.partner.code} label="Copy" className="v3-btn v3-btn--o pt-copy-sm" testId="code-copy" />
              </div>
              <p>People who don&rsquo;t click your link can type this code in the <i>Referral code</i> box when they sign up. It counts exactly like the link.</p>
              <ul className="pt-rules">
                <li>The first partner a person signs up with keeps them.</li>
                <li>A typed code beats a link they clicked earlier.</li>
                <li>Clicks are remembered for 30 days.</li>
              </ul>
            </section>
          </div>

          <ChannelTable channels={d.channels} withLinks right={
            !adding ? <button className="v3-btn v3-btn--o" onClick={() => setAdding(true)} data-testid="channel-add"><IPlus size={15} />New channel link</button> : null
          } />
          {adding && (
            <form className="v3-card pt-add" onSubmit={addChannel}>
              <div>
                <label htmlFor="ch-label">Channel name</label>
                <input id="ch-label" autoFocus maxLength={40} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. YouTube — pinned comment" />
                <small>You&rsquo;ll get a separate link, so you can see which post or group brings people in.</small>
              </div>
              <div className="pt-add-btns">
                <button type="button" className="v3-btn v3-btn--o" onClick={() => { setAdding(false); setLabel(''); }}>Cancel</button>
                <button type="submit" className="v3-btn v3-btn--acc" disabled={!label.trim() || saving}>{saving ? 'Creating…' : 'Create link'}</button>
              </div>
            </form>
          )}

          <section className="v3-card a-flush" data-testid="recent-clicks">
            <div className="v3-ch"><h3>Recent clicks</h3></div>
            {d.recentClicks.length === 0 ? <div className="d-empty"><b>No clicks yet</b>Share your link — each click shows up here.</div> : (
              <div className="v3-tbl-wrap">
                <table className="v3-table">
                  <thead><tr><th>When</th><th>Channel</th><th>Device</th><th>Country</th><th className="r">Result</th></tr></thead>
                  <tbody>{d.recentClicks.map(c => (
                    <tr key={c.id} className="static">
                      <td className="mute">{timeAgo(c.at)}</td><td>{c.channel}</td><td>{c.device}</td><td>{c.country}</td>
                      <td className="r">{c.converted ? <span className="v3-pill g">Signed up</span> : <span className="mute">—</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>}
      </div>
    </AppShell>
  );
}
