'use client';

// The partner's own tools: indicators, chart and journal templates, algorithms / EAs
// and guides. Each version is reviewed by TRADElogs before clients see it; clients get
// approved tools through the packages that include them.
import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ChartLine, Code, FileArrowUp, Notebook, Robot, Trash, PaperPlaneTilt, PencilSimple } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import { PartnerApiError } from '@/lib/partner-api';
import { ibApi, PRODUCT_TYPE_LABEL, type PartnerProduct, type ProductInput, type ProductType } from '@/lib/ib-api';
import PartnerGate, { GATE_CODES, type GateReason } from '@/components/v6/account/partner-gate';
import { n } from '@/components/v6/account/partner-parts';
import { timeAgo } from '@/components/app-shell';
import EmptyState from '@/components/v6/ui/empty-state';
import '@/styles/v6/account.css';
import '@/styles/v6/lux.css';
import '@/styles/v6/ib.css';

const msg = (e: unknown, f: string) => (e instanceof Error ? e.message : f);
const ICON: Record<ProductType, typeof Code> = { INDICATOR: ChartLine, CHART_TEMPLATE: ChartLine, JOURNAL_TEMPLATE: Notebook, ALGORITHM: Robot, GUIDE: BookOpen };
const STATUS: Record<PartnerProduct['status'], { l: string; c: string }> = {
  DRAFT: { l: 'Draft', c: '' }, PENDING: { l: 'In review', c: 'ac-tag-c' }, APPROVED: { l: 'Approved', c: 'x-tag--g' }, REJECTED: { l: 'Changes needed', c: 'x-tag--r' }, ARCHIVED: { l: 'Archived', c: '' },
};
const HINT: Record<ProductType, string> = {
  INDICATOR: 'Pine Script, MQL or another indicator source, or a link to it',
  CHART_TEMPLATE: 'A TradingView / MT5 chart template or layout (JSON or file)',
  JOURNAL_TEMPLATE: 'The checklist or questions you want clients to journal with',
  ALGORITHM: 'An EA / algorithm file (.ex5, .mq5, .ex4…) plus how to install it',
  GUIDE: 'A playbook, PDF or video link for your clients',
};

