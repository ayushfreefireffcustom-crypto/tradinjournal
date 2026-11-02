'use client';

// Personal API keys (D16) and the /api/v1 docs. A key is shown once, can be
// read-only or trade, and can be revoked; revoking stops it at once.
import { useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ago, useLoad } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import Modal from '@/components/v6/ui/modal';
import { ApiError, apiBase, apiKeysApi, type ApiKeyRow } from '@/lib/copy-api';
import '@/styles/v6/kit.css';
import '@/styles/v6/trading.css';

export default function ApiKeysPage() {
  const toast = useToast();
  const keys = useLoad(() => apiKeysApi.list(), []);
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState<ApiKeyRow | null>(null);
  const [shown, setShown] = useState<{ name: string; key: string } | null>(null);
  const copy = (t: string, what: string) => void navigator.clipboard?.writeText(t).then(() => toast.success(`${what} copied`), () => toast.error('Could not copy'));
  const active = (keys.data ?? []).filter(k => !k.revokedAt);
  const base = apiBase();
  const examples = [
    { title: 'Your exchange accounts', code: `curl ${base}/accounts \\\n  -H "Authorization: Bearer $TRADELOGS_KEY"` },
    { title: 'Open positions and pending orders', code: `curl ${base}/positions \\\n  -H "Authorization: Bearer $TRADELOGS_KEY"` },
    { title: 'Place an order (trade key)', code: `curl -X POST ${base}/orders \\\n  -H "Authorization: Bearer $TRADELOGS_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"connectionId":"<account id>","symbol":"BTCUSD","side":"BUY","type":"MARKET","size":{"mode":"contracts","value":1},"requestId":"my-order-0001"}'` },
    { title: 'Close a position (trade key)', code: `curl -X POST ${base}/positions/close \\\n  -H "Authorization: Bearer $TRADELOGS_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"connectionId":"<account id>","symbol":"BTCUSD"}'` },
  ];
  return (
    <AppShell legacy={false} pageTitle="API keys" pageSubtitle="For your own scripts"
      actions={<button className="x-btn x-btn--hi" onClick={() => setCreating(true)} disabled={active.length >= 10} data-testid="keys-new">New key</button>}>
      <div className="x-page" data-testid="keys-page">
        {shown && (
          <section className="x-card ak-new" data-testid="keys-shown">
            <div className="x-ch"><h2>{shown.name}: copy your key now</h2></div>
            <div className="wh-copy wh-new"><code className="m" data-testid="keys-shown-key">{shown.key}</code><button className="x-btn x-btn--sm" onClick={() => copy(shown.key, 'Key')}>Copy</button></div>
            <p className="cp-err">It won&rsquo;t be shown again. Keep it secret: anyone with a trade key can place orders on your accounts.</p>
            <button className="x-btn x-btn--sm" onClick={() => setShown(null)}>I&rsquo;ve saved it</button>
          </section>
        )}
        {keys.error ? <ErrorCard message={keys.error} onRetry={keys.reload} /> : !keys.data ? <div className="x-skel cp-skel-table" /> : !keys.data.length ? (
          <div className="x-card x-empty" data-testid="keys-empty"><b>No API keys yet</b><p>Create a key to read positions or place orders from a script, a bot or a spreadsheet.</p></div>
        ) : (
          <section className="x-card" aria-label="API keys">
            <div className="x-tblwrap">
              <table className="x-tbl trd-tbl" data-testid="keys-table">
                <thead><tr><th>Name</th><th>Key</th><th>Access</th><th>Created</th><th>Last used</th><th /></tr></thead>
                <tbody>
                  {keys.data.map(k => (
                    <tr key={k.id} className={k.revokedAt ? 'ak-off' : ''} data-testid={`key-${k.id}`}>
                      <td><b>{k.name}</b></td>
                      <td className="m">tl_{k.prefix}_••••{k.last4}</td>
                      <td><span className={`x-tag ${k.scope === 'trade' ? 'x-tag--r' : ''}`}>{k.scope === 'trade' ? 'Read and trade' : 'Read only'}</span></td>
                      <td>{ago(k.createdAt)}</td>
                      <td>{k.lastUsedAt ? ago(k.lastUsedAt) : 'Never'}</td>
                      <td className="trd-acts">{k.revokedAt ? <span className="x-muted">Revoked {ago(k.revokedAt)}</span> : <button className="x-btn x-btn--sm x-btn--ghost cp-del" onClick={() => setRevoking(k)} data-testid={`key-revoke-${k.id}`}>Revoke</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="x-card wh-docs" aria-label="API docs">
          <div className="x-ch"><h2>Using the API</h2><span className="x-sub">{base}</span></div>
          <ol>
            <li>Send the key in the <code>Authorization</code> header: <code>Bearer tl_…</code>. Up to 120 requests a minute per key.</li>
            <li><b>Read only</b> keys can list accounts, positions and orders. <b>Read and trade</b> keys can also place, close and cancel.</li>
            <li>Orders go through the same checks as the order ticket. Give each order a unique <code>requestId</code> (8–64 letters, digits or dashes): sending the same one again never places a second order.</li>
          </ol>
          {examples.map(e => (
            <div key={e.title} className="ak-ex">
              <div className="ak-ex-h"><b>{e.title}</b><button className="x-btn x-btn--sm" onClick={() => copy(e.code, 'Example')}>Copy</button></div>
              <pre className="wh-pre m">{e.code}</pre>
            </div>
          ))}
          <p className="wh-fields">Endpoints: <code>GET /accounts</code> · <code>GET /positions</code> · <code>GET /orders</code> (filters like the order log) · <code>POST /orders</code> · <code>POST /orders/cancel</code> · <code>POST /positions/close</code>. Errors come back as <code>{'{"error":{"code","message"}}'}</code> with a 4xx status.</p>
        </section>
      </div>
      {creating && <CreateKey onClose={() => setCreating(false)} onCreated={(k) => { setCreating(false); setShown({ name: k.name, key: k.key }); void keys.reload(); }} />}
      {revoking && (
        <Modal title={`Revoke “${revoking.name}”?`} sub="Anything using this key stops working straight away. This can't be undone." onClose={() => setRevoking(null)} testId="keys-revoke-dialog"
          footer={<><button className="x-btn x-btn--ghost" onClick={() => setRevoking(null)}>Keep it</button><button className="x-btn x-btn--hi cp-del" data-testid="keys-revoke-confirm" onClick={async () => {
            try { await apiKeysApi.revoke(revoking.id); toast.success('Key revoked'); setRevoking(null); void keys.reload(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not revoke'); }
          }}>Revoke</button></>}>
          <p className="cp-fine m">tl_{revoking.prefix}_••••{revoking.last4}</p>
        </Modal>
      )}
    </AppShell>
  );
}

function CreateKey({ onClose, onCreated }: { onClose: () => void; onCreated: (k: ApiKeyRow & { key: string }) => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'trade'>('read');
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      onCreated(await apiKeysApi.create({ name: name.trim(), scope }));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not create the key');
      setBusy(false);
    }
  }
  return (
    <Modal title="New API key" onClose={onClose} busy={busy} testId="keys-create"
      footer={<><button className="x-btn x-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="x-btn x-btn--hi" onClick={() => void go()} disabled={busy || !name.trim()} data-testid="keys-create-submit">{busy ? 'Creating…' : 'Create key'}</button></>}>
      <div className="x-field"><label htmlFor="ak-name">Name</label><input id="ak-name" className="x-input" maxLength={60} placeholder="e.g. My Python bot" value={name} onChange={e => setName(e.target.value)} data-testid="keys-name" /></div>
      <div className="x-field">
        <label>Access</label>
        <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Access">
          <button type="button" role="radio" aria-checked={scope === 'read'} onClick={() => setScope('read')} data-testid="keys-scope-read">Read only</button>
          <button type="button" role="radio" aria-checked={scope === 'trade'} onClick={() => setScope('trade')} data-testid="keys-scope-trade">Read and trade</button>
        </div>
        <span className="x-help">{scope === 'trade' ? 'Can place, close and cancel real orders on your exchange accounts. Keep it secret.' : 'Can list accounts, positions and orders. Can’t trade.'}</span>
      </div>
    </Modal>
  );
}
