'use client';

// Screener (E5/E6): filter the most-traded crypto pairs by indicators and
// market fields. Filters inside a group must all match; any group can match.
// Quick screens, saved screens, CSV export and a Trade button per row.
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, Modal, useLoad } from '@/components/v6/copy/parts';
import OperandPicker from '@/components/v6/indicators/operand-picker';
import OrderTicketDialog from '@/components/v6/trading/order-ticket';
import { ApiError, tradingApi } from '@/lib/copy-api';
import { TRADING_ENABLED } from '@/lib/features';
import { comparable, indicatorAlertsApi, IA_OPERATORS, OPERATOR_LABEL, type CatalogueItem, type IaOperator, type IndicatorOperand, type Operand } from '@/lib/indicator-alerts-api';
import {
  FIELD_LABEL, SCREENER_TIMEFRAMES, SCREENER_UNIVERSES, screenerApi,
  type SavedScreen, type ScreenDefinition, type ScreenerField, type ScreenerFilter, type ScreenResult, type ScreenRow, type ScreenerTimeframe,
} from '@/lib/screener-api';
import { useExchangeConnections } from '@/lib/use-exchange-connections';
import '@/styles/v6/copy.css';

// ── Editable rows ─────────────────────────────────────────────────────────────
// A row is one filter in the editor; "between" is two filters when run.
type Subject = 'indicator' | ScreenerField;
type RowOp = IaOperator | 'between';
interface Row { id: string; subject: Subject; left: IndicatorOperand; operator: RowOp; right: Operand; value2: number }
const FIELD_OPS: RowOp[] = ['gt', 'gte', 'lt', 'lte', 'between'];
const rid = () => Math.random().toString(36).slice(2, 9);
const ind = (id: string, output = 'value', params?: Record<string, number>): IndicatorOperand => ({ kind: 'indicator', id, output, ...(params ? { params } : {}) });
const val = (value: number): Operand => ({ kind: 'value', value });
const RSI = ind('rsi', 'value', { length: 14 });
const newRow = (): Row => ({ id: rid(), subject: 'indicator', left: RSI, operator: 'lt', right: val(30), value2: 70 });

function toFilters(r: Row): ScreenerFilter[] {
  const v = r.right.kind === 'value' ? r.right.value : 0;
  if (r.subject !== 'indicator') {
    if (r.operator === 'between') return [{ type: 'field', field: r.subject, operator: 'gte', value: Math.min(v, r.value2) }, { type: 'field', field: r.subject, operator: 'lte', value: Math.max(v, r.value2) }];
    return [{ type: 'field', field: r.subject, operator: r.operator as 'gt', value: v }];
  }
  if (r.operator === 'between') return [{ type: 'indicator', left: r.left, operator: 'gte', right: val(Math.min(v, r.value2)) }, { type: 'indicator', left: r.left, operator: 'lte', right: val(Math.max(v, r.value2)) }];
  return [{ type: 'indicator', left: r.left, operator: r.operator, right: r.right }];
}
function fromFilter(f: ScreenerFilter): Row {
  return f.type === 'field'
    ? { id: rid(), subject: f.field, left: RSI, operator: f.operator, right: val(f.value), value2: f.value }
    : { id: rid(), subject: 'indicator', left: f.left, operator: f.operator, right: f.right, value2: 0 };
}
/** Rows for a saved group; a "≥ a" right before a "≤ b" on the same line reads back as "between a and b". */
function fromGroup(g: ScreenerFilter[]): Row[] {
  const out: Row[] = [];
  for (let k = 0; k < g.length; k++) {
    const a = g[k]!; const b = g[k + 1];
    const same = b && a.type === b.type && (a.type === 'field' ? a.field === (b as typeof a).field : JSON.stringify(a.left) === JSON.stringify((b as typeof a).left) && a.right.kind === 'value' && (b as typeof a).right.kind === 'value');
    if (same && a.operator === 'gte' && b!.operator === 'lte') {
      const lo = a.type === 'field' ? a.value : (a.right as { value: number }).value;
      const hi = b!.type === 'field' ? b!.value : ((b as typeof a & { type: 'indicator' }).right as { value: number }).value;
      out.push({ ...fromFilter(a), operator: 'between', right: val(lo), value2: hi });
      k += 1;
    } else out.push(fromFilter(a));
  }
  return out;
}
const rowValid = (r: Row) => (r.right.kind === 'value' ? Number.isFinite(r.right.value) : true) && (r.operator !== 'between' || Number.isFinite(r.value2))
  && (r.subject !== 'indicator' || Object.values(r.left.params ?? {}).every(Number.isFinite)) && (r.right.kind !== 'indicator' || Object.values(r.right.params ?? {}).every(Number.isFinite));

