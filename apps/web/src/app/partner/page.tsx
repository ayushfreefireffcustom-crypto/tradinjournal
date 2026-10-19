'use client';

// Partner overview: how the partner's link is performing — clicks through to
// active traders — plus channels, recent activity and the newest clients.
// Tracking only; the programme has no earnings. Non-partners see the gate.
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { invalidateAccessCache } from '@/lib/use-platform-access';
import { partnerApi, PartnerApiError, type PartnerOverview, type PartnerRange } from '@/lib/partner-api';
import { IArrowRight } from '@/components/v3/icons';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v3/partner-gate';
import {
  ActivityFeed, ChannelTable, ClientRows, CopyButton, Funnel, LinkBox, Qr, RangeSeg, ShareRow, TrendCard, day,
} from '@/components/v3/partner-parts';

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function PartnerOverviewPage() {
  const { accounts, selected, select } = useAccounts();
  const [o, setO] = useState<PartnerOverview | null>(null);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState<PartnerRange>('30D');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: PartnerRange) => {
    setLoading(true); setError('');
    try {
      setO(await partnerApi.overview(r));
      setGate(null);
    } catch (e) {
      if (e instanceof PartnerApiError && GATE_CODES.includes(e.code)) setGate(e.code as GateReason);
      else setError(e instanceof Error ? e.message : 'Could not load your partner stats.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(range); }, [load, range]);

  const url = o ? `https://tradelogs.com/r/${o.partner.code}` : '';
  const first = o?.partner.name.split(' ')[0] ?? '';

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Partner" pageTitle="Overview"
      actions={o && <CopyButton text={url} label="Copy my link" className="v3-btn v3-btn--ink pt-copy-ink" testId="partner-copy-top" />}>
      <div className="v3-page" data-testid="partner-overview">
        {gate ? <PartnerGate reason={gate} onApplied={() => invalidateAccessCache()} /> : <>
          <div className="pt-head">
            <div>
              <h1 className="v3-h1">{greeting()}, <b>{first || 'partner'}.</b></h1>
              <p className="v3-sub">{o ? <>Partner since {day(o.partner.since)} · your code <b className="pt-code-inline">{o.partner.code}</b></> : 'Loading your link stats…'}</p>
            </div>
            <RangeSeg value={range} onChange={setRange} />
          </div>

          {error && <div className="v3-card d-empty" role="alert"><b>Couldn&rsquo;t load partner stats</b>{error}</div>}
          {!o && !error && <><div className="skel d-sk" style={{ height: 168 }} /><div className="skel d-sk" style={{ height: 320 }} /></>}

          {o && <div className={loading ? 'pt-refreshing' : ''}>
            <div className="pt-stack">
              <Funnel f={o.funnel} rule={o.partner.activeRule} />
              <div className="pt-g2">
                <TrendCard daily={o.daily} />
                <section className="v3-card pt-sharecard" data-testid="partner-share">
                  <div className="v3-ch"><h3>Share your link</h3><Link href="/partner/link">Manage <IArrowRight size={14} /></Link></div>
                  <div className="pt-sharebody">
                    <LinkBox url={url} testId="partner-copy-link" />
                    <p className="pt-codeline">Or they can type <b>{o.partner.code}</b> in the referral box at signup.</p>
                    <ShareRow url={url} />
                    <Qr url={url} id="pt-qr-ov" size={112} />
                  </div>
                </section>
              </div>
              <div className="pt-g3">
                <ChannelTable channels={o.channels} right={<Link href="/partner/link">Add a channel link <IArrowRight size={14} /></Link>} />
                <ActivityFeed events={o.activity} />
              </div>
              <section className="v3-card a-flush" data-testid="partner-recent-clients">
                <div className="v3-ch"><h3>Newest clients<span> · {o.totalClients} total</span></h3><Link href="/partner/clients">All clients <IArrowRight size={14} /></Link></div>
                {o.recentClients.length ? <ClientRows clients={o.recentClients} /> : <div className="d-empty"><b>No clients yet</b>Share your link to get started.</div>}
              </section>
            </div>
          </div>}
        </>}
      </div>
    </AppShell>
  );
}
