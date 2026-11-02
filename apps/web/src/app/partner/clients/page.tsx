'use client';

// Everyone who signed up through the partner's link or code. Partners see
// name, location and activity level — never email, balances, P&L or trades.
// Filtering, search and paging run on the server.
import { useEffect, useRef, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import {
  partnerApi, PartnerApiError, STATUS_LABEL, type ClientsPage, type ClientsQuery, type PartnerChannel, type ReferralStatus,
} from '@/lib/partner-api';
import { ISearch, ILock } from '@/components/v6/icons';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v6/account/partner-gate';
import { ClientRows, n, pct } from '@/components/v6/account/partner-parts';
import '@/styles/v6/account.css';

const PAGE = 12;
type Filter = 'ALL' | ReferralStatus;

export default function PartnerClientsPage() {
  const { accounts, selected, select } = useAccounts();
  const [data, setData] = useState<ClientsPage | null>(null);
  const [channels, setChannels] = useState<PartnerChannel[]>([]);
  const [rule, setRule] = useState<{ minTrades: number; windowDays: number } | null>(null);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [channel, setChannel] = useState('');
  const [sort, setSort] = useState<NonNullable<ClientsQuery['sort']>>('recent');
  const [page, setPage] = useState(1);
  const seq = useRef(0);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { setPage(1); }, [debounced, filter, channel, sort]);

  useEffect(() => {
    partnerApi.links().then(l => { setChannels(l.channels); setRule(l.partner.activeRule); }).catch(() => {});
  }, []);

  useEffect(() => {
    const id = ++seq.current;
    partnerApi.clients({ status: filter === 'ALL' ? undefined : filter, channel: channel || undefined, q: debounced || undefined, sort, page, pageSize: PAGE })
      .then(d => { if (id === seq.current) { setData(d); setError(''); } })
      .catch(e => {
        if (id !== seq.current) return;
        if (e instanceof PartnerApiError && GATE_CODES.includes(e.code)) setGate(e.code as GateReason);
        else setError(e instanceof Error ? e.message : 'Could not load your clients.');
      });
  }, [filter, channel, debounced, sort, page]);

  const c = data?.counts;
  const tiles: { k: Filter; l: string; v: number; s: string; cls: string }[] = c ? [
    { k: 'ALL', l: 'All clients', v: c.all, s: `${pct(c.all - c.SIGNED_UP, c.all)} connected MT5`, cls: '' },
    { k: 'SIGNED_UP', l: 'Not connected yet', v: c.SIGNED_UP, s: 'Signed up, no broker linked', cls: 'x-dot--off' },
    { k: 'ACTIVE', l: 'Active traders', v: c.ACTIVE, s: rule ? `${rule.minTrades}+ trades in ${rule.windowDays} days` : 'Trading regularly', cls: '' },
    { k: 'INACTIVE', l: 'Gone inactive', v: c.INACTIVE, s: 'Worth a nudge', cls: 'x-dot--r' },
  ] : [];
  const meta = data?.meta;

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Clients"
      pageSubtitle="Everyone who signed up through your link or code">
      <div className="x-page" data-testid="partner-clients">
        {gate ? <PartnerGate reason={gate} onApplied={() => {}} /> : <>
          <div className="ac-tiles" role="group" aria-label="Filter by status">
            {c ? tiles.map(t => (
              <button key={t.k} type="button" className={`x-card ac-tile ${filter === t.k ? 'on' : ''}`} aria-pressed={filter === t.k} onClick={() => setFilter(t.k)}>
                <span className="l">{t.k !== 'ALL' && <i className={`x-dot ${t.cls}`} />}{t.l}</span><b className="m">{n(t.v)}</b><small>{t.s}</small>
              </button>
            )) : [0, 1, 2, 3].map(i => <div key={i} className="x-skel ac-sk-112" />)}
          </div>

          <section className="x-card" data-testid="partner-client-list">
            <div className="ac-toolbar">
              <label className="x-search ac-tool-search"><ISearch size={15} /><input className="x-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or city" aria-label="Search clients" data-testid="clients-search" /></label>
              <div className="x-seg x-seg--sm" role="group" aria-label="Status">
                {(['ALL', 'SIGNED_UP', 'CONNECTED', 'ACTIVE', 'INACTIVE'] as Filter[]).map(k => (
                  <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>{k === 'ALL' ? 'All' : STATUS_LABEL[k]}</button>
                ))}
              </div>
              <div className="ac-selects">
                <select value={channel} onChange={e => setChannel(e.target.value)} aria-label="Channel" className="x-select">
                  <option value="">All channels</option>
                  {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.label}</option>)}
                </select>
                <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort" className="x-select">
                  <option value="recent">Newest first</option><option value="trades">Most trades</option><option value="name">Name A–Z</option>
                </select>
              </div>
            </div>
            {error ? <div className="x-banner x-banner--err" role="alert"><span>Couldn&rsquo;t load clients. {error}</span></div>
              : !data ? <div className="ad-tbl-sk ac-tbl-sk">{[0, 1, 2, 3, 4, 5].map(i => <i key={i} className="x-skel x-skel--in" />)}</div>
              : data.items.length === 0 ? <div className="x-empty"><b>{data.counts.all ? 'No clients match' : 'No clients yet'}</b><p>{data.counts.all ? 'Try a different search or filter.' : 'Share your referral link to get started.'}</p></div>
              : <ClientRows clients={data.items} />}
            {meta && meta.total > 0 && (
              <div className="ac-pager">
                <span><span className="m">{(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.total, meta.page * meta.pageSize)}</span> of <span className="m">{n(meta.total)}</span></span>
                <div><button type="button" className="x-btn x-btn--sm" disabled={meta.page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button type="button" className="x-btn x-btn--sm" disabled={meta.page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Next</button></div>
              </div>
            )}
          </section>

          <p className="ac-br-note"><ILock size={14} />You see each client&rsquo;s name, city and how actively they trade. You never see their email, balance, P&amp;L or individual trades.</p>
        </>}
      </div>
    </AppShell>
  );
}
