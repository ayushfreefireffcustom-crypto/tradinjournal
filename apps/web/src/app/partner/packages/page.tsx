'use client';

// What the partner offers clients who open accounts under them: packages of
// TRADElogs features and their own marketplace strategies, with the rules a
// client has to meet (verified broker, active trading) and how long access lasts.
import { useCallback, useEffect, useState } from 'react';
import { Archive, CheckCircle, Clock, CurrencyCircleDollar, Package, PauseCircle, PencilSimple, Pulse, ShieldCheck, Toolbox } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { PartnerApiError } from '@/lib/partner-api';
import { cash, ibApi, per, PRODUCT_TYPE_LABEL, type PackageInput, type PackagesPage, type PartnerPackage, type ProductType } from '@/lib/ib-api';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v6/account/partner-gate';
import { n } from '@/components/v6/account/partner-parts';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';

const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const BLANK: PackageInput = { name: '', description: '', perks: [], templateIds: [], productIds: [], brokers: [], requireActive: true, accessDays: null, status: 'LIVE', priceCents: 0, periodDays: 30 };

export default function PartnerPackagesPage() {
  const { accounts, selected, select } = useAccounts();
  const [d, setD] = useState<PackagesPage | null>(null);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<PartnerPackage | 'new' | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try { setD(await ibApi.packages()); setError(''); }
    catch (e) {
      if (e instanceof PartnerApiError && GATE_CODES.includes(e.code)) setGate(e.code as GateReason);
      else setError(msg(e, 'Could not load your packages.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  const perkLabel = (k: string) => d?.perks.find(p => p.key === k)?.label ?? k;
  const tplLabel = (id: string) => d?.templates.find(t => t.id === id)?.name ?? 'Strategy';
  const brokerLabel = (k: string) => d?.brokers.find(b => b.key === k)?.label ?? k;
  const prodLabel = (id: string) => d?.products.find(p => p.id === id)?.name ?? 'Tool';
  const visible = d?.packages.filter(p => p.status !== 'ARCHIVED') ?? [];
  const archived = d?.packages.filter(p => p.status === 'ARCHIVED') ?? [];

  async function setStatus(p: PartnerPackage, status: PartnerPackage['status']) {
    try { await ibApi.updatePackage(p.id, { status }); setToast(status === 'LIVE' ? `${p.name} is live.` : status === 'ARCHIVED' ? `${p.name} archived. Holders move to the grace period.` : `${p.name} moved to drafts.`); await load(); }
    catch (e) { setToast(msg(e, 'That didn’t work.')); }
  }

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Packages"
      pageSubtitle="What your verified clients unlock"
      actions={d && !gate && !editing ? <button type="button" className="x-btn x-btn--hi" onClick={() => setEditing('new')} data-testid="ib-new-package">New package</button> : null}>
      <div className="x-page" data-testid="partner-packages">
        {gate ? <PartnerGate reason={gate} onApplied={() => {}} /> : <>
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!d && !error && <div className="x-skel ac-sk-320" />}

          {d && editing && (
            <Editor d={d} pkg={editing === 'new' ? null : editing} onCancel={() => setEditing(null)}
              onSaved={async p => { setEditing(null); setToast(`${p.name} saved · ${p.holders} client${p.holders === 1 ? '' : 's'} unlocked.`); await load(); }} />
          )}

          {d && !editing && visible.length === 0 && (
            <EmptyState icon="star" ghost="cards" title="Offer your clients something" actions={<button type="button" className="x-btn x-btn--hi" onClick={() => setEditing('new')}>Create a package</button>}
              hints={['Bundle features like SignalX or the options desk', 'Add your own marketplace strategies, for your clients only', 'Require a verified broker account and active trading']}>
              Clients who open a broker account under you and pass the checks unlock it automatically.
            </EmptyState>
          )}

          {d && visible.length > 0 && (
            <div className="ib-pkgs">
              {visible.map(p => (
                <article key={p.id} className={`x-card ib-pkg ${p.status !== 'LIVE' ? 'off' : ''}`} data-testid={`ib-pkg-${p.name}`}>
                  <div className="ib-pkg-h">
                    <div><h3>{p.name}</h3>{p.description && <p>{p.description}</p>}</div>
                    {p.adminHold
                      ? <span className="x-tag x-tag--r ib-pill" title={p.adminNote ?? ''}><PauseCircle size={13} weight="bold" />Paused by TRADElogs</span>
                      : <span className={`x-tag ${p.status === 'LIVE' ? 'x-tag--g' : ''} ib-pill`}>{p.status === 'LIVE' ? <CheckCircle size={13} weight="bold" /> : <PencilSimple size={13} weight="bold" />}{p.status === 'LIVE' ? 'Live' : 'Draft'}</span>}
                  </div>
                  <ul className="ib-perks">
                    {p.perks.map(k => <li key={k}><Package size={13} weight="bold" aria-hidden />{perkLabel(k)}{d.lockedPerks.includes(k) ? '' : <span className="x-dim">· open to all</span>}</li>)}
                    {p.templateIds.map(t => <li key={t}><Pulse size={13} weight="bold" aria-hidden />{tplLabel(t)}</li>)}
                    {p.productIds.map(t => <li key={t}><Toolbox size={13} weight="bold" aria-hidden />{prodLabel(t)}</li>)}
                  </ul>
                  <div className="ib-rules">
                    <span><ShieldCheck size={14} weight="duotone" />{p.brokers.length ? `Verified at ${p.brokers.map(brokerLabel).join(', ')}` : 'Verified at any of your brokers'}</span>
                    {p.requireActive && <span><Pulse size={14} weight="duotone" />Active trading</span>}
                    <span><Clock size={14} weight="duotone" />{p.accessDays ? `${p.accessDays} days of access` : 'While they qualify'}</span>
                    <span><CurrencyCircleDollar size={14} weight="duotone" />{p.priceCents ? `${cash(p.priceCents, p.currency)} / ${per(p.periodDays)}` : 'Free'}</span>
                  </div>
                  {p.adminHold && p.adminNote && <p className="ib-app-note">TRADElogs: {p.adminNote}</p>}
                  <div className="ib-pkg-ft">
                    <span><b className="m">{n(p.holders)}</b> unlocked{p.inGrace ? <> · <b className="m">{n(p.inGrace)}</b> in grace</> : null}{p.priceCents ? <> · <b className="m">{n(p.subscribers)}</b> paying</> : null}</span>
                    <span className="ib-br-btns">
                      <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => setEditing(p)}>Edit</button>
                      {p.status === 'LIVE'
                        ? <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => void setStatus(p, 'DRAFT')}>Unpublish</button>
                        : <button type="button" className="x-btn x-btn--sm x-btn--hi" onClick={() => void setStatus(p, 'LIVE')}>Go live</button>}
                      <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => void setStatus(p, 'ARCHIVED')} aria-label={`Archive ${p.name}`}><Archive size={14} weight="bold" /></button>
                    </span>
                  </div>
                </article>
              ))}
            </div>
          )}

          {d && archived.length > 0 && (
            <section className="x-card">
              <div className="x-ch"><h2>Archived</h2><span className="x-sub"><span className="m">{archived.length}</span></span></div>
              <ul className="ac-codes">{archived.map(p => <li key={p.id}><span><b>{p.name}</b><small>{p.perks.length + p.templateIds.length + p.productIds.length} items</small></span><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => void setStatus(p, 'DRAFT')}>Restore</button></li>)}</ul>
            </section>
          )}

          {d && d.lockedPerks.length === 0 && visible.some(p => p.perks.length) && (
            <p className="ac-br-note">Every TRADElogs feature is open to all users right now, so packages mark who qualified through you. Your own strategies set to &ldquo;my clients only&rdquo; are visible to holders alone.</p>
          )}
        </>}
      </div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
    </AppShell>
  );
}