// ── Quick screens ─────────────────────────────────────────────────────────────
const f = (field: ScreenerField, operator: 'gt' | 'lt', value: number): ScreenerFilter => ({ type: 'field', field, operator, value });
const i = (left: IndicatorOperand, operator: IaOperator, right: Operand): ScreenerFilter => ({ type: 'indicator', left, operator, right });
const QUICK: Array<{ name: string; groups: ScreenerFilter[][]; sort: ScreenDefinition['sort']; columns?: IndicatorOperand[] }> = [
  { name: 'Oversold', groups: [[i(RSI, 'lt', val(30))]], sort: { by: 'col:0', dir: 'asc' } },
  { name: 'Overbought', groups: [[i(RSI, 'gt', val(70))]], sort: { by: 'col:0', dir: 'desc' } },
  { name: 'Top gainers', groups: [[f('change24h', 'gt', 0)]], sort: { by: 'change24h', dir: 'desc' } },
  { name: 'Top losers', groups: [[f('change24h', 'lt', 0)]], sort: { by: 'change24h', dir: 'asc' } },
  { name: 'Volume surge', groups: [[i(ind('volume'), 'gt', ind('volsma', 'value', { length: 20 }))]], sort: { by: 'volume24h', dir: 'desc' } },
  { name: 'Positive funding', groups: [[f('funding', 'gt', 0.01)]], sort: { by: 'funding', dir: 'desc' } },
  { name: 'Negative funding', groups: [[f('funding', 'lt', 0)]], sort: { by: 'funding', dir: 'asc' } },
  { name: 'Momentum', groups: [[i(ind('price', 'close'), 'gt', ind('ema', 'value', { length: 50 })), i(RSI, 'gt', val(55)), i(ind('roc', 'value', { length: 10 }), 'gt', val(0))]], sort: { by: 'col:2', dir: 'desc' } },
  { name: 'Golden cross', groups: [[i(ind('ema', 'value', { length: 50 }), 'crosses_above', ind('ema', 'value', { length: 200 }))]], sort: { by: 'volume24h', dir: 'desc' } },
];

