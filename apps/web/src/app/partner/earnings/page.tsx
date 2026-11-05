'use client';

// IB commission the partner's brokers report (postback, API or uploaded report).
// TRADElogs doesn't take payments or pay partners: brokers pay IB commission directly.
import { useCallback, useEffect, useState } from 'react';
import { Coins } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { PartnerApiError } from '@/lib/partner-api';
import { ibApi, money, type Earnings } from '@/lib/ib-api';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v6/account/partner-gate';
import { day } from '@/components/v6/account/partner-parts';
import { MonthBars } from '@/components/v6/account/ib-charts';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';

export default function PartnerEarningsPage() {
  const { accounts, selected, select } = useAccounts();
  const [d, setD] = useState<Earnings | null>(null);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setD(await ibApi.earnings()); setError(''); }
    catch (e) {
      if (e instanceof PartnerApiError && GATE_CODES.includes(e.code)) setGate(e.code as GateReason);
      else setError(e instanceof Error ? e.message : 'Could not load your earnings.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Earnings"
      pageSubtitle="IB commission your brokers report">
      <div className="x-page" data-testid="partner-earnings">
        {gate ? <PartnerGate reason={gate} onApplied={() => {}} /> : <>
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!d && !error && <><div className="x-skel ad-sk-strip" /><div className="x-skel ac-sk-320" /></>}
          {d && <>
            <div className="x-strip x-strip--card ib-adm-strip ib-money" aria-label="IB commission">
              <div><span><Coins size={14} weight="duotone" /> IB commission</span><b className="m">{money(d.ib.total).replace('+', '')}</b><small className="ad-small">{d.ib.currency} · as your brokers report it</small></div>
            </div>

            <section className="x-card" data-testid="earnings-ib">
              <div className="x-ch"><h2>IB commission by month</h2><span className="x-sub">paid to you by your brokers</span></div>
              {d.ib.byMonth.length
                ? <MonthBars data={d.ib.byMonth.map(m => ({ label: m.month, value: m.amount }))} format={v => `${d.ib.currency} ${v.toFixed(2)}`} />
                : <EmptyState compact icon="report" title="No commission reported yet">Set up your broker&rsquo;s postback, connect its API, or upload a commission report on the Brokers page.</EmptyState>}
              {d.ib.recent.length > 0 && (
                <div className="x-tblwrap"><table className="x-tbl ad-tbl ib-tbl"><thead><tr><th>Date</th><th>Account</th><th>Source</th><th className="n">Amount</th></tr></thead>
                  <tbody>{d.ib.recent.map(e => <tr key={e.id}><td className="x-muted">{day(e.at)}</td><td className="m">{e.accountId ?? '—'}</td><td className="x-muted">{e.source.toLowerCase()}</td><td className="n m">{e.amount.toFixed(2)} {e.currency}</td></tr>)}</tbody></table></div>
              )}
            </section>
          </>}
        </>}
      </div>
    </AppShell>
  );
}