function Editor({ d, pkg, onCancel, onSaved }: { d: PackagesPage; pkg: PartnerPackage | null; onCancel: () => void; onSaved: (p: PartnerPackage) => void }) {
  const [f, setF] = useState<PackageInput>(pkg ? {
    name: pkg.name, description: pkg.description ?? '', perks: pkg.perks, templateIds: pkg.templateIds, productIds: pkg.productIds, brokers: pkg.brokers,
    requireActive: pkg.requireActive, accessDays: pkg.accessDays, status: pkg.status === 'ARCHIVED' ? 'DRAFT' : pkg.status,
    priceCents: pkg.priceCents, periodDays: pkg.periodDays,
  } : BLANK);
  const [price, setPrice] = useState(pkg?.priceCents ? String(pkg.priceCents / 100) : '');
  const [only, setOnly] = useState<Record<string, boolean>>(Object.fromEntries(d.templates.map(t => [t.id, t.partnerOnly])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = (k: 'perks' | 'templateIds' | 'brokers' | 'productIds', v: string) => setF(x => ({ ...x, [k]: x[k].includes(v) ? x[k].filter(y => y !== v) : [...x[k], v] }));
  const cents = price.trim() ? Math.round(Number(price) * 100) : 0;
  const priceOk = !price.trim() || (Number.isFinite(cents) && cents >= 100);
  const valid = f.name.trim().length >= 2 && (f.perks.length + f.templateIds.length + f.productIds.length) > 0 && priceOk;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      for (const t of d.templates) if (f.templateIds.includes(t.id) && only[t.id] !== t.partnerOnly) await ibApi.templateAudience(t.id, !!only[t.id]);
      const body = { ...f, priceCents: cents, name: f.name.trim(), description: f.description?.trim() || undefined };
      onSaved(pkg ? await ibApi.updatePackage(pkg.id, body) : await ibApi.createPackage(body));
    } catch (x) { setErr(msg(x, 'Could not save the package.')); } finally { setBusy(false); }
  }

  return (
    <section className="x-card" data-testid="ib-package-editor">
      <div className="x-ch"><h2>{pkg ? `Edit ${pkg.name}` : 'New package'}</h2><div className="x-r"><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={onCancel}>Cancel</button></div></div>
      <form className="ac-form ac-form--wide" onSubmit={save}>
        <div className="ib-form-row">
          <div className="x-field"><label htmlFor="pk-name">Name</label><input id="pk-name" className="x-input" maxLength={60} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Honey Pro" data-testid="pk-name" /></div>
          <div className="x-field ib-span2"><label htmlFor="pk-desc">Short description <span className="x-dim">(optional)</span></label><input id="pk-desc" className="x-input" maxLength={400} value={f.description ?? ''} onChange={e => setF({ ...f, description: e.target.value })} placeholder="What clients get and why" /></div>
        </div>

        <span className="ib-legend">TRADElogs features</span>
        <div className="ib-checks">
          {d.perks.map(p => (
            <label key={p.key} className={`ib-check ${d.lockedPerks.includes(p.key) ? 'locked' : ''}`}>
              <input type="checkbox" className="x-check" checked={f.perks.includes(p.key)} onChange={() => toggle('perks', p.key)} data-testid={`pk-perk-${p.key}`} />
              <span><b>{p.label}</b><small>{p.description}</small></span>
            </label>
          ))}
        </div>

        <span className="ib-legend">Your marketplace strategies</span>
        {d.templates.length === 0
          ? <p className="ib-note">Publish a strategy from Strategies › Publish to add it here.</p>
          : <div className="ib-checks">
              {d.templates.map(t => (
                <label key={t.id} className="ib-check">
                  <input type="checkbox" className="x-check" checked={f.templateIds.includes(t.id)} onChange={() => toggle('templateIds', t.id)} />
                  <span><b>{t.name}</b><small>{t.status}{f.templateIds.includes(t.id) && <> · <button type="button" className="x-link" onClick={e => { e.preventDefault(); setOnly(o => ({ ...o, [t.id]: !o[t.id] })); }}>{only[t.id] ? 'My clients only' : 'Public'}</button></>}</small></span>
                </label>
              ))}
            </div>}

        <span className="ib-legend">Your tools</span>
        {d.products.length === 0
          ? <p className="ib-note">Add indicators, chart or journal templates, EAs or guides on the <a className="x-link" href="/partner/tools">Tools</a> page.</p>
          : <div className="ib-checks">
              {d.products.map(t => (
                <label key={t.id} className="ib-check">
                  <input type="checkbox" className="x-check" checked={f.productIds.includes(t.id)} onChange={() => toggle('productIds', t.id)} data-testid={`pk-product-${t.name}`} />
                  <span><b>{t.name}</b><small>{PRODUCT_TYPE_LABEL[t.type as ProductType] ?? t.type} · {t.status === 'APPROVED' ? 'approved' : t.status === 'PENDING' ? 'waiting for review (hidden until approved)' : t.status.toLowerCase()}</small></span>
                </label>
              ))}
            </div>}

        <span className="ib-legend">Who qualifies</span>
        <div className="ib-checks">
          {d.brokers.length === 0 && <p className="ib-note">Connect a broker first; clients must be verified at one of your brokers.</p>}
          {d.brokers.map(b => (
            <label key={b.key} className="ib-check">
              <input type="checkbox" className="x-check" checked={f.brokers.includes(b.key)} onChange={() => toggle('brokers', b.key)} />
              <span><b>Verified at {b.label}</b><small>{f.brokers.length ? '' : 'None ticked = any of your brokers'}</small></span>
            </label>
          ))}
          <label className="ib-check">
            <input type="checkbox" className="x-check" checked={f.requireActive} onChange={e => setF({ ...f, requireActive: e.target.checked })} />
            <span><b>Must be an active trader</b><small>Uses the programme&rsquo;s active-trader rule</small></span>
          </label>
        </div>

        <span className="ib-legend">Price</span>
        <div className="ib-form-row">
          <div className="x-field">
            <label htmlFor="pk-price">Price per period ({d.currency}) <span className="x-dim">(blank = free)</span></label>
            <input id="pk-price" className="x-input m" inputMode="decimal" value={price} disabled={!d.permissions.canSellPackages}
              onChange={e => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} placeholder={d.permissions.canSellPackages ? 'Free' : 'Not enabled for you'} data-testid="pk-price" />
            {!priceOk && <span className="x-help ib-err">Paid packages cost at least 1.00.</span>}
          </div>
          <div className="x-field">
            <label htmlFor="pk-period">Billing period</label>
            <select id="pk-period" className="x-select" value={f.periodDays} disabled={!cents} onChange={e => setF({ ...f, periodDays: Number(e.target.value) })}>
              <option value={7}>Weekly</option><option value={30}>Monthly</option><option value={90}>Every 3 months</option><option value={365}>Yearly</option>
            </select>
          </div>
          <p className="ib-note">{cents
            ? <>Clients pay {cash(cents, d.currency)} / {per(f.periodDays)} once they meet every other condition. You keep {d.revenueSharePct}% ({cash(Math.ceil(cents * d.revenueSharePct / 100), d.currency)}).{!d.paymentsEnabled && ' Online payment isn’t switched on yet, so TRADElogs grants access by hand until it is.'}</>
            : 'Free packages unlock by themselves for clients who qualify.'}</p>
        </div>

        <div className="ib-form-row">
          <div className="x-field">
            <label htmlFor="pk-days">Access lasts</label>
            <select id="pk-days" className="x-select" value={f.accessDays ?? ''} onChange={e => setF({ ...f, accessDays: e.target.value ? Number(e.target.value) : null })}>
              <option value="">While they qualify</option><option value="30">30 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">1 year</option>
            </select>
          </div>
          <div className="x-field">
            <label htmlFor="pk-status">Status</label>
            <select id="pk-status" className="x-select" value={f.status} onChange={e => setF({ ...f, status: e.target.value as PackageInput['status'] })}>
              <option value="LIVE">Live: clients can unlock it</option><option value="DRAFT">Draft</option>
            </select>
          </div>
        </div>
        {err && <div className="x-banner x-banner--err" role="alert"><span>{err}</span></div>}
        <div><button type="submit" className="x-btn x-btn--hi" disabled={!valid || busy} data-testid="pk-save">{busy ? 'Saving…' : pkg ? 'Save changes' : 'Create package'}</button></div>
      </form>
    </section>
  );
}
