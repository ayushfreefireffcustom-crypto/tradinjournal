'use client';

// The partner's money: IB commission their brokers report, their share of package
// sales, the balance (waiting out the refund window / payable / paid), payouts and
// where payouts should go.
import { useCallback, useEffect, useState } from 'react';
import { Bank, ClockCountdown, Coins, Wallet } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { PartnerApiError } from '@/lib/partner-api';
import { cash, ibApi, money, type Earnings } from '@/lib/ib-api';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v6/account/partner-gate';
import { day, n } from '@/components/v6/account/partner-parts';
import { MonthBars } from '@/components/v6/account/ib-charts';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';

const LEDGER_TONE: Record<string, string> = { PENDING: 'ac-tag-c', PAYABLE: 'x-tag--g', PAID: '', VOID: 'x-tag--r' };
const LEDGER_LABEL: Record<string, string> = { PENDING: 'In refund window', PAYABLE: 'Payable', PAID: 'Paid out', VOID: 'Refunded' };

export default function PartnerEarningsPage() {
  const { accounts, selected, select } = useAccounts();
  const [d, setD] = useState<Earnings | null>(null);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState('');
  const [details, setDetails] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try { setD(await ibApi.earnings()); setError(''); }
    catch (e) {
      if (e instanceof PartnerApiError && GATE_CODES.includes(e.code)) setGate(e.code as GateReason);
      else setError(e instanceof Error ? e.message : 'Could not load your earnings.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Earnings"
      pageSubtitle="IB commission, package sales and payouts">
      <div className="x-page" data-testid="partner-earnings">
        {gate ? <PartnerGate reason={gate} onApplied={() => {}} /> : <>
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!d && !error && <><div className="x-skel ad-sk-strip" /><div className="x-skel ac-sk-320" /></>}
          {d && <>
            <div className="x-strip x-strip--card ib-adm-strip ib-money" aria-label="Balance">
              <div><span><Coins size={14} weight="duotone" /> IB commission reported</span><b className="m">{money(d.ib.total).replace('+', '')}</b><small className="ad-small">{d.ib.currency} · from your brokers</small></div>
              <div><span><Wallet size={14} weight="duotone" /> Package sales</span><b className="m">{cash(d.sales.grossCents, d.currency)}</b><small className="ad-small">{n(d.sales.count)} payments · you keep {d.revenueSharePct}%</small></div>
              <div><span><ClockCountdown size={14} weight="duotone" /> In refund window</span><b className="m">{cash(d.balance.pendingCents, d.currency)}</b></div>
              <div><span>Payable</span><b className="m pos">{cash(d.balance.payableCents, d.currency)}</b><small className="ad-small">paid out from {cash(d.payoutMinimumCents, d.currency)}</small></div>
              <div><span><Bank size={14} weight="duotone" /> Paid to you</span><b className="m">{cash(d.balance.paidCents, d.currency)}</b></div>
              <div><span>Your share so far</span><b className="m">{cash(d.sales.shareCents, d.currency)}</b></div>
            </div>

            <div className="ib-grid2">
              <section className="x-card" data-testid="earnings-ib">
                <div className="x-ch"><h2>IB commission by month</h2><span className="x-sub">as your brokers report it</span></div>
                {d.ib.byMonth.length
                  ? <MonthBars data={d.ib.byMonth.map(m => ({ label: m.month, value: m.amount }))} format={v => `${d.ib.currency} ${v.toFixed(2)}`} />
                  : <EmptyState compact icon="report" title="No commission reported yet">Set up your broker&rsquo;s postback, connect its API, or upload a commission report on the Brokers page.</EmptyState>}
                {d.ib.recent.length > 0 && (
                  <div className="x-tblwrap"><table className="x-tbl ad-tbl"><thead><tr><th>Date</th><th>Account</th><th>Source</th><th className="n">Amount</th></tr></thead>
                    <tbody>{d.ib.recent.map(e => <tr key={e.id}><td className="x-muted">{day(e.at)}</td><td className="m">{e.accountId ?? '—'}</td><td className="x-muted">{e.source.toLowerCase()}</td><td className="n m">{e.amount.toFixed(2)} {e.currency}</td></tr>)}</tbody></table></div>
                )}
              </section>

              <section className="x-card" data-testid="earnings-payout-details">
                <div className="x-ch"><h2>Where payouts go</h2><span className="x-sub">{d.hasPayoutDetails ? 'saved' : 'not set'}</span></div>
                <p className="ac-p">UPI id, bank account and IFSC, or a USDT address. It&rsquo;s stored encrypted and only shown to TRADElogs when a payout is ready. Saving replaces what&rsquo;s there.</p>
                <form className="ad-tool-form" onSubmit={async e => {
                  e.preventDefault();
                  try { await ibApi.payoutDetails(details.trim()); setDetails(''); setToast('Payout details saved.'); await load(); }
                  catch (x) { setToast(x instanceof Error ? x.message : 'Could not save.'); }
                }}>
                  <textarea className="x-textarea" rows={3} maxLength={500} value={details} onChange={e => setDetails(e.target.value)} placeholder={d.hasPayoutDetails ? 'Saved. Type new details to replace them.' : 'e.g. UPI: honey@okicici'} aria-label="Payout details" />
                  <button type="submit" className="x-btn x-btn--hi" disabled={details.trim().length < 4}>Save</button>
                </form>
              </section>
            </div>

            <section className="x-card" data-testid="earnings-ledger">
              <div className="x-ch"><h2>Package sales and adjustments</h2></div>
              {d.ledger.length === 0 ? <EmptyState compact icon="report" title="No sales yet">When clients pay for one of your packages, your share shows up here. It becomes payable after the refund window.</EmptyState> : (
                <div className="x-tblwrap"><table className="x-tbl ad-tbl"><thead><tr><th>Date</th><th>What</th><th>Status</th><th className="n">Your share</th></tr></thead>
                  <tbody>{d.ledger.map(l => <tr key={l.id}><td className="x-muted">{day(l.at)}</td><td>{l.label}</td><td><span className={`x-tag ${LEDGER_TONE[l.status] ?? ''}`}>{LEDGER_LABEL[l.status] ?? l.status}</span></td><td className={`n m ${l.amountCents < 0 ? 'neg' : ''}`}>{cash(l.amountCents, l.currency)}</td></tr>)}</tbody></table></div>
              )}
            </section>

            <section className="x-card" data-testid="earnings-payouts">
              <div className="x-ch"><h2>Payouts</h2></div>
              {d.payouts.length === 0 ? <p className="x-muted ib-pad">No payouts yet. One is prepared automatically once your payable balance reaches {cash(d.payoutMinimumCents, d.currency)}.</p> : (
                <div className="x-tblwrap"><table className="x-tbl ad-tbl"><thead><tr><th>Prepared</th><th>Status</th><th>Reference</th><th className="n">Amount</th></tr></thead>
                  <tbody>{d.payouts.map(p => <tr key={p.id}><td className="x-muted">{day(p.at)}</td><td><span className={`x-tag ${p.status === 'PAID' ? 'x-tag--g' : 'ac-tag-c'}`}>{p.status === 'PAID' ? `Paid ${p.paidAt ? day(p.paidAt) : ''}` : 'Being processed'}</span></td><td className="m">{p.reference ?? '—'}</td><td className="n m">{cash(p.amountCents, p.currency)}</td></tr>)}</tbody></table></div>
              )}
            </section>
          </>}
        </>}
      </div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
    </AppShell>
  );
}
