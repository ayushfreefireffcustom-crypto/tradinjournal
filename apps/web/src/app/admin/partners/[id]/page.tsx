'use client';

// Admin view of one partner: the same funnel, trend and channels the partner
// sees, their full client list, and controls to pause or resume tracking.
import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { partnerApi, type AdminPartnerDetail, type PartnerStatus } from '@/lib/partner-api';
import { IArrowLeft } from '@/components/v3/icons';
import { ActivityFeed, Avatar, ChannelTable, ClientRows, Funnel, RANGES, TrendCard, day, funnelFor, type PRange } from '@/components/v3/partner-parts';

const ST: Record<PartnerStatus, [string, string]> = { ACTIVE: ['g', 'Active'], PENDING: ['a', 'Pending'], PAUSED: ['n', 'Paused'] };
const PAGE = 10;
const RANGE_LABEL: Record<PRange, string> = { '7D': 'last 7 days', '30D': 'last 30 days', '90D': 'last 90 days', ALL: 'all time' };

export default function AdminPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { accounts, selected, select } = useAccounts();
  const [d, setD] = useState<AdminPartnerDetail | null>(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState<PRange>('ALL');
  const [status, setStatus] = useState<PartnerStatus | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    partnerApi.adminDetail(id).then(x => { if (alive) { setD(x); setStatus(x.admin.status); } })
      .catch(e => alive && setError(e instanceof Error ? e.message : 'Could not load this partner.'));
    return () => { alive = false; };
  }, [id]);
  const f = useMemo(() => (d ? funnelFor(d, range) : null), [d, range]);

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Admin / Partners" pageTitle={d?.admin.name ?? 'Partner'}>
      <div className="v3-page" data-testid="admin-partner">
        <Link href="/admin/partners" className="v3-link pt-back"><IArrowLeft size={14} /> All partners</Link>
        {error && <div className="v3-card d-empty" role="alert"><b>Couldn&rsquo;t load partner</b>{error}</div>}
        {!d && !error && <div className="skel d-sk" style={{ height: 420 }} />}

        {d && f && status && <>
          <section className="v3-card pt-prof">
            <Avatar name={d.admin.name} size={56} />
            <div className="who">
              <h1>{d.admin.name} <span className={`v3-pill ${ST[status][0]} pt-st`}><i />{ST[status][1]}</span></h1>
              <p>{d.admin.email} · {d.admin.audience}</p>
            </div>
            <dl>
              <div><dt>Code</dt><dd><code className="pt-c">{d.admin.code}</code></dd></div>
              <div><dt>Link</dt><dd>tradelogs.com/r/{d.admin.code}</dd></div>
              <div><dt>Partner since</dt><dd>{day(d.admin.joinedAt)}</dd></div>
            </dl>
            <div className="btns">
              {status === 'PAUSED'
                ? <button className="v3-btn v3-btn--ink" onClick={() => setStatus('ACTIVE')}>Resume tracking</button>
                : <button className="v3-btn v3-btn--o" onClick={() => setStatus('PAUSED')}>Pause tracking</button>}
            </div>
          </section>

          <div className="pt-head">
            <h2 className="pt-h2">Performance</h2>
            <div className="v3-seg sm" role="group" aria-label="Date range">
              {RANGES.map(([k]) => <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{k === 'ALL' ? 'All' : k}</button>)}
            </div>
          </div>
          <Funnel f={f} rule={d.partner.activeRule} rangeLabel={RANGE_LABEL[range]} title="Funnel" />
          <div className="pt-g3">
            <TrendCard o={d} from={f.from || new Date(d.daily[0]!.date).getTime()} />
            <ActivityFeed events={d.activity} limit={7} />
          </div>
          <ChannelTable channels={d.channels} withLinks />
          <section className="v3-card a-flush">
            <div className="v3-ch"><h3>Clients<span> · {d.clients.length}</span></h3></div>
            {d.clients.length ? <>
              <ClientRows clients={d.clients.slice(page * PAGE, page * PAGE + PAGE)} />
              <div className="pt-pager">
                <span>{page * PAGE + 1}–{Math.min(d.clients.length, page * PAGE + PAGE)} of {d.clients.length}</span>
                <div><button className="v3-btn v3-btn--o" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><button className="v3-btn v3-btn--o" disabled={(page + 1) * PAGE >= d.clients.length} onClick={() => setPage(p => p + 1)}>Next</button></div>
              </div>
            </> : <div className="d-empty"><b>No clients yet</b>Nobody has signed up with this partner&rsquo;s link or code.</div>}
          </section>
        </>}
      </div>
    </AppShell>
  );
}
