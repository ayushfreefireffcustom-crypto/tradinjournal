'use client';

// Partner overview: how the partner's link is performing — clicks through to
// active traders — plus channels, recent activity and the newest clients.
// Tracking only; the programme has no earnings yet.
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { authClient } from '@/lib/auth-client';
import { partnerApi, type PartnerOverview } from '@/lib/partner-api';
import { IArrowRight } from '@/components/v3/icons';
import {
  ActivityFeed, ChannelTable, ClientRows, CopyButton, Funnel, LinkBox, Qr, RANGES, ShareRow, TrendCard, day, funnelFor, type PRange,
} from '@/components/v3/partner-parts';

const RANGE_LABEL: Record<PRange, string> = { '7D': 'last 7 days', '30D': 'last 30 days', '90D': 'last 90 days', ALL: 'all time' };
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function PartnerOverviewPage() {
  const { accounts, selected, select } = useAccounts();
  const { data: session } = authClient.useSession();
  const [o, setO] = useState<PartnerOverview | null>(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState<PRange>('30D');

  useEffect(() => {
    let alive = true;
    partnerApi.overview().then(d => alive && setO(d)).catch(e => alive && setError(e instanceof Error ? e.message : 'Could not load your partner stats.'));
    return () => { alive = false; };
  }, []);

  const f = useMemo(() => (o ? funnelFor(o, range) : null), [o, range]);
  const url = o ? `https://tradelogs.com/r/${o.partner.code}` : '';
  const first = (o?.partner.name ?? session?.user?.name ?? '').split(' ')[0];

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Partner" pageTitle="Overview"
      actions={o && <CopyButton text={url} label="Copy my link" className="v3-btn v3-btn--ink pt-copy-ink" testId="partner-copy-top" />}>
      <div className="v3-page" data-testid="partner-overview">
        <div className="pt-head">
          <div>
            <h1 className="v3-h1">{greeting()}, <b>{first || 'partner'}.</b></h1>
            <p className="v3-sub">{o ? <>Partner since {day(o.partner.since)} · your code <b className="pt-code-inline">{o.partner.code}</b></> : 'Loading your link stats…'}</p>
          </div>
          <div className="v3-seg" role="group" aria-label="Date range">
            {RANGES.map(([k]) => <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{k === 'ALL' ? 'All' : k}</button>)}
          </div>
        </div>

        {error && <div className="v3-card d-empty" role="alert"><b>Couldn&rsquo;t load partner stats</b>{error}</div>}
        {!o && !error && <><div className="skel d-sk" style={{ height: 168 }} /><div className="skel d-sk" style={{ height: 320 }} /></>}

        {o && f && <>
          <Funnel f={f} rule={o.partner.activeRule} rangeLabel={RANGE_LABEL[range]} />

          <div className="pt-g2">
            <TrendCard o={o} from={f.from || new Date(o.daily[0]!.date).getTime()} />
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
            <div className="v3-ch"><h3>Newest clients<span> · {o.clients.length} total</span></h3><Link href="/partner/clients">All clients <IArrowRight size={14} /></Link></div>
            {o.clients.length ? <ClientRows clients={o.clients.slice(0, 6)} /> : <div className="d-empty"><b>No clients yet</b>Share your link to get started.</div>}
          </section>
        </>}
      </div>
    </AppShell>
  );
}