export default function PartnerToolsPage() {
  const { accounts, selected, select } = useAccounts();
  const [list, setList] = useState<PartnerProduct[] | null>(null);
  const [gate, setGate] = useState<GateReason | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<PartnerProduct | 'new' | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try { setList(await ibApi.products()); setError(''); }
    catch (e) {
      if (e instanceof PartnerApiError && GATE_CODES.includes(e.code)) setGate(e.code as GateReason);
      else setError(msg(e, 'Could not load your tools.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3000); return () => clearTimeout(t); }, [toast]);

  async function act(fn: () => Promise<unknown>, done: string) {
    try { await fn(); setToast(done); await load(); } catch (e) { setToast(msg(e, 'That didn’t work.')); }
  }

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={select} pageTitle="Tools"
      pageSubtitle="Indicators, templates, EAs and guides for your clients"
      actions={list && !gate && !editing ? <button type="button" className="x-btn x-btn--hi" onClick={() => setEditing('new')} data-testid="tool-new">New tool</button> : null}>
      <div className="x-page" data-testid="partner-tools">
        {gate ? <PartnerGate reason={gate} onApplied={() => {}} /> : <>
          {error && <div className="x-banner x-banner--err" role="alert"><span>{error}</span><button type="button" className="x-btn x-btn--sm" onClick={() => void load()}>Retry</button></div>}
          {!list && !error && <div className="x-skel ac-sk-320" />}
          {list && editing && <ToolEditor tool={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={async (t, note) => { setEditing(null); setToast(note ?? `${t.name} saved.`); await load(); }} />}

          {list && !editing && list.length === 0 && (
            <EmptyState icon="note" ghost="cards" title="Share your own tools" actions={<button type="button" className="x-btn x-btn--hi" onClick={() => setEditing('new')}>Add a tool</button>}
              hints={['Indicators and chart templates', 'Journal templates and checklists', 'EAs and algorithms, as files', 'Guides, PDFs and video links']}>
              Add them to a package and every client who unlocks it gets them. TRADElogs reviews each one first.
            </EmptyState>
          )}

          {list && list.length > 0 && (
            <div className="ib-pkgs">
              {list.map(t => {
                const I = ICON[t.type];
                return (
                  <article key={t.id} className="x-card ib-pkg" data-testid={`tool-${t.name}`}>
                    <div className="ib-pkg-h">
                      <div><h3><I size={18} weight="duotone" aria-hidden /> {t.name}</h3><p>{PRODUCT_TYPE_LABEL[t.type]}{t.platform ? ` · ${t.platform}` : ''} · v{t.version}</p></div>
                      <span className={`x-tag ${STATUS[t.status].c} ib-pill`}>{STATUS[t.status].l}</span>
                    </div>
                    {t.description && <p className="ib-note">{t.description}</p>}
                    {t.status === 'REJECTED' && t.reviewNote && <p className="ib-app-note">TRADElogs: {t.reviewNote}</p>}
                    <div className="ib-rules">
                      {t.content && <span><Code size={14} weight="duotone" />Code / text</span>}
                      {t.fileName && <span><FileArrowUp size={14} weight="duotone" />{t.fileName} · {Math.ceil((t.fileSize ?? 0) / 1024)} KB</span>}
                      {t.url && <span>Link</span>}
                      <span>{t.packages.length ? `In ${t.packages.join(', ')}` : 'Not in a package yet'}</span>
                    </div>
                    <div className="ib-pkg-ft">
                      <span><b className="m">{n(t.users30d)}</b> clients opened it · <b className="m">{n(t.opens30d)}</b> opens, 30d</span>
                      <span className="ib-br-btns">
                        <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => setEditing(t)}><PencilSimple size={14} weight="bold" />Edit</button>
                        {(t.status === 'DRAFT' || t.status === 'REJECTED') && <button type="button" className="x-btn x-btn--sm x-btn--hi" onClick={() => void act(() => ibApi.submitProduct(t.id), 'Sent for review.')} data-testid={`tool-submit-${t.name}`}><PaperPlaneTilt size={14} weight="bold" />Send for review</button>}
                        <button type="button" className="x-btn x-btn--sm x-btn--ghost" aria-label={`Archive ${t.name}`} onClick={() => void act(() => ibApi.updateProduct(t.id, { archived: true }), `${t.name} archived.`)}><Trash size={14} weight="bold" /></button>
                      </span>
                    </div>
                    <small className="x-dim">Updated {timeAgo(t.updatedAt)}</small>
                  </article>
                );
              })}
            </div>
          )}
          <p className="ac-br-note">Editing the code, link or file of an approved tool sends the new version for review; clients get it once it&rsquo;s approved.</p>
        </>}
      </div>
      {toast && <div className="ac-toast" role="status">{toast}</div>}
    </AppShell>
  );
}

function ToolEditor({ tool, onCancel, onSaved }: { tool: PartnerProduct | null; onCancel: () => void; onSaved: (t: PartnerProduct, note?: string) => void }) {
  const [f, setF] = useState<ProductInput>(tool
    ? { type: tool.type, name: tool.name, description: tool.description ?? '', platform: tool.platform ?? '', content: tool.content ?? '', url: tool.url ?? '' }
    : { type: 'INDICATOR', name: '', description: '', platform: 'TradingView', content: '', url: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const urlOk = !f.url || /^https?:\/\/\S+\.\S+/.test(f.url);
  const valid = f.name.trim().length >= 2 && urlOk && (!file || file.size <= 2 * 1024 * 1024);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const body: ProductInput = { type: f.type, name: f.name.trim(), description: f.description?.trim() || '', ...(f.platform ? { platform: f.platform } : {}), content: f.content ?? '', url: f.url?.trim() || '' };
      let t = tool ? await ibApi.updateProduct(tool.id, body) : await ibApi.createProduct(body);
      if (file) {
        const data = await new Promise<string>((ok, bad) => {
          const r = new FileReader();
          r.onload = () => ok(String(r.result).split(',')[1] ?? '');
          r.onerror = () => bad(new Error('Could not read the file.'));
          r.readAsDataURL(file);
        });
        t = await ibApi.productFile(t.id, file.name, file.type || 'application/octet-stream', data);
      }
      onSaved(t, tool?.status === 'APPROVED' && t.status === 'PENDING' ? 'Saved. The new version is waiting for review.' : undefined);
    } catch (x) { setErr(msg(x, 'Could not save the tool.')); } finally { setBusy(false); }
  }

  return (
    <section className="x-card" data-testid="tool-editor">
      <div className="x-ch"><h2>{tool ? `Edit ${tool.name}` : 'New tool'}</h2><div className="x-r"><button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={onCancel}>Cancel</button></div></div>
      <form className="ac-form ac-form--wide" onSubmit={save}>
        <div className="ib-form-row">
          <div className="x-field"><label htmlFor="tl-type">Type</label>
            <select id="tl-type" className="x-select" value={f.type} onChange={e => setF({ ...f, type: e.target.value as ProductType })}>
              {(Object.keys(PRODUCT_TYPE_LABEL) as ProductType[]).map(k => <option key={k} value={k}>{PRODUCT_TYPE_LABEL[k]}</option>)}
            </select></div>
          <div className="x-field"><label htmlFor="tl-name">Name</label><input id="tl-name" className="x-input" maxLength={80} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Honey Trend Ribbon" data-testid="tool-name" /></div>
          <div className="x-field"><label htmlFor="tl-plat">Works with</label>
            <select id="tl-plat" className="x-select" value={f.platform ?? ''} onChange={e => setF({ ...f, platform: e.target.value })}>
              {['TradingView', 'MT4', 'MT5', 'TRADElogs', 'Other'].map(p => <option key={p} value={p}>{p}</option>)}
            </select></div>
        </div>
        <div className="x-field"><label htmlFor="tl-desc">What it does <span className="x-dim">(optional)</span></label><input id="tl-desc" className="x-input" maxLength={1000} value={f.description ?? ''} onChange={e => setF({ ...f, description: e.target.value })} placeholder="One or two lines for your clients" /></div>
        <div className="x-field">
          <label htmlFor="tl-content">Code, template or text <span className="x-dim">(optional)</span></label>
          <textarea id="tl-content" className="x-textarea ib-code" rows={8} maxLength={200_000} value={f.content ?? ''} onChange={e => setF({ ...f, content: e.target.value })} placeholder={HINT[f.type]} data-testid="tool-content" />
        </div>
        <div className="ib-form-row">
          <div className="x-field"><label htmlFor="tl-url">Link <span className="x-dim">(optional)</span></label><input id="tl-url" className="x-input" type="url" value={f.url ?? ''} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://" />
            {!urlOk && <span className="x-help ib-err">Use a full https:// link.</span>}</div>
          <div className="x-field"><label htmlFor="tl-file">File <span className="x-dim">(optional, up to 2 MB)</span></label>
            <input id="tl-file" className="x-input" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} />
            {tool?.fileName && !file && <span className="x-help">Current: {tool.fileName}</span>}
            {file && file.size > 2 * 1024 * 1024 && <span className="x-help ib-err">That file is over 2 MB.</span>}</div>
        </div>
        {err && <div className="x-banner x-banner--err" role="alert"><span>{err}</span></div>}
        <div><button type="submit" className="x-btn x-btn--hi" disabled={!valid || busy} data-testid="tool-save">{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </section>
  );
}
