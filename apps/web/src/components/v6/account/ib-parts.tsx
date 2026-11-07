'use client';

// Building blocks for the IB layer, shared by the partner portal, the trader's Access
// page and the admin programme pages: verification and access pills, the six-step
// IB funnel, the trading summary, broker health and the event trail.
import type { ReactNode } from 'react';
import {
  CheckCircle, Clock, Hourglass, LockSimple, MagnifyingGlass, Pause, Prohibit, Question, ShieldWarning, WarningCircle,
} from '@phosphor-icons/react';
import { timeAgo } from '@/components/app-shell';
import { Avatar, StatusPill, day, n, pct, place } from '@/components/v6/account/partner-parts';
import {
  ENT_LABEL, VERIFY_LABEL, money, type EntitlementStatus, type IbEvent, type IbFunnel, type PartnerBroker, type TradingSummary,
  type VerificationStatus,
} from '@/lib/ib-api';
import type { PartnerClient } from '@/lib/partner-api';
import '@/styles/v6/account.css';
import '@/styles/v6/ib.css';

type V = VerificationStatus | 'NO_ACCOUNT';
const VT: Record<V, { c: string; I: typeof CheckCircle }> = {
  VERIFIED: { c: 'x-tag--g', I: CheckCircle }, MANUAL_REVIEW: { c: 'ac-tag-c', I: MagnifyingGlass }, PENDING: { c: '', I: Clock },
  NOT_FOUND: { c: 'x-tag--r', I: WarningCircle }, REJECTED: { c: 'x-tag--r', I: Prohibit }, UNSUPPORTED_BROKER: { c: '', I: Question },
  NO_ACCOUNT: { c: '', I: Clock },
};
export function VerifyPill({ s }: { s: V }) {
  const { c, I } = VT[s];
  return <span className={`x-tag ${c} ib-pill`}><I size={13} weight="bold" aria-hidden />{VERIFY_LABEL[s]}</span>;
}

type E = EntitlementStatus | 'LOCKED';
const ET: Record<E, { c: string; I: typeof CheckCircle }> = {
  ACTIVE: { c: 'x-tag--g', I: CheckCircle }, GRACE: { c: 'ac-tag-c', I: Hourglass }, SUSPENDED: { c: 'x-tag--r', I: Pause },
  EXPIRED: { c: '', I: Clock }, LOCKED: { c: '', I: LockSimple },
};
export function EntPill({ s }: { s: E }) {
  const { c, I } = ET[s];
  return <span className={`x-tag ${c} ib-pill`}><I size={13} weight="bold" aria-hidden />{ENT_LABEL[s]}</span>;
}