// ── Formatting ────────────────────────────────────────────────────────────────
const num = (v: number | null | undefined) => (v == null ? '—' : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : Math.abs(v) >= 1 ? v.toFixed(2) : v === 0 ? '0' : v.toPrecision(3));
const px = (v: number) => (v >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toLocaleString('en-US', { maximumSignificantDigits: 6 }));
const pctS = (v: number | null, d = 2) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);
const vol = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`);
const tone = (v: number | null) => (v == null || v === 0 ? '' : v > 0 ? 'pos' : 'neg');

function sortRows(rows: ScreenRow[], sort: ScreenDefinition['sort']): ScreenRow[] {
  const by = sort?.by ?? 'volume24h';
  const dir = sort?.dir === 'asc' ? 1 : -1;
  const ci = by.startsWith('col:') ? Number(by.slice(4)) : -1;
  const get = (r: ScreenRow): number | string | null => (ci >= 0 ? r.values[ci] ?? null : by === 'symbol' ? r.base : (r[by as 'price'] as number | null));
  return [...rows].sort((a, b) => {
    const x = get(a); const y = get(b);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * dir;
  });
}

function csv(res: ScreenResult, rows: ScreenRow[]): string {
  const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ['Symbol', 'Price', '24h change %', '24h volume USDT', 'Funding %', 'Open interest USDT', ...res.columns.map(c => c.label)];
  return [head, ...rows.map(r => [r.symbol, r.price, r.change24h, r.volume24h, r.funding ?? '', r.openInterest ?? '', ...r.values.map(v => v ?? '')])].map(l => l.map(cell).join(',')).join('\n');
}

export default function ScreenerPage() {
  const toast = useToast();
  const cat = useLoad(() => indicatorAlertsApi.catalogue(), []);
  const saved = useLoad(() => screenerApi.screens(), []);
  const connections = useExchangeConnections();
  // Base asset → the first trading account with a live perpetual for it.
  const [tradable, setTradable] = useState<Map<string, { connectionId: string; symbol: string }>>(new Map());
  useEffect(() => {
    if (!TRADING_ENABLED || !connections.length) return;
    tradingApi.instruments().then(accts => {
      const m = new Map<string, { connectionId: string; symbol: string }>();
      for (const a of accts) for (const i of a.instruments) if (!m.has(i.base)) m.set(i.base, { connectionId: a.connectionId, symbol: i.symbol });
      setTradable(m);
    }, () => setTradable(new Map()));
  }, [connections.length]);

  const [tf, setTf] = useState<ScreenerTimeframe>('1h');
  const [universe, setUniverse] = useState<50 | 100 | 200>(100);
  const [groups, setGroups] = useState<Row[][]>(() => QUICK[0]!.groups.map(fromGroup));
  const [sort, setSort] = useState<ScreenDefinition['sort']>(QUICK[0]!.sort);
  const [active, setActive] = useState<{ kind: 'quick' | 'saved'; id: string } | null>({ kind: 'quick', id: QUICK[0]!.name });
  const [res, setRes] = useState<ScreenResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<SavedScreen | null>(null);
  const [trade, setTrade] = useState<{ connectionId: string; symbol: string } | null>(null);
  const seq = useRef(0);

  const valid = groups.every(g => g.every(rowValid));
  const filterCount = groups.reduce((n, g) => n + g.length, 0);
  // The editor is long on a phone: start it folded there so results show first.
  const [filtersOpen, setFiltersOpen] = useState(true);
  useEffect(() => { if (window.matchMedia('(max-width: 760px)').matches) setFiltersOpen(false); }, []);
  const definition = useMemo<ScreenDefinition>(() => ({ timeframe: tf, universe, groups: groups.map(g => g.flatMap(toFilters)).filter(g => g.length), sort }), [tf, universe, groups, sort]);

  async function run(d = definition) {
    const n = ++seq.current;
    setRunning(true);
    setErr(null);
    try {
      const r = await screenerApi.run(d);
      if (n === seq.current) { setRes(r); setDirty(false); }
    } catch (e) {
      if (n === seq.current) { setErr(e instanceof Error ? e.message : 'Could not run the screen'); }
    } finally {
      if (n === seq.current) setRunning(false);
    }
  }
  // First run, and re-run when the timeframe or universe changes.
  useEffect(() => { if (valid) void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tf, universe]);

  function load(groupsIn: ScreenerFilter[][], s: ScreenDefinition['sort'], a: typeof active, t?: ScreenerTimeframe, u?: 50 | 100 | 200) {
    const rows = groupsIn.map(fromGroup);
    setGroups(rows);
    setSort(s);
    setActive(a);
    const nt = t ?? tf; const nu = u ?? universe;
    if (t) setTf(t);
    if (u) setUniverse(u);
    void run({ timeframe: nt, universe: nu, groups: groupsIn, sort: s });
  }
  const edit = (fn: (g: Row[][]) => Row[][]) => { setGroups(fn); setDirty(true); setActive(a => (a?.kind === 'saved' ? a : null)); };
  const patchRow = (gi: number, id: string, patch: Partial<Row>) => edit(gs => gs.map((g, k) => (k === gi ? g.map(r => (r.id === id ? { ...r, ...patch } : r)) : g)));
  const removeRow = (gi: number, id: string) => edit(gs => gs.map((g, k) => (k === gi ? g.filter(r => r.id !== id) : g)).filter(g => g.length));
  const clickSort = (by: string) => { setSort(s => ({ by, dir: s?.by === by && s.dir === 'desc' ? 'asc' : 'desc' })); };

  const rows = useMemo(() => (res ? sortRows(res.rows, sort) : []), [res, sort]);
  const activeSaved = active?.kind === 'saved' ? saved.data?.find(s => s.id === active.id) : undefined;

  function exportCsv() {
    if (!res) return;
    const blob = new Blob([csv(res, rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `screener-${tf}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function updateSaved() {
    if (!activeSaved) return;
    try {
      const s = await screenerApi.update(activeSaved.id, { definition });
      saved.setData(list => list?.map(x => (x.id === s.id ? s : x)) ?? list);
      toast.success(`“${s.name}” updated`);
      void run(); // results now match what was saved
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not update the screen'); }
  }
  const sortHead = (by: string, label: string, cls = '') => (
    <th key={by} className={cls}><button type="button" className={`sc-sort ${sort?.by === by ? 'on' : ''}`} onClick={() => clickSort(by)} aria-sort={sort?.by === by ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} data-testid={`sc-sort-${by}`}>{label}{sort?.by === by ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</button></th>
  );

  return (
    <AppShell legacy={false} pageTitle="Screener" pageSubtitle="The most-traded crypto pairs on Binance, filtered by indicators at the last closed bar"
      actions={<>
        <button className="x-btn" onClick={exportCsv} disabled={!res?.rows.length} data-testid="sc-export">Export CSV</button>
        {activeSaved && dirty
          ? <button className="x-btn x-btn--hi" onClick={() => void updateSaved()} disabled={!valid} data-testid="sc-update">Update “{activeSaved.name}”</button>
          : <button className="x-btn x-btn--hi" onClick={() => setSaving(true)} disabled={!valid} data-testid="sc-save">Save screen</button>}
      </>}>
      <div className="x-page" data-testid="sc-page">
        <section className="x-card sc-quick" aria-label="Screens">
          <div className="sc-chips" role="list">
            {QUICK.map(q => (
              <button key={q.name} type="button" role="listitem" className={`x-btn x-btn--sm ${active?.kind === 'quick' && active.id === q.name ? 'sc-on' : ''}`} onClick={() => load(q.groups, q.sort, { kind: 'quick', id: q.name })} data-testid={`sc-quick-${q.name.replace(/\W+/g, '-').toLowerCase()}`}>{q.name}</button>
            ))}
          </div>
          {!!saved.data?.length && (
            <div className="sc-chips sc-saved" role="list" aria-label="My screens" data-testid="sc-saved">
              <span className="x-muted">My screens</span>
              {saved.data.map(s => (
                <span key={s.id} className={`sc-savedchip ${active?.kind === 'saved' && active.id === s.id ? 'sc-on' : ''}`} role="listitem">
                  <button type="button" onClick={() => load(s.definition.groups, s.definition.sort, { kind: 'saved', id: s.id }, s.definition.timeframe, s.definition.universe)} data-testid={`sc-open-${s.id}`}>{s.name}</button>
                  <button type="button" className="sc-x" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)} data-testid={`sc-del-${s.id}`}>×</button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="x-card sc-editor" aria-label="Filters">
          <div className="sc-top">
            <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Timeframe">
              {SCREENER_TIMEFRAMES.map(t => <button key={t} type="button" role="radio" aria-checked={tf === t} onClick={() => setTf(t)} data-testid={`sc-tf-${t}`}>{t}</button>)}
            </div>
            <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Universe">
              {SCREENER_UNIVERSES.map(u => <button key={u} type="button" role="radio" aria-checked={universe === u} onClick={() => setUniverse(u)} data-testid={`sc-uni-${u}`}>Top {u}</button>)}
            </div>
          </div>
          {!cat.data ? <div className="x-skel" style={{ height: 80 }} /> : (
            <details className="sc-filters" open={filtersOpen} onToggle={e => setFiltersOpen((e.target as HTMLDetailsElement).open)}>
              <summary data-testid="sc-filters-toggle">Filters <span className="x-muted">{filterCount ? `${filterCount} filter${filterCount === 1 ? '' : 's'}${groups.length > 1 ? ` in ${groups.length} “or” groups` : ''}` : 'none'}</span></summary>
              <div className="sc-filters-body">
              {groups.length === 0 && <p className="x-muted sc-none">No filters: every pair in the universe is listed. Add a filter to narrow it down.</p>}
              {groups.map((g, gi) => (
                <div key={gi} className="sc-group" data-testid={`sc-group-${gi}`}>
                  {gi > 0 && <div className="sc-or">or</div>}
                  <div className="sc-ghead"><b>{groups.length > 1 ? `Group ${gi + 1}: ` : ''}match all of</b></div>
                  {g.map(r => <FilterRow key={r.id} row={r} catalogue={cat.data!} onChange={p => patchRow(gi, r.id, p)} onRemove={() => removeRow(gi, r.id)} />)}
                  <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => edit(gs => gs.map((x, k) => (k === gi ? [...x, newRow()] : x)))} disabled={g.length >= 6} data-testid={`sc-add-${gi}`}>+ Add filter</button>
                </div>
              ))}
              <div className="sc-actions">
                <button type="button" className="x-btn x-btn--sm" onClick={() => edit(gs => [...gs, [newRow()]])} disabled={groups.length >= 5} data-testid="sc-add-group">{groups.length ? '+ Add an “or” group' : '+ Add a filter'}</button>
                <button type="button" className="x-btn x-btn--hi" onClick={() => void run()} disabled={running || !valid} data-testid="sc-run">{running ? 'Scanning…' : 'Run screen'}</button>
              </div>
              {!valid && <p className="cp-err">Fill in every number.</p>}
              </div>
            </details>
          )}
        </section>

        {err ? <ErrorCard message={err} onRetry={() => void run()} /> : !res ? <div className="x-skel cp-skel-table" /> : (
          <section className={`x-card ${running ? 'sc-stale' : ''}`} aria-label="Results" aria-busy={running}>
            <div className="x-ch">
              <h2 data-testid="sc-count">{res.matched} of {res.scanned} match</h2>
              <span className="x-sub" data-testid="sc-meta">
                {res.barTime ? `${res.timeframe} bar that opened ${new Date(res.barTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : `24h stats as of ${new Date(res.asOf).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
                {' · '}funding {res.fundingSource ? `from ${res.fundingSource === 'bybit' ? 'Bybit' : 'Binance'} perpetuals` : 'unavailable'}
                {dirty && ' · filters changed, run again to update'}
              </span>
            </div>
            {res.noData.length > 0 && <p className="x-muted sc-nodata">No {res.timeframe} candles for {res.noData.length === 1 ? res.noData[0] : `${res.noData.length} pairs`}; left out.</p>}
            {!rows.length ? (
              <div className="x-empty" data-testid="sc-empty"><b>Nothing matches right now</b><p>Try a longer timeframe, the top 200, or looser filters.</p></div>
            ) : (
              <div className="x-tblwrap">
                <table className="x-tbl trd-tbl sc-tbl" data-testid="sc-table">
                  <thead><tr>
                    {sortHead('symbol', 'Pair')}{sortHead('price', 'Price', 'r')}{sortHead('change24h', '24h', 'r')}{sortHead('volume24h', 'Volume 24h', 'r')}{sortHead('funding', 'Funding', 'r')}{sortHead('openInterest', 'Open interest', 'r')}
                    {res.columns.map((c, k) => sortHead(`col:${k}`, c.label, 'r'))}
                    <th />
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.symbol} data-testid={`sc-row-${r.symbol}`}>
                        <td><Link className="x-link" href={`/charts?symbol=${r.symbol}&tf=${res.timeframe}`}><b>{r.base}</b></Link><span className="x-muted sc-quote">/USDT</span></td>
                        <td className="r m" data-label="Price">{px(r.price)}</td>
                        <td className={`r m ${tone(r.change24h)}`} data-label="24h">{pctS(r.change24h)}</td>
                        <td className="r m" data-label="Volume 24h">{vol(r.volume24h)}</td>
                        <td className={`r m ${tone(r.funding)}`} data-label="Funding">{pctS(r.funding, 4)}</td>
                        <td className="r m" data-label="Open interest">{r.openInterest == null ? '—' : vol(r.openInterest)}</td>
                        {r.values.map((v, k) => <td key={k} className="r m" data-label={res.columns[k]!.label}>{num(v)}</td>)}
                        <td className="trd-acts">
                          <Link className="x-btn x-btn--sm" href={`/charts?symbol=${r.symbol}&tf=${res.timeframe}`}>Chart</Link>
                          {tradable.has(r.base) && <button className="x-btn x-btn--sm" onClick={() => setTrade(tradable.get(r.base)!)} title={`Trade ${tradable.get(r.base)!.symbol}`} data-testid={`sc-trade-${r.symbol}`}>Trade</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>

      {saving && <SaveDialog onClose={() => setSaving(false)} onSave={async (name) => {
        try {
          const s = await screenerApi.save(name, definition);
          saved.setData(list => [s, ...(list ?? [])]);
          setActive({ kind: 'saved', id: s.id });
          if (dirty) void run(); else setDirty(false);
          setSaving(false);
          toast.success(`Saved “${s.name}”`);
        } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not save the screen'); }
      }} />}
      {deleting && (
        <Modal title={`Delete “${deleting.name}”?`} onClose={() => setDeleting(null)} testId="sc-delete-dialog"
          footer={<><button className="x-btn x-btn--ghost" onClick={() => setDeleting(null)}>Keep it</button><button className="x-btn x-btn--hi cp-del" data-testid="sc-delete-confirm" onClick={async () => {
            try { await screenerApi.remove(deleting.id); saved.setData(l => l?.filter(x => x.id !== deleting.id) ?? l); if (active?.kind === 'saved' && active.id === deleting.id) setActive(null); setDeleting(null); toast.success('Screen deleted'); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not delete'); }
          }}>Delete</button></>}>
          <p className="cp-fine">Only the saved filters are deleted.</p>
        </Modal>
      )}
      {trade && <OrderTicketDialog initial={trade} onClose={() => setTrade(null)} onPlaced={() => setTrade(null)} />}
    </AppShell>
  );
}

function FilterRow({ row, catalogue, onChange, onRemove }: { row: Row; catalogue: CatalogueItem[]; onChange: (p: Partial<Row>) => void; onRemove: () => void }) {
  const scaleOf = (o: IndicatorOperand) => catalogue.find(c => c.id === o.id)?.outputs.find(x => x.key === o.output)?.scale ?? 'price';
  const leftKey = { id: row.left.id, scale: scaleOf(row.left) };
  const allowRight = (it: CatalogueItem, out: CatalogueItem['outputs'][number]) => comparable(leftKey, { id: it.id, scale: out.scale });
  const ops: RowOp[] = row.subject === 'indicator' ? [...IA_OPERATORS, 'between'] : FIELD_OPS;
  const opLabel = (o: RowOp) => (o === 'between' ? 'is between' : OPERATOR_LABEL[o]);
  const setSubject = (s: Subject) => onChange({ subject: s, operator: s === 'indicator' ? 'lt' : 'gt', right: val(s === 'funding' ? 0.01 : s === 'change24h' ? 5 : s === 'volume24h' || s === 'openInterest' ? 50_000_000 : s === 'indicator' ? 30 : 1) });
  // A new left line that can't be compared with the right one: compare with a number instead.
  const setLeft = (left: IndicatorOperand) => {
    const s = scaleOf(left);
    onChange(row.right.kind === 'indicator' && !comparable({ id: left.id, scale: s }, { id: row.right.id, scale: scaleOf(row.right) }) ? { left, right: val(s === 'percent' ? 50 : 0) } : { left });
  };
  const firstRight = (): IndicatorOperand | null => {
    for (const it of catalogue) for (const o of it.outputs) if (allowRight(it, o) && !(it.id === row.left.id && o.key === row.left.output)) return { kind: 'indicator', id: it.id, output: o.key, params: Object.fromEntries(it.params.map(p => [p.key, p.default])) };
    return null;
  };
  const numberInput = (v: number, set: (n: number) => void, label: string, testId: string) => (
    <input className="x-input m sc-num" type="number" inputMode="decimal" aria-label={label} value={Number.isFinite(v) ? v : ''} onChange={e => set(e.target.value === '' ? NaN : Number(e.target.value))} data-testid={testId} />
  );
  return (
    <div className="sc-row" data-testid="sc-filter">
      <select className="x-select sc-subject" aria-label="Filter on" value={row.subject} onChange={e => setSubject(e.target.value as Subject)} data-testid="sc-subject">
        <option value="indicator">Indicator</option>
        {(Object.keys(FIELD_LABEL) as ScreenerField[]).map(k => <option key={k} value={k}>{FIELD_LABEL[k]}</option>)}
      </select>
      {row.subject === 'indicator' && <OperandPicker catalogue={catalogue} value={row.left} onChange={setLeft} label="Filter" testId="sc-left" />}
      <select className="x-select sc-op" aria-label="Condition" value={row.operator} onChange={e => onChange({ operator: e.target.value as RowOp, ...(e.target.value === 'between' && row.right.kind !== 'value' ? { right: val(30) } : {}) })} data-testid="sc-op">
        {ops.map(o => <option key={o} value={o}>{opLabel(o)}</option>)}
      </select>
      {row.operator === 'between' ? (
        <span className="sc-between">{numberInput(row.right.kind === 'value' ? row.right.value : 0, n => onChange({ right: val(n) }), 'From', 'sc-from')}<span className="x-muted">and</span>{numberInput(row.value2, n => onChange({ value2: n }), 'To', 'sc-to')}</span>
      ) : row.subject === 'indicator' ? (
        <span className="sc-right">
          <select className="x-select sc-kind" aria-label="Compare with" value={row.right.kind} onChange={e => { if (e.target.value === 'value') onChange({ right: val(0) }); else { const r = firstRight(); if (r) onChange({ right: r }); } }} data-testid="sc-right-kind">
            <option value="value">a number</option>
            <option value="indicator">a line</option>
          </select>
          {row.right.kind === 'value'
            ? numberInput(row.right.value, n => onChange({ right: val(n) }), 'Value', 'sc-value')
            : <OperandPicker catalogue={catalogue} value={row.right} onChange={r => onChange({ right: r })} allow={allowRight} label="Than" testId="sc-right" />}
        </span>
      ) : numberInput(row.right.kind === 'value' ? row.right.value : 0, n => onChange({ right: val(n) }), 'Value', 'sc-value')}
      <button type="button" className="x-btn x-btn--sm x-btn--ghost x-btn--icon sc-rm" aria-label="Remove filter" onClick={onRemove} data-testid="sc-remove">×</button>
    </div>
  );
}

function SaveDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Save screen" onClose={onClose} busy={busy} testId="sc-save-dialog"
      footer={<><button className="x-btn x-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="x-btn x-btn--hi" disabled={busy || !name.trim()} onClick={async () => { setBusy(true); await onSave(name.trim()); setBusy(false); }} data-testid="sc-save-submit">{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="x-field"><label htmlFor="sc-name">Name</label><input id="sc-name" className="x-input" maxLength={60} placeholder="e.g. 4h oversold majors" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && name.trim() && !busy) { setBusy(true); void onSave(name.trim()).finally(() => setBusy(false)); } }} autoFocus data-testid="sc-name" /></div>
      <p className="cp-fine">Saves the timeframe, universe, filters and sort order. Results are always fresh when you open it.</p>
    </Modal>
  );
}
