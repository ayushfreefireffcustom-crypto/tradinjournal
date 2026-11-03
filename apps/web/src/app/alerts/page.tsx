'use client';

// Indicator alerts (E4): rules like "RSI(14) crosses below 30 on BTCUSDT 1h",
// checked at every bar close, with recent firings. Price-level alerts stay on
// the Charts page.
import Link from '@/components/v6/ui/link';
import { useEffect, useMemo, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ago, useLoad, usePoll } from '@/components/v6/ui/data';
import ErrorCard from '@/components/v6/ui/error-card';
import Modal from '@/components/v6/ui/modal';
import SymbolSearch from '@/components/charts/symbol-search';
import { ApiError } from '@/lib/copy-api';
import OperandPicker from '@/components/v6/indicators/operand-picker';
import {
  IA_OPERATORS, IA_TIMEFRAMES, OPERATOR_LABEL, comparable, indicatorAlertsApi,
  type CatalogueItem, type IaOperator, type IaTimeframe, type IndicatorAlert, type IndicatorOperand, type Operand, type Preview, type RuleBody,
  type WatchRule,
} from '@/lib/indicator-alerts-api';
import { Kpi, Pair } from '@/components/v6/ui/lux';
import '@/styles/v6/kit.css';
import '@/styles/v6/tools.css';
import '@/styles/v6/markets.css';

const MAX_RULES = 50;
const fmt = (v: number | null | undefined) => (v == null ? '—' : Math.abs(v) >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 1 }) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));
const COOLDOWNS: Array<{ sec: number; label: string }> = [
  { sec: 0, label: 'No limit' }, { sec: 900, label: '15 min' }, { sec: 3600, label: '1 hour' }, { sec: 14_400, label: '4 hours' }, { sec: 86_400, label: '1 day' },
];
const cooldownLabel = (s: number) => COOLDOWNS.find(c => c.sec === s)?.label ?? `${Math.round(s / 60)} min`;
const EVERY: Record<number, string> = { 900: '15 minutes', 3600: 'hour', 14_400: '4 hours', 86_400: 'day' };
const repeatLabel = (r: IndicatorAlert) => (!r.recurring ? 'Once, then stops' : r.cooldownSec === 0 ? 'Repeats on every qualifying bar' : `Repeats, at most once every ${EVERY[r.cooldownSec] ?? cooldownLabel(r.cooldownSec)}`);
const ind = (id: string, output = 'value', params?: Record<string, number>): IndicatorOperand => ({ kind: 'indicator', id, output, ...(params ? { params } : {}) });

const PRESETS: Array<{ name: string; tf?: IaTimeframe; left: IndicatorOperand; operator: IaOperator; right: Operand }> = [
  { name: 'RSI oversold', left: ind('rsi', 'value', { length: 14 }), operator: 'crosses_below', right: { kind: 'value', value: 30 } },
  { name: 'RSI overbought', left: ind('rsi', 'value', { length: 14 }), operator: 'crosses_above', right: { kind: 'value', value: 70 } },
  { name: 'Golden cross', left: ind('ema', 'value', { length: 50 }), operator: 'crosses_above', right: ind('ema', 'value', { length: 200 }) },
  { name: 'MACD bullish cross', left: ind('macd', 'macd'), operator: 'crosses_above', right: ind('macd', 'signal') },
  { name: 'Bollinger breakout', left: ind('price', 'close'), operator: 'crosses_above', right: ind('bb', 'upper') },
  { name: 'Volume spike', left: ind('volume'), operator: 'gt', right: ind('volsma', 'value', { length: 20 }) },
  { name: 'Up 5% in 24h', tf: '1h', left: ind('roc', 'value', { length: 24 }), operator: 'gt', right: { kind: 'value', value: 5 } },
];

