'use client';

// TradingView webhook (D14) and its request log (D15). One webhook per user:
// a URL to paste into TradingView and a secret that goes in each alert message.
// The secret is shown once, when it's created or regenerated.
import { useState } from 'react';
import Link from '@/components/v6/ui/link';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { useLoad } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import Modal from '@/components/v6/ui/modal';
import { ApiError, exchangesApi, webhookApi, type TradingWebhook, type WebhookEvent } from '@/lib/copy-api';
import '@/styles/v6/kit.css';
import '@/styles/v6/trading.css';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const TONE: Record<WebhookEvent['status'], string> = { ordered: 'x-tag--g', duplicate: '', rejected: 'x-tag--r', failed: 'x-tag--r' };

/** Alert message templates; {{…}} are TradingView placeholders it fills in. */
function templates(secret: string): Array<{ id: string; label: string; help: string; body: Record<string, unknown> }> {
  return [
    { id: 'buy', label: 'Market buy', help: 'Buys a fixed number of contracts.', body: { secret, action: 'buy', symbol: '{{ticker}}', qty: 1, id: '{{strategy.order.id}}-{{timenow}}' } },
    { id: 'sell', label: 'Market sell', help: 'Sells (or shorts) a fixed number of contracts.', body: { secret, action: 'sell', symbol: '{{ticker}}', qty: 1, id: '{{strategy.order.id}}-{{timenow}}' } },
    { id: 'usd', label: 'Buy by USD, with TP/SL', help: 'Sizes the position in dollars and protects it. {{plot_0}} and {{plot_1}} are your script’s first two plots (use them for TP and SL, or type fixed prices).', body: { secret, action: 'buy', symbol: '{{ticker}}', size_usd: 100, tp: '{{plot_0}}', sl: '{{plot_1}}', id: '{{strategy.order.id}}-{{timenow}}' } },
    { id: 'risk', label: 'Risk 1% to the stop', help: 'Sizes so hitting the stop-loss loses 1% of equity. Needs sl ({{plot_1}} here, or a fixed price).', body: { secret, action: 'buy', symbol: '{{ticker}}', risk_pct: 1, sl: '{{plot_1}}', id: '{{strategy.order.id}}-{{timenow}}' } },
    { id: 'limit', label: 'Limit buy', help: 'Rests on the book at a price.', body: { secret, action: 'buy', symbol: '{{ticker}}', type: 'limit', price: '{{close}}', qty: 1, id: '{{strategy.order.id}}-{{timenow}}' } },
    { id: 'close', label: 'Close position', help: 'Closes the whole position on that contract (add qty to close part).', body: { secret, action: 'close', symbol: '{{ticker}}', id: '{{strategy.order.id}}-{{timenow}}' } },
  ];
}

