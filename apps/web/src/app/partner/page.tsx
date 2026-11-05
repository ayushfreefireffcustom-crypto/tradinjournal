'use client';

// Partner overview: how the partner's link is performing — clicks through to
// active traders — plus channels, recent activity and the newest clients.
// Tracking only; the programme has no earnings. Non-partners see the gate.
import Link from '@/components/v6/ui/link';
import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { invalidateAccessCache } from '@/lib/use-platform-access';
import { partnerApi, PartnerApiError, type PartnerOverview, type RangeSel } from '@/lib/partner-api';
import { IArrowRight } from '@/components/v6/icons';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/lux.css';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v6/account/partner-gate';
import {
  ActivityFeed, ChannelTable, ClientRows, CopyButton, Funnel, LinkBox, Qr, RangeSeg, rangeLabel, ShareRow, TrendCard, day,
} from '@/components/v6/account/partner-parts';
import { AttentionCard, BrokerHealthRow, IbClientRows, IbFunnelCard, TradingCard } from '@/components/v6/account/ib-parts';
import '@/styles/v6/account.css';


function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function PartnerOverviewPage() {
  const { accounts, selected, select } = useAccounts();
  const [o, setO] = useState<PartnerOverview | null>(null);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState<RangeSel>('30D');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r: RangeSel) => {
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

  // The server builds links from APP_URL, so staging/preview links point at themselves.
  const url = o ? (o.channels.find(c => c.slug === null)?.url ?? `https://tradelogs.com/r/${o.partner.code}`) : '';
  const first = o?.partner.name.split(' ')[0] ?? '';

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Partner overview"
      pageSubtitle={gate ? 'Partner programme' : o ? <>{greeting()}, {first || 'partner'} · partner since {day(o.partner.since)} · code <span className="m">{o.partner.code}</span></> : 'Loading your link stats…'}
      actions={o && !gate ? <>
        <RangeSeg value={range} onChange={setRange} />
        <CopyButton text={url} label="Copy my link" className="x-btn x-btn--hi" testId="partner-copy-top" />
      </> : null}>
      <div className="x-page" data-testid="partner-overview">
        {gate ? <PartnerGate reason={gate} onApplied={() => invalidateAccessCache()} /> : <>
          {error && <div className="x-banner x-banner--err" role="alert"><span>Couldn&rsquo;t load partner stats. {error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load(range)}>Retry</button></div>}
          {!o && !error && <><div className="x-skel ac-sk-168" /><div className="x-skel ac-sk-320" /></>}

          {o && (
            <div className={`x-page ${loading ? 'ac-refreshing' : ''}`}>
              {o.ib ? <IbFunnelCard f={o.ib.funnel} rule={o.partner.activeRule} sub={rangeLabel(range)} /> : <Funnel f={o.funnel} rule={o.partner.activeRule} />}
              {o.ib && (
                <div className="ib-grid3">
                  <TradingCard t={o.ib.trading} />
                  <AttentionCard a={o.ib.needsAttention} links={{ brokers: '/partner/brokers', clients: '/partner/clients' }} />
                </div>
              )}
              {o.ib && (
                <section className="x-card" data-testid="partner-ib-brokers">
                  <div className="x-ch"><h2>Broker lists</h2><span className="x-sub"><span className="m">{o.ib.packages.live}</span> live package{o.ib.packages.live === 1 ? '' : 's'} · <span className="m">{o.ib.packages.holders}</span> client{o.ib.packages.holders === 1 ? '' : 's'} unlocked</span>
                    <div className="x-r"><Link href="/partner/packages" className="x-btn x-btn--sm x-btn--ghost">Packages <IArrowRight size={14} /></Link><Link href="/partner/brokers" className="x-btn x-btn--sm x-btn--ghost">Brokers <IArrowRight size={14} /></Link></div></div>
                  {o.ib.brokers.length
                    ? <ul className="ib-brs">{o.ib.brokers.map(b => <BrokerHealthRow key={b.id} b={b} />)}</ul>
                    : <EmptyState compact icon="plug" title="Connect your broker">Add the broker you&rsquo;re an IB with and upload its client list, so we can confirm which signups opened accounts under you.</EmptyState>}
                </section>
              )}
              <div className="ac-g2">
                <TrendCard daily={o.daily} />
                <section className="x-card ac-sharecard" data-testid="partner-share">
                  <div className="x-ch"><h2>Share your link</h2><div className="x-r"><Link href="/partner/link" className="x-btn x-btn--sm x-btn--ghost">Manage <IArrowRight size={14} /></Link></div></div>
                  <LinkBox url={url} testId="partner-copy-link" />
                  <p className="ac-codeline">Or they can type <b className="m">{o.partner.code}</b> in the referral box at signup.</p>
                  <ShareRow url={url} />
                  <Qr url={url} id="pt-qr-ov" size={112} />
                </section>
              </div>
              <div className="ac-g3">
                <ChannelTable channels={o.channels} right={<Link href="/partner/link" className="x-btn x-btn--sm x-btn--ghost">Add a channel link <IArrowRight size={14} /></Link>} />
                <ActivityFeed events={o.activity} />
              </div>
              <section className="x-card" data-testid="partner-recent-clients">
                <div className="x-ch"><h2>Newest clients</h2><span className="x-sub"><span className="m">{o.totalClients}</span> total</span><div className="x-r"><Link href="/partner/clients" className="x-btn x-btn--sm x-btn--ghost">All clients <IArrowRight size={14} /></Link></div></div>
                {o.recentClients.length ? (o.ib ? <IbClientRows clients={o.recentClients} /> : <ClientRows clients={o.recentClients} />) : <div className="x-empty"><b>No clients yet</b><p>Share your link to get started.</p></div>}
              </section>
            </div>
          )}
        </>}
      </div>
    </AppShell>
  );
}
