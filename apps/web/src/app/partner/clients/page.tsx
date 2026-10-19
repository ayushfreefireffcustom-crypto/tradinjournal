'use client';

// Everyone who signed up through the partner's link or code. Partners see
// name, location and activity level — never balances, P&L or trade details.
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { partnerApi, STATUS_LABEL, type PartnerOverview, type ReferralStatus } from '@/lib/partner-api';
import { ISearch, ILock } from '@/components/v3/icons';
import { ClientRows, n, pct } from '@/components/v3/partner-parts';

const PAGE = 12;
type Filter = 'ALL' | ReferralStatus;
type Sort = 'recent' | 'trades' | 'name';

export default function PartnerClientsPage() {
  const { accounts, selected, select } = useAccounts();
  const [o, setO] = useState<PartnerOverview | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [channel, setChannel] = useState('ALL');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let alive = true;
    partnerApi.overview().then(d => alive && setO(d)).catch(e => alive && setError(e instanceof Error ? e.message : 'Could not load your clients.'));
    return () => { alive = false; };
  }, []);
  useEffect(() => { setPage(0); }, [q, filter, channel, sort]);

  const all = o?.clients ?? [];
  const count = (s: ReferralStatus) => all.filter(c => c.status === s).length;
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = all.filter(c => (filter === 'ALL' || c.status === filter) && (channel === 'ALL' || c.channel === channel)
      && (!term || `${c.name} ${c.city} ${c.country}`.toLowerCase().includes(term)));
    if (sort === 'trades') list.sort((a, b) => b.trades30d - a.trades30d);
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [all, q, filter, channel, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const tiles: { k: Filter; l: string; v: number; s: string; c: string }[] = [
    { k: 'ALL', l: 'All clients', v: all.length, s: `${pct(all.length - count('SIGNED_UP'), all.length)} connected MT5`, c: '' },
    { k: 'SIGNED_UP', l: 'Not connected yet', v: count('SIGNED_UP'), s: 'Signed up, no broker linked', c: 'n' },
    { k: 'ACTIVE', l: 'Active traders', v: count('ACTIVE'), s: o ? `${o.partner.activeRule.minTrades}+ trades in ${o.partner.activeRule.windowDays} days` : '', c: 'g' },
    { k: 'INACTIVE', l: 'Gone inactive', v: count('INACTIVE'), s: 'Worth a nudge', c: 'a' },
  ];

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Partner" pageTitle="Clients">
      <div className="v3-page" data-testid="partner-clients">
        <div>
          <h1 className="v3-h1">My <b>clients.</b></h1>
          <p className="v3-sub">Everyone who signed up through your link or code.</p>
        </div>

        <div className="pt-tiles" role="group" aria-label="Filter by status">
          {tiles.map(t => (
            <button key={t.k} className={`v3-card pt-tile ${t.c} ${filter === t.k ? 'on' : ''}`} aria-pressed={filter === t.k} onClick={() => setFilter(t.k)}>
              <span className="l"><i />{t.l}</span><b className="num">{o ? n(t.v) : '—'}</b><span className="s">{t.s}</span>
            </button>
          ))}
        </div>

        <section className="v3-card a-flush pt-list">
          <div className="pt-toolbar">
            <label className="pt-search"><ISearch size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or city…" aria-label="Search clients" data-testid="clients-search" /></label>
            <div className="v3-seg sm" role="group" aria-label="Status">
              {(['ALL', 'SIGNED_UP', 'CONNECTED', 'ACTIVE', 'INACTIVE'] as Filter[]).map(k => (
                <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === 'ALL' ? 'All' : STATUS_LABEL[k]}</button>
              ))}
            </div>
            <div className="pt-selects">
              <select value={channel} onChange={e => setChannel(e.target.value)} aria-label="Channel" className="pt-select">
                <option value="ALL">All channels</option>
                {o?.channels.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
              </select>
              <select value={sort} onChange={e => setSort(e.target.value as Sort)} aria-label="Sort" className="pt-select">
                <option value="recent">Newest first</option><option value="trades">Most trades</option><option value="name">Name A–Z</option>
              </select>
            </div>
          </div>
          {error ? <div className="d-empty" role="alert"><b>Couldn&rsquo;t load clients</b>{error}</div>
            : !o ? <div className="skel d-sk" style={{ height: 420, margin: 16 }} />
            : rows.length === 0 ? <div className="d-empty d-empty--lg"><b>{all.length ? 'No clients match' : 'No clients yet'}</b>{all.length ? 'Try a different search or filter.' : 'Share your referral link to get started.'}</div>
            : <ClientRows clients={rows.slice(page * PAGE, page * PAGE + PAGE)} />}
          {o && rows.length > 0 && (
            <div className="pt-pager">
              <span>{page * PAGE + 1}–{Math.min(rows.length, page * PAGE + PAGE)} of {rows.length}</span>
              <div><button className="v3-btn v3-btn--o" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</button><button className="v3-btn v3-btn--o" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next</button></div>
            </div>
          )}
        </section>

        <p className="pt-privacy"><ILock size={14} /> You see each client&rsquo;s name, city and how actively they trade. You never see their email, balance, P&amp;L or individual trades.</p>
      </div>
    </AppShell>
  );
}