export default function AlertsPage() {
  const toast = useToast();
  const cat = useLoad(() => indicatorAlertsApi.catalogue(), []);
  const rules = useLoad(() => indicatorAlertsApi.list(), []);
  const firings = useLoad(() => indicatorAlertsApi.firings(30), []);
  usePoll(() => { void rules.reload(); void firings.reload(); }, 60_000);
  const [building, setBuilding] = useState(false);
  const [deleting, setDeleting] = useState<IndicatorAlert | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const count = rules.data?.length ?? 0;

  async function setStatus(r: IndicatorAlert, status: 'active' | 'paused') {
    setBusyId(r.id);
    try {
      const next = await indicatorAlertsApi.update(r.id, { status });
      rules.setData(rs => rs?.map(x => (x.id === r.id ? next : x)) ?? rs);
      toast.success(status === 'paused' ? 'Alert paused' : r.status === 'triggered' ? 'Alert re-armed' : 'Alert resumed');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the alert');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell legacy={false} pageTitle="Indicator alerts" pageSubtitle="Get told when an indicator triggers"
      actions={<button className="x-btn x-btn--hi" onClick={() => setBuilding(true)} disabled={!cat.data || count >= MAX_RULES} title={count >= MAX_RULES ? `Up to ${MAX_RULES} alerts` : undefined} data-testid="ia-new">New alert</button>}>
      <div className="x-page" data-testid="ia-page">
        {!!rules.data?.length && (
          <section className="lx-kpis" aria-label="Summary" data-testid="ia-kpis">
            <Kpi label="Watching" value={<span className="m">{rules.data.filter(r => r.status === 'active').length}<small>active</small></span>} sub={`${count} of ${MAX_RULES} alerts used`} />
            <Kpi label="Fired in 24 hours" value={<span className="m">{(firings.data ?? []).filter(f => Date.now() - new Date(f.firedAt).getTime() < 86_400_000).length}</span>} sub="Checked at every bar close" />
            <Kpi label="Waiting to re-arm" value={<span className="m">{rules.data.filter(r => r.status === 'triggered').length}</span>} sub="Fired once and stopped" />
          </section>
        )}
        {rules.error ? <ErrorCard message={rules.error} onRetry={rules.reload} /> : !rules.data ? <div className="x-skel cp-skel-table" /> : !rules.data.length ? (
          <div className="x-card x-empty" data-testid="ia-empty">
            <b>No indicator alerts yet</b>
            <p>Pick a condition such as &ldquo;RSI crosses below 30&rdquo; or &ldquo;EMA 50 crosses above EMA 200&rdquo;. It&rsquo;s checked every time a bar closes, and you&rsquo;re notified in your inbox, by push and on Telegram if you&rsquo;ve linked it.</p>
            <button className="x-btn x-btn--hi" onClick={() => setBuilding(true)} disabled={!cat.data}>Create your first alert</button>
          </div>
        ) : (
          <section className="x-card" aria-label="Your alerts">
            <div className="x-ch"><h2>Your alerts</h2><span className="x-sub">{count} of {MAX_RULES}</span></div>
            <div className="x-tblwrap">
              <table className="x-tbl trd-tbl ia-tbl" data-testid="ia-table">
                <thead><tr><th>Market</th><th>Condition</th><th>At last close</th><th>Last alert</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {rules.data.map(r => (
                    <tr key={r.id} className={r.status === 'active' ? '' : 'ak-off'} data-testid={`ia-row-${r.id}`}>
                      <td><span className="ia-mkt"><Link className="sc-pair" href={`/charts?symbol=${encodeURIComponent(r.symbol)}&tf=${r.timeframe}`}><Pair base={r.symbol} quote={null} /></Link><span className="x-tag x-tag--m">{r.timeframe}</span></span></td>
                      <td>{r.rule && <b className="ia-rulename">{r.rule.name}</b>}<span data-testid="ia-desc">{r.description}</span>{r.note && <div className="x-muted ia-note">{r.note}</div>}<div className="x-muted ia-note">{repeatLabel(r)}</div>
                        <details className="ia-why" data-testid="ia-why"><summary>What it means</summary><p>{r.explanation.what}</p><p><b>Why it matters.</b> {r.explanation.why}</p><p><b>Where it misleads.</b> {r.explanation.caution}</p></details></td>
                      <td>{r.lastBarTime ? <span className="m">{fmt(r.lastLeft)}{r.right.kind === 'indicator' && <> vs {fmt(r.lastRight)}</>}</span> : <span className="x-muted">Waiting for a bar close</span>}</td>
                      <td>{r.lastFiredAt ? ago(r.lastFiredAt) : <span className="x-muted">Never</span>}</td>
                      <td><span className={`st-status ia-st--${r.status}`} data-testid="ia-status">{r.status === 'active' ? 'Active' : r.status === 'paused' ? 'Paused' : 'Triggered'}</span></td>
                      <td className="trd-acts">
                        {r.status === 'active'
                          ? <button className="x-btn x-btn--sm" disabled={busyId === r.id} onClick={() => void setStatus(r, 'paused')} data-testid="ia-pause">Pause</button>
                          : <button className="x-btn x-btn--sm" disabled={busyId === r.id} onClick={() => void setStatus(r, 'active')} data-testid="ia-resume">{r.status === 'triggered' ? 'Re-arm' : 'Resume'}</button>}
                        <button className="x-btn x-btn--sm x-btn--ghost cp-del" onClick={() => setDeleting(r)} data-testid="ia-delete">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <WatchRules onCreated={(a) => { rules.setData((rs) => [a, ...(rs ?? [])]); toast.success(`Watching ${a.rule?.name ?? 'it'} on ${a.symbol}`); }} />
        <section className="x-card" aria-label="Recent alerts">
          <div className="x-ch"><h2>Recent alerts</h2><span className="x-sub">Last 30</span></div>
          {firings.error ? <p className="cp-err">{firings.error}</p> : !firings.data ? <div className="x-skel cp-skel-table" /> : !firings.data.length ? (
            <p className="x-muted ia-none" data-testid="ia-firings-empty">Nothing has fired yet. Alerts are checked when each bar closes, so a 1h alert can take up to an hour to fire.</p>
          ) : (
            <ul className="ia-firings" data-testid="ia-firings">
              {firings.data.map(f => (
                <li key={f.id}>
                  <span className="ia-when" title={new Date(f.firedAt).toLocaleString()}>{ago(f.firedAt)}</span>
                  <Link className="x-link" href={`/charts?symbol=${encodeURIComponent(f.symbol)}&tf=${f.timeframe}`}><b>{f.symbol}</b> {f.timeframe}</Link>
                  <span>{f.description}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {building && cat.data && (
        <RuleBuilder catalogue={cat.data} onClose={() => setBuilding(false)} onCreated={(a) => { setBuilding(false); rules.setData(rs => [a, ...(rs ?? [])]); toast.success('Alert created'); }} />
      )}
      {deleting && (
        <Modal title="Delete this alert?" sub={`${deleting.symbol} ${deleting.timeframe}: ${deleting.description}`} onClose={() => setDeleting(null)} testId="ia-delete-dialog"
          footer={<><button className="x-btn x-btn--ghost" onClick={() => setDeleting(null)}>Keep it</button><button className="x-btn x-btn--hi cp-del" data-testid="ia-delete-confirm" onClick={async () => {
            try { await indicatorAlertsApi.remove(deleting.id); rules.setData(rs => rs?.filter(x => x.id !== deleting.id) ?? rs); setDeleting(null); toast.success('Alert deleted'); void firings.reload(); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not delete'); }
          }}>Delete</button></>}>
          <p className="cp-fine">Its alert history is deleted with it.</p>
        </Modal>
      )}
    </AppShell>
  );
}

function RuleBuilder({ catalogue, onClose, onCreated }: { catalogue: CatalogueItem[]; onClose: () => void; onCreated: (a: IndicatorAlert) => void }) {
  const toast = useToast();
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [tf, setTf] = useState<IaTimeframe>('1h');
  const [left, setLeft] = useState<IndicatorOperand>(PRESETS[0]!.left);
  const [operator, setOperator] = useState<IaOperator>(PRESETS[0]!.operator);
  const [right, setRight] = useState<Operand>(PRESETS[0]!.right);
  const [cooldownSec, setCooldown] = useState(3600);
  const [recurring, setRecurring] = useState(true);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);

  const scaleOf = (o: IndicatorOperand) => catalogue.find(c => c.id === o.id)?.outputs.find(x => x.key === o.output)?.scale ?? 'price';
  const leftKey = { id: left.id, scale: scaleOf(left) };
  const allowRight = (it: CatalogueItem, out: CatalogueItem['outputs'][number]) => comparable(leftKey, { id: it.id, scale: out.scale });
  const canCompareIndicator = catalogue.some(it => it.outputs.some(o => allowRight(it, o)));
  const firstRight = (): IndicatorOperand | null => {
    for (const it of catalogue) for (const o of it.outputs) if (allowRight(it, o) && !(it.id === left.id && o.key === left.output)) return { kind: 'indicator', id: it.id, output: o.key, params: Object.fromEntries(it.params.map(p => [p.key, p.default])) };
    return null;
  };

  // A new left side that can't be compared with the current right one: compare with a value instead.
  useEffect(() => {
    if (right.kind === 'indicator' && !comparable(leftKey, { id: right.id, scale: scaleOf(right) })) setRight({ kind: 'value', value: scaleOf(left) === 'percent' ? 50 : 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left.id, left.output]);

  const body: RuleBody = useMemo(() => ({ symbol, timeframe: tf, left, operator, right, cooldownSec, recurring, ...(note.trim() ? { note: note.trim() } : {}) }), [symbol, tf, left, operator, right, cooldownSec, recurring, note]);
  const invalid = [left, right].some(o => o.kind === 'indicator' ? Object.values(o.params ?? {}).some(v => !Number.isFinite(v)) : !Number.isFinite(o.value));

  // Live check against the last closed bar.
  useEffect(() => {
    if (invalid) { setPreview(null); setPreviewErr('Fill in every number.'); return; }
    let live = true;
    setChecking(true);
    const t = setTimeout(() => {
      indicatorAlertsApi.preview({ symbol, timeframe: tf, left, operator, right })
        .then(p => { if (live) { setPreview(p); setPreviewErr(null); } })
        .catch(e => { if (live) { setPreview(null); setPreviewErr(e instanceof Error ? e.message : 'Could not check this rule'); } })
        .finally(() => { if (live) setChecking(false); });
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [symbol, tf, left, operator, right, invalid]);

  function applyPreset(p: (typeof PRESETS)[number]) {
    setLeft(p.left); setOperator(p.operator); setRight(p.right);
    if (p.tf) setTf(p.tf);
  }

  async function create() {
    setBusy(true);
    try {
      onCreated(await indicatorAlertsApi.create(body));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not create the alert');
      setBusy(false);
    }
  }

  const crossing = operator === 'crosses_above' || operator === 'crosses_below';
  return (
    <Modal title="New indicator alert" wide onClose={onClose} busy={busy} testId="ia-builder"
      footer={<><button className="x-btn x-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="x-btn x-btn--hi" onClick={() => void create()} disabled={busy || invalid || !!previewErr || checking} data-testid="ia-create">{busy ? 'Creating…' : 'Create alert'}</button></>}>
      <div className="ia-body">
      <div className="x-field">
        <label>Quick start</label>
        <div className="ia-presets">
          {PRESETS.map(p => <button key={p.name} type="button" className="x-btn x-btn--sm" onClick={() => applyPreset(p)} data-testid={`ia-preset-${p.name.replace(/\W+/g, '-').toLowerCase()}`}>{p.name}</button>)}
        </div>
      </div>
      <div className="ia-grid">
        <div className="x-field"><label>Market</label><SymbolSearch value={symbol} onSelect={setSymbol} /></div>
        <div className="x-field">
          <label>Timeframe</label>
          <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Timeframe">
            {IA_TIMEFRAMES.map(t => <button key={t} type="button" role="radio" aria-checked={tf === t} onClick={() => setTf(t)} data-testid={`ia-tf-${t}`}>{t}</button>)}
          </div>
        </div>
      </div>
      <div className="x-field">
        <label>When</label>
        <OperandPicker catalogue={catalogue} value={left} onChange={setLeft} label="When" testId="ia-left" />
      </div>
      <div className="x-field">
        <label htmlFor="ia-opsel">Condition</label>
        <select id="ia-opsel" className="x-select" value={operator} onChange={e => setOperator(e.target.value as IaOperator)} data-testid="ia-operator">
          {IA_OPERATORS.map(o => <option key={o} value={o}>{OPERATOR_LABEL[o]}</option>)}
        </select>
      </div>
      <div className="x-field">
        <div className="ia-than">
          <label>Than</label>
          <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Compare with">
            <button type="button" role="radio" aria-checked={right.kind === 'value'} onClick={() => right.kind !== 'value' && setRight({ kind: 'value', value: preview?.left != null ? Number(fmt(preview.left).replace(/,/g, '')) : 0 })} data-testid="ia-right-value">A number</button>
            <button type="button" role="radio" aria-checked={right.kind === 'indicator'} disabled={!canCompareIndicator} onClick={() => { const r = firstRight(); if (r && right.kind !== 'indicator') setRight(r); }} data-testid="ia-right-ind">Another line</button>
          </div>
        </div>
        {right.kind === 'value'
          ? <input className="x-input m" type="number" inputMode="decimal" aria-label="Value" value={Number.isFinite(right.value) ? right.value : ''} onChange={e => setRight({ kind: 'value', value: e.target.value === '' ? NaN : Number(e.target.value) })} data-testid="ia-value" />
          : <OperandPicker catalogue={catalogue} value={right} onChange={setRight} allow={allowRight} label="Than" testId="ia-right" />}
      </div>

      <div className={`ia-preview ${previewErr ? 'is-err' : preview?.met ? 'is-met' : ''}`} aria-live="polite" data-testid="ia-preview">
        {previewErr ? <span className="cp-err">{previewErr}</span>
          : !preview ? <span className="x-muted">Checking…</span>
          : !preview.enoughData ? <span>Not enough history yet: {preview.bars} closed bars. The alert will start once there are enough.</span>
          : <>
              <span data-testid="ia-preview-now">{right.kind === 'indicator'
                ? <>{preview.leftLabel} is <b className="m">{fmt(preview.left)}</b> and {preview.rightLabel} is <b className="m">{fmt(preview.right)}</b> now.</>
                : <>{preview.leftLabel} is <b className="m">{fmt(preview.left)}</b> now.</>}</span>{' '}
              <span className="x-muted" data-testid="ia-preview-met">{preview.met ? 'Condition met' : 'Not met'} on the {preview.timeframe} bar that opened {new Date(preview.barTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.</span>
            </>}
      </div>
      <p className="cp-fine">{crossing ? 'Alerts on the bar close where the cross happens.' : 'Alerts at the bar close where this becomes true, not on every bar it stays true.'} Checked only on closed bars, so a wick that reverses doesn&rsquo;t count.</p>

      <div className="ia-grid">
        <div className="x-field">
          <label>Repeat</label>
          <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Repeat">
            <button type="button" role="radio" aria-checked={recurring} onClick={() => setRecurring(true)} data-testid="ia-repeat">Every time</button>
            <button type="button" role="radio" aria-checked={!recurring} onClick={() => setRecurring(false)} data-testid="ia-once">Once</button>
          </div>
        </div>
        {recurring && (
          <div className="x-field">
            <label htmlFor="ia-cool">At most once per</label>
            <select id="ia-cool" className="x-select" value={cooldownSec} onChange={e => setCooldown(Number(e.target.value))} data-testid="ia-cooldown">
              {COOLDOWNS.map(c => <option key={c.sec} value={c.sec}>{c.sec === 0 ? 'Bar (no limit)' : c.label}</option>)}
            </select>
          </div>
        )}
      </div>
      <div className="x-field"><label htmlFor="ia-note">Note <span className="x-muted">(optional)</span></label><input id="ia-note" className="x-input" maxLength={200} placeholder="e.g. Look for a long at support" value={note} onChange={e => setNote(e.target.value)} data-testid="ia-note" /></div>
      </div>
    </Modal>
  );
}

// ── Watch rules (H12): well-known conditions, explained, one click to watch ──
const CAT_ICON: Record<WatchRule['category'], string> = {
  trend: 'M4 17l5-5 4 4 7-8M15 8h5v5',
  momentum: 'M13 3L5 14h6l-1 7 8-11h-6z',
  volatility: 'M3 12h3l3-7 4 14 3-7h5',
  volume: 'M5 20v-6M10 20V9M15 20v-4M20 20V4',
};
const CATS: Array<['all' | WatchRule['category'], string]> = [['all', 'All'], ['trend', 'Trend'], ['momentum', 'Momentum'], ['volatility', 'Volatility'], ['volume', 'Volume']];
function WatchRules({ onCreated }: { onCreated: (a: IndicatorAlert) => void }) {
  const toast = useToast();
  const list = useLoad(() => indicatorAlertsApi.watchRules(), []);
  const [cat, setCat] = useState<'all' | WatchRule['category']>('all');
  const [pick, setPick] = useState<WatchRule | null>(null);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [tf, setTf] = useState('4h');
  const [busy, setBusy] = useState(false);
  async function watch() {
    if (!pick) return;
    setBusy(true);
    try { onCreated(await indicatorAlertsApi.watch({ ruleId: pick.id, symbol: symbol.trim().toUpperCase(), timeframe: tf })); setPick(null); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not watch it'); }
    finally { setBusy(false); }
  }
  if (!list.data?.length) return null;
  const shown = list.data.filter((r) => cat === 'all' || r.category === cat);
  return (
    <section className="x-card" aria-label="Watch rules" data-testid="ia-watch">
      <div className="x-ch"><h2>Watch rules</h2><span className="x-sub">Pick a signal and a market</span></div>
      <div className="x-seg x-seg--in x-seg--sm ia-watch-cats" role="radiogroup" aria-label="Kind">{CATS.map(([c, l]) => <button key={c} type="button" role="radio" aria-checked={cat === c} onClick={() => setCat(c)} data-testid={`ia-wcat-${c}`}>{l}</button>)}</div>
      <div className="ia-watch-grid">
        {shown.map((r) => (
          <article key={r.id} className="ia-wr" data-testid={`ia-wr-${r.id}`}>
            <div className="ia-wr-h"><span className={`lx-ic ${r.bias === 'bullish' ? 'lx-ic--g' : ''}`} aria-hidden><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={CAT_ICON[r.category]} /></svg></span><b>{r.name}</b><span className={`x-tag ${r.bias === 'bullish' ? 'x-tag--g' : r.bias === 'bearish' ? 'x-tag--r' : ''}`}>{r.bias === 'neutral' ? 'Either way' : r.bias === 'bullish' ? 'Bullish' : 'Bearish'}</span></div>
            <p title={`${r.explain.why} ${r.explain.caution}`}>{r.explain.what}</p>
            <button type="button" className="x-btn x-btn--sm" onClick={() => { setPick(r); setTf(r.timeframe); }} data-testid={`ia-wr-watch-${r.id}`}>+ Watch</button>
          </article>
        ))}
      </div>
      {pick && (
        <Modal title={`Watch: ${pick.name}`} sub={pick.condition} onClose={() => setPick(null)} busy={busy} testId="ia-watch-dialog"
          footer={<><button className="x-btn x-btn--ghost" onClick={() => setPick(null)} disabled={busy}>Cancel</button><button className="x-btn x-btn--hi" onClick={() => void watch()} disabled={busy || !/^[A-Za-z0-9]{2,30}$/.test(symbol.trim())} data-testid="ia-watch-go">{busy ? 'Saving…' : 'Watch it'}</button></>}>
          <div className="ia-watch-form">
            <div className="x-field"><label htmlFor="ia-w-sym">Market</label><input id="ia-w-sym" className="x-input m" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} data-testid="ia-watch-symbol" /></div>
            <div className="x-field"><label htmlFor="ia-w-tf">Bar size</label><select id="ia-w-tf" className="x-select" value={tf} onChange={(e) => setTf(e.target.value)} data-testid="ia-watch-tf">{['15m', '1h', '4h', '1d'].map((t) => <option key={t}>{t}</option>)}</select></div>
            <p className="x-muted">Checked at each bar close; you’re told at most once every {pick.cooldownSec >= 86_400 ? `${pick.cooldownSec / 86_400} day` : `${pick.cooldownSec / 3600} hours`}. The alert explains what it means when it fires.</p>
          </div>
        </Modal>
      )}
    </section>
  );
}