export default function WebhookPage() {
  const toast = useToast();
  const hook = useLoad(() => webhookApi.get(), []);
  const accounts = useLoad(() => exchangesApi.list(), []);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'rotate' | 'delete' | null>(null);
  const [pick, setPick] = useState('');
  const [live, setLive] = useState(false);
  const usable = (accounts.data ?? []).filter(c => c.status === 'ACTIVE' && c.canTrade);
  const w = hook.data;
  const chosen = usable.find(c => c.id === (pick || w?.connection.id || usable[0]?.id));

  const copy = (text: string, what: string) => void navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied`), () => toast.error('Could not copy'));

  async function setup() {
    if (!chosen) return;
    setBusy(true);
    try {
      const r = await webhookApi.setup({ connectionId: chosen.id, liveConfirmed: chosen.environment === 'LIVE' ? live : undefined });
      setSecret(r.secret);
      hook.setData(r);
      toast.success(w ? 'New secret made. Update your alerts.' : 'Webhook ready');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not set up the webhook');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }
  async function update(b: { enabled?: boolean; connectionId?: string; liveConfirmed?: boolean }) {
    setBusy(true);
    try {
      hook.setData(await webhookApi.update(b));
      toast.success('Saved');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await webhookApi.remove();
      hook.setData(null);
      setSecret(null);
      toast.success('Webhook deleted');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not delete');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <AppShell legacy={false} pageTitle="TradingView webhook" pageSubtitle="TradingView alerts as orders">
      <div className="x-page" data-testid="webhook-page">
        {hook.error ? <ErrorCard message={hook.error} onRetry={hook.reload} /> : hook.loading && !w ? <div className="x-skel cp-skel-hero" /> : (
          <section className="x-card wh-card" aria-label="Webhook">
            {!w ? (
              <div className="wh-setup" data-testid="webhook-setup">
                <div className="x-ch"><h2>Set up your webhook</h2></div>
                <p className="x-muted">Alerts will place orders on this account, using the same checks as the order ticket.</p>
                {accounts.data && !usable.length ? <p className="cp-err">No exchange account here can trade. <Link className="x-link" href="/exchanges">Connect one</Link> first.</p> : (
                  <div className="x-field">
                    <label htmlFor="wh-acct">Account</label>
                    <select id="wh-acct" className="x-input" value={chosen?.id ?? ''} onChange={e => setPick(e.target.value)} data-testid="webhook-account">
                      {usable.map(c => <option key={c.id} value={c.id}>{c.label}{c.environment === 'TESTNET' ? ' (testnet)' : ' (real money)'}</option>)}
                    </select>
                  </div>
                )}
                {chosen?.environment === 'LIVE' && <label className="cp-accept"><input type="checkbox" className="x-check" checked={live} onChange={e => setLive(e.target.checked)} /><span>This is a <b>real-money</b> account. Alerts may place orders on it without me watching.</span></label>}
                <button className="x-btn x-btn--hi" onClick={() => void setup()} disabled={busy || !chosen || (chosen.environment === 'LIVE' && !live)} data-testid="webhook-create">{busy ? 'Creating…' : 'Create webhook'}</button>
              </div>
            ) : (
              <div className="wh-grid">
                <div className="x-field">
                  <label>Webhook URL</label>
                  <div className="wh-copy"><code className="m" data-testid="webhook-url">{w.url}</code><button className="x-btn x-btn--sm" onClick={() => copy(w.url, 'URL')}>Copy</button></div>
                  <span className="x-help">Paste into TradingView → alert → Notifications → Webhook URL.</span>
                </div>
                <div className="x-field">
                  <label>Secret</label>
                  {secret ? (
                    <>
                      <div className="wh-copy wh-new"><code className="m" data-testid="webhook-secret">{secret}</code><button className="x-btn x-btn--sm" onClick={() => copy(secret, 'Secret')}>Copy</button></div>
                      <span className="cp-err">Copy it now: it won&rsquo;t be shown again. The templates below already include it.</span>
                    </>
                  ) : (
                    <div className="wh-copy"><code className="m">••••••••{w.secretLast4}</code><button className="x-btn x-btn--sm" onClick={() => setConfirm('rotate')} data-testid="webhook-rotate">Regenerate</button></div>
                  )}
                </div>
                <div className="wh-row">
                  <label className="cp-toggle cp-toggle--inline">
                    <button type="button" className="x-switch" role="switch" aria-checked={w.enabled} onClick={() => void update({ enabled: !w.enabled })} disabled={busy} aria-label="Webhook on" data-testid="webhook-enabled" />
                    <span>{w.enabled ? 'On: alerts place orders' : 'Off: alerts are logged and ignored'}</span>
                  </label>
                  <div className="x-field wh-acct">
                    <label htmlFor="wh-acct2">Account</label>
                    <select id="wh-acct2" className="x-input" value={w.connection.id} onChange={e => void update({ connectionId: e.target.value, liveConfirmed: usable.find(c => c.id === e.target.value)?.environment === 'LIVE' ? window.confirm('This is a real-money account. Let alerts trade it unattended?') : undefined })} disabled={busy} data-testid="webhook-account2">
                      {usable.map(c => <option key={c.id} value={c.id}>{c.label}{c.environment === 'TESTNET' ? ' (testnet)' : ' (real money)'}</option>)}
                    </select>
                  </div>
                  <button className="x-btn x-btn--sm x-btn--ghost cp-del" onClick={() => setConfirm('delete')} data-testid="webhook-delete">Delete webhook</button>
                </div>
                {w.connection.status !== 'ACTIVE' && <p className="cp-err">This account&rsquo;s key stopped working, so alerts will fail. <Link className="x-link" href="/exchanges">Reconnect</Link></p>}
              </div>
            )}
          </section>
        )}

        {w && <Templates secret={secret ?? 'PASTE_YOUR_SECRET'} hasSecret={!!secret} onCopy={copy} />}
        {w && <EventLog />}

        <section className="x-card wh-docs" aria-label="How it works">
          <div className="x-ch"><h2>How it works</h2></div>
          <ol>
            <li>In TradingView, create an alert (on a strategy or an indicator).</li>
            <li>Under <b>Notifications</b>, tick <b>Webhook URL</b> and paste the URL above.</li>
            <li>Paste a template from above into the <b>Message</b> box. TradingView fills the <code>{'{{…}}'}</code> parts when it fires.</li>
            <li>Each alert is checked like the order ticket (size, prices, balance) before an order is sent. The result shows in the log.</li>
          </ol>
          <p className="wh-fields">Fields: <code>action</code> buy, sell or close · <code>symbol</code> (TradingView names like <code>DELTAIN:BTCUSD.P</code> work) · one of <code>qty</code> (contracts), <code>size_usd</code> or <code>risk_pct</code> · optional <code>type</code> market/limit, <code>price</code>, <code>tp</code>, <code>sl</code>, <code>leverage</code>, <code>reduce_only</code> · <code>id</code>: unique per alert, so a repeated alert is never traded twice. Only TradingView&rsquo;s alert servers are accepted, at most 30 alerts a minute.</p>
        </section>
      </div>

      {confirm === 'rotate' && (
        <Modal title="Regenerate the secret?" sub="Every alert that uses the old secret stops working until you update its message." onClose={() => setConfirm(null)} busy={busy} testId="webhook-rotate-dialog"
          footer={<><button className="x-btn x-btn--ghost" onClick={() => setConfirm(null)} disabled={busy}>Keep the old one</button><button className="x-btn x-btn--hi cp-del" onClick={() => void setup()} disabled={busy} data-testid="webhook-rotate-confirm">Regenerate</button></>}>
          <p className="cp-fine">The URL stays the same. Use this if the secret may have leaked.</p>
        </Modal>
      )}
      {confirm === 'delete' && (
        <Modal title="Delete the webhook?" sub="Alerts sent to this URL will be refused. Its log is deleted too." onClose={() => setConfirm(null)} busy={busy} testId="webhook-delete-dialog"
          footer={<><button className="x-btn x-btn--ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button><button className="x-btn x-btn--hi cp-del" onClick={() => void remove()} disabled={busy} data-testid="webhook-delete-confirm">Delete</button></>}>
          <p className="cp-fine">You can set up a new one any time; it gets a new URL.</p>
        </Modal>
      )}
    </AppShell>
  );
}

function Templates({ secret, hasSecret, onCopy }: { secret: string; hasSecret: boolean; onCopy: (t: string, what: string) => void }) {
  const list = templates(secret);
  const [sel, setSel] = useState(list[0]!.id);
  const t = list.find(x => x.id === sel)!;
  const text = JSON.stringify(t.body, null, 2);
  return (
    <section className="x-card" aria-label="Alert message templates" data-testid="webhook-templates">
      <div className="x-ch"><h2>Alert message</h2><span className="x-sub">{hasSecret ? 'includes your secret' : 'replace PASTE_YOUR_SECRET with your secret'}</span></div>
      <div className="x-seg x-seg--in x-seg--sm wh-tabs" role="radiogroup" aria-label="Template">
        {list.map(x => <button key={x.id} type="button" role="radio" aria-checked={sel === x.id} onClick={() => setSel(x.id)}>{x.label}</button>)}
      </div>
      <p className="x-muted wh-help">{t.help}</p>
      <pre className="wh-pre m" data-testid="webhook-template">{text}</pre>
      <button className="x-btn x-btn--sm" onClick={() => onCopy(text, 'Message')} data-testid="webhook-template-copy">Copy message</button>
    </section>
  );
}

function EventLog() {
  const toast = useToast();
  const [items, setItems] = useState<WebhookEvent[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [open, setOpen] = useState<WebhookEvent | null>(null);
  const first = useLoad(async () => {
    const p = await webhookApi.events();
    setItems(p.items);
    setCursor(p.nextCursor);
    return p;
  }, []);
  async function more() {
    try {
      const p = await webhookApi.events(cursor);
      setItems(x => [...(x ?? []), ...p.items]);
      setCursor(p.nextCursor);
    } catch {
      toast.error('Could not load more');
    }
  }
  return (
    <section className="x-card" aria-label="Webhook log" data-testid="webhook-log">
      <div className="x-ch"><h2>Requests</h2><span className="x-sub">every alert received and what came of it</span><button className="x-btn x-btn--sm wh-refresh" onClick={() => void first.reload()} data-testid="webhook-log-refresh">Refresh</button></div>
      {first.error ? <p className="cp-err">{first.error}</p> : !items ? <div className="x-skel cp-skel-table" /> : !items.length ? <p className="x-muted cp-pad" data-testid="webhook-log-empty">No alerts yet. Once TradingView sends one, it shows here.</p> : (
        <div className="x-tblwrap">
          <table className="x-tbl trd-tbl" data-testid="webhook-log-table">
            <thead><tr><th>Received</th><th>Result</th><th>Alert</th><th>What happened</th><th>From</th><th /></tr></thead>
            <tbody>
              {items.map(e => (
                <tr key={e.id}>
                  <td>{when(e.receivedAt)}</td>
                  <td><span className={`x-tag ${TONE[e.status]}`}>{e.status}</span></td>
                  <td className="m">{e.payload ? `${String(e.payload.action ?? '?')} ${String(e.payload.symbol ?? '')}` : '—'}</td>
                  <td><small className="wh-reason" title={e.reason ?? ''}>{e.reason ?? '—'}</small></td>
                  <td className="m x-muted">{e.ip ?? '—'}</td>
                  <td className="trd-acts"><button className="x-btn x-btn--sm x-btn--ghost" onClick={() => setOpen(e)}>Details</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {cursor && <button className="x-btn cp-more-btn" onClick={() => void more()}>Show more</button>}
      {open && (
        <Modal title={`Alert · ${open.status}`} sub={when(open.receivedAt)} onClose={() => setOpen(null)} testId="webhook-event">
          <p>{open.reason ?? '—'}</p>
          {open.alertId && <p className="x-muted m">Alert id {open.alertId}</p>}
          <pre className="wh-pre m">{open.payload ? JSON.stringify(open.payload, null, 2) : 'No readable message.'}</pre>
          <p className="cp-fine">The secret is never stored in this log.</p>
        </Modal>
      )}
    </section>
  );
}