// ── Funnel ────────────────────────────────────────────────────────────────
export function IbFunnelCard({ f, rule, title = 'Your funnel', sub }: { f: IbFunnel; rule: { minTrades: number; windowDays: number }; title?: string; sub?: ReactNode }) {
  const steps: { l: string; v: number; of: number | null; ofL: string; hint?: string }[] = [
    { l: 'Link clicks', v: f.clicks, of: null, ofL: '' },
    { l: 'Signed up', v: f.signups, of: f.clicks, ofL: 'of clicks', hint: 'Includes people who typed your code at signup.' },
    { l: 'MT5 connected', v: f.connected, of: f.signups, ofL: 'of signups' },
    { l: 'Broker verified', v: f.verified, of: f.connected, ofL: 'of connected', hint: 'Their MT5 account number is in your broker’s referred-accounts list, or an admin confirmed it.' },
    { l: 'Active traders', v: f.active, of: f.connected, ofL: 'of connected', hint: `${rule.minTrades}+ closed trades in the last ${rule.windowDays} days.` },
    { l: 'Unlocked', v: f.eligible, of: f.verified, ofL: 'of verified', hint: 'Hold at least one of your packages right now.' },
  ];
  return (
    <section className="x-card" aria-label="Referral funnel" data-testid="ib-funnel">
      <div className="x-ch"><h2>{title}</h2>{sub && <span className="x-sub">{sub}</span>}</div>
      <ol className="ac-funnel ib-funnel">
        {steps.map(s => (
          <li key={s.l}>
            <span className="l">{s.l}{s.hint && <abbr title={s.hint} aria-label={s.hint}>?</abbr>}</span>
            <b className={`m ${s.v === 0 ? 'x-dim' : ''}`}>{n(s.v)}</b>
            <span className="s">{s.of == null ? 'Times your link was opened' : s.of ? `${pct(s.v, s.of)} ${s.ofL}` : '—'}</span>
            <span className="x-bar"><i style={{ width: `${s.of == null ? 100 : s.of ? Math.max((s.v / s.of) * 100, s.v ? 2 : 0) : 0}%` }} /></span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Trading summary ───────────────────────────────────────────────────────
export function TradingCard({ t, title = 'Client trading, last 30 days', note }: { t: TradingSummary; title?: string; note?: ReactNode }) {
  const judged = t.profitable + t.losing;
  return (
    <section className="x-card ib-trading" data-testid="ib-trading">
      <div className="x-ch"><h2>{title}</h2><span className="x-sub"><span className="m">{n(t.trading)}</span> of <span className="m">{n(t.connected)}</span> connected traded</span></div>
      <div className="x-strip ib-strip">
        <div><span>Closed trades</span><b className="m">{n(t.trades30d)}</b></div>
        <div><span>Volume</span><b className="m">{t.lots30d.toLocaleString('en-US', { maximumFractionDigits: 2 })}<small> lots</small></b></div>
        <div><span>Net P&amp;L</span><b className={`m ${t.pnl30d > 0 ? 'pos' : t.pnl30d < 0 ? 'neg' : ''}`}>{money(t.pnl30d)}</b></div>
      </div>
      <div className="ib-split" aria-label={`${t.profitable} profitable, ${t.losing} losing`}>
        <div className="ib-split-l"><b className="m pos">{n(t.profitable)}</b> profitable</div>
        <div className="ib-split-bar">
          {judged ? <>{t.profitable > 0 && <i className="g" style={{ flexGrow: t.profitable }} />}{t.losing > 0 && <i className="r" style={{ flexGrow: t.losing }} />}</> : <i className="e" />}
        </div>
        <div className="ib-split-r"><b className="m neg">{n(t.losing)}</b> losing</div>
      </div>
      <p className="ib-note">{note ?? 'Totals across every connected client. Per-client P&L shows only for clients who chose to share it with you.'}</p>
    </section>
  );
}

// ── Brokers ───────────────────────────────────────────────────────────────
export function BrokerHealthRow({ b, right }: { b: PartnerBroker; right?: ReactNode }) {
  const tone = b.status === 'OK' ? '' : b.status === 'ERROR' ? 'x-dot--r' : 'x-dot--off';
  return (
    <li className="ib-br">
      <span className="ib-br-mk" aria-hidden>{b.label.slice(0, 2).toUpperCase()}</span>
      <span className="ib-br-who">
        <b>{b.label}{b.ibId && <small className="m"> · {b.ibId}</small>}</b>
        <small><i className={`x-dot ${tone}`} />{b.status === 'OK' ? `Synced ${timeAgo(b.lastSyncAt)}` : b.status === 'ERROR' ? b.lastError ?? 'Sync failed' : 'Waiting for the first list'} · {b.method === 'SHEET' ? 'Google Sheet' : b.method === 'API' ? 'Broker API' : 'Uploaded list'}</small>
      </span>
      <span className="ib-br-n"><b className="m">{n(b.accountCount)}</b><small>{b.accountCount === 1 ? 'account' : 'accounts'} listed</small></span>
      <span className="ib-br-n"><b className="m">{n(b.verified)}<span className="x-dim">/{n(b.clientAccounts)}</span></b><small>clients verified</small></span>
      {right}
    </li>
  );
}

// ── Needs attention ───────────────────────────────────────────────────────
export function AttentionCard({ a, links }: { a: { notFound: number; inReview: number; unsupported: number; syncErrors: number }; links?: { brokers: string; clients: string } }) {
  const items = [
    { n: a.syncErrors, l: a.syncErrors === 1 ? 'broker list failed to sync' : 'broker lists failed to sync', href: links?.brokers, I: ShieldWarning },
    { n: a.notFound, l: a.notFound === 1 ? 'client account isn’t in your lists' : 'client accounts aren’t in your lists', href: links?.clients, I: WarningCircle },
    { n: a.unsupported, l: a.unsupported === 1 ? 'client trades at a broker you haven’t connected' : 'clients trade at a broker you haven’t connected', href: links?.brokers, I: Question },
    { n: a.inReview, l: a.inReview === 1 ? 'account is waiting for an admin check' : 'accounts are waiting for an admin check', href: links?.clients, I: MagnifyingGlass },
  ].filter(x => x.n > 0);
  return (
    <section className="x-card" data-testid="ib-attention">
      <div className="x-ch"><h2>Needs attention</h2></div>
      {items.length === 0 ? <p className="ib-ok"><CheckCircle size={18} weight="duotone" aria-hidden />Every connected client is checked and your lists are syncing.</p> : (
        <ul className="ib-attn">
          {items.map(x => (
            <li key={x.l}><x.I size={18} weight="duotone" aria-hidden /><span><b className="m">{n(x.n)}</b> {x.l}</span>{x.href && <a className="x-link" href={x.href}>Open</a>}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Clients with IB columns ───────────────────────────────────────────────
export function IbClientRows({ clients, onUnlink, admin = false }: { clients: PartnerClient[]; onUnlink?: (c: PartnerClient) => void; admin?: boolean }) {
  return (
    <div className="x-tblwrap ac-scroll">
      <table className="x-tbl ac-tbl ac-clients ib-clients">
        <thead><tr>
          <th>Client</th><th>Signed up</th><th>Status</th><th>Broker check</th><th>Access</th>
          <th className="n">Trades, 30d</th><th className="n">Lots, 30d</th><th className="n">P&amp;L, 30d</th>
          {onUnlink && <th className="n"><span className="sr-only">Actions</span></th>}
        </tr></thead>
        <tbody>{clients.map(c => {
          const ib = c.ib;
          const live = ib?.packages.filter(p => p.status === 'ACTIVE' || p.status === 'GRACE') ?? [];
          return (
            <tr key={c.id}>
              <td><div className="ac-who"><Avatar name={c.name} /><span><b>{c.name}</b><small>{place(c.city, c.country)} · {c.channel}{c.via !== 'link' ? ` · ${c.via === 'late' ? 'code after signup' : c.via}` : ''}</small>{ib && <span className="ib-m-only"><VerifyPill s={ib.verification} /></span>}</span></div></td>
              <td className="x-muted">{day(c.signedUpAt)}</td>
              <td><StatusPill s={c.status} /></td>
              <td>{ib ? <VerifyPill s={ib.verification} /> : <span className="x-dim">—</span>}</td>
              <td>{live.length ? <span className="ib-pk" title={live.map(p => p.name).join(', ')}><EntPill s={live.some(p => p.status === 'ACTIVE') ? 'ACTIVE' : 'GRACE'} /><small>{live.length === 1 ? live[0]!.name : `${live.length} packages`}</small></span> : <span className="x-dim">—</span>}</td>
              <td className="n m">{c.status === 'SIGNED_UP' ? <span className="x-dim">—</span> : n(c.trades30d)}</td>
              <td className="n m">{c.status === 'SIGNED_UP' ? <span className="x-dim">—</span> : c.lots30d.toFixed(2)}</td>
              <td className="n m">{c.status === 'SIGNED_UP' ? <span className="x-dim">—</span> : ib?.pnl30d == null
                ? <span className="x-dim ib-private" title={admin ? '' : 'The client hasn’t chosen to share their P&L with you'}><LockSimple size={12} weight="bold" aria-hidden />Private</span>
                : <span className={ib.pnl30d > 0 ? 'pos' : ib.pnl30d < 0 ? 'neg' : ''}>{money(ib.pnl30d)}</span>}</td>
              {onUnlink && <td className="n"><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => onUnlink(c)}>Unlink</button></td>}
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}

// ── Event trail ───────────────────────────────────────────────────────────
const KIND_DOT: Record<string, string> = { ib: 'ac-dot-c', verify: '', access: '', consent: 'x-dot--off', partner: 'x-dot--off', package: 'ac-dot-c', referral: 'x-dot--off', template: 'ac-dot-c' };
export function EventList({ events, empty = 'Nothing recorded yet.' }: { events: IbEvent[]; empty?: string }) {
  if (!events.length) return <p className="x-muted ib-pad">{empty}</p>;
  return (
    <ul className="ac-feed ib-events">
      {events.map(e => {
        const head = e.kind.split('.')[0]!;
        const bad = /failed|reject|suspend|expire|grace|not_found/.test(e.kind);
        return (
          <li key={e.id}>
            <i className={`x-dot ${bad ? 'x-dot--r' : KIND_DOT[head] ?? ''}`} />
            <p>{e.message}<small>{e.kind}{e.actorEmail ? ` · ${e.actorEmail}` : ''} · {timeAgo(e.at)}</small></p>
          </li>
        );
      })}
    </ul>
  );
}
