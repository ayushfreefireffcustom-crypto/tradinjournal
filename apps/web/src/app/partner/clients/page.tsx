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
import { ISearch, ILock } from '@/components/v3/icons';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v3/partner-gate';
import { ClientRows, n, pct } from '@/components/v3/partner-parts';

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
    { k: 'SIGNED_UP', l: 'Not connected yet', v: c.SIGNED_UP, s: 'Signed up, no broker linked', cls: 'n' },
    { k: 'ACTIVE', l: 'Active traders', v: c.ACTIVE, s: rule ? `${rule.minTrades}+ trades in ${rule.windowDays} days` : 'Trading regularly', cls: 'g' },
    { k: 'INACTIVE', l: 'Gone inactive', v: c.INACTIVE, s: 'Worth a nudge', cls: 'a' },
  ] : [];
  const meta = data?.meta;

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={select} crumbParent="Partner" pageTitle="Clients">
      <div className="v3-page" data-testid="partner-clients">
        {gate ? <PartnerGate reason={gate} onApplied={() => {}} /> : <>
          <div>
            <h1 className="v3-h1">My <b>clients.</b></h1>
            <p className="v3-sub">Everyone who signed up through your link or code.</p>
          </div>

          <div className="pt-tiles" role="group" aria-label="Filter by status">
            {c ? tiles.map(t => (
              <button key={t.k} className={`v3-card pt-tile ${t.cls} ${filter === t.k ? 'on' : ''}`} aria-pressed={filter === t.k} onClick={() => setFilter(t.k)}>
                <span className="l"><i />{t.l}</span><b className="num">{n(t.v)}</b><span className="s">{t.s}</span>
              </button>
            )) : [0, 1, 2, 3].map(i => <div key={i} className="skel d-sk" style={{ height: 112 }} />)}
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
                  <option value="">All channels</option>
                  {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.label}</option>)}
                </select>
                <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort" className="pt-select">
                  <option value="recent">Newest first</option><option value="trades">Most trades</option><option value="name">Name A–Z</option>
                </select>
              </div>
            </div>
            {error ? <div className="d-empty" role="alert"><b>Couldn&rsquo;t load clients</b>{error}</div>
              : !data ? <div className="skel d-sk" style={{ height: 420, margin: 16 }} />
              : data.items.length === 0 ? <div className="d-empty d-empty--lg"><b>{data.counts.all ? 'No clients match' : 'No clients yet'}</b>{data.counts.all ? 'Try a different search or filter.' : 'Share your referral link to get started.'}</div>
              : <ClientRows clients={data.items} />}
            {meta && meta.total > 0 && (
              <div className="pt-pager">
                <span>{(meta.page - 1) * meta.pageSize + 1}–{Math.min(meta.total, meta.page * meta.pageSize)} of {n(meta.total)}</span>
                <div><button className="v3-btn v3-btn--o" disabled={meta.page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button className="v3-btn v3-btn--o" disabled={meta.page >= meta.totalPages} onClick={() => setPage(p => p + 1)}>Next</button></div>
              </div>
            )}
          </section>

          <p className="pt-privacy"><ILock size={14} /> You see each client&rsquo;s name, city and how actively they trade. You never see their email, balance, P&amp;L or individual trades.</p>
        </>}
      </div>
    </AppShell>
  );
}
