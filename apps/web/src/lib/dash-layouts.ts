// Dashboard layouts: the three built-in tabs plus the trader's own, each an
// ordered list of widgets with a column span (of 12). Saved in trading prefs
// (PUT /api/me/trading-prefs, `layouts.dashboard.tabs`) as "id:span" strings;
// a built-in tab is only stored once it differs from its default.
export type WId = 'equity' | 'leaks' | 'heatmap' | 'mae' | 'dist' | 'rolling' | 'behaviour' | 'before' | 'plan' | 'symbols' | 'recent';
export type Span = 3 | 4 | 6 | 8 | 12;
/** Rendered span after a row is packed (a short row's last widget stretches). */
export type CellSpan = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
export interface Slot { id: WId; span: Span }
export interface LayoutTab { id: string; name: string; slots: Slot[]; builtin: boolean }
export interface SavedTab { id: string; name: string; widgets: string[] }
export interface SavedLayouts { dashboard?: { tabs: SavedTab[] } }

export const WIDGETS: WId[] = ['equity', 'leaks', 'heatmap', 'mae', 'dist', 'rolling', 'behaviour', 'before', 'plan', 'symbols', 'recent'];
export const WIDGET_NAME: Record<WId, string> = {
  equity: 'Equity & drawdown', leaks: 'Leaks', heatmap: 'Session × weekday', mae: 'MAE / MFE', dist: 'Distribution', rolling: 'Rolling expectancy',
  behaviour: 'Behaviour', before: 'Before you trade', plan: 'Plan', symbols: 'Symbols', recent: 'Recent trades',
};
export const DEFAULT_SPAN: Record<WId, Span> = { equity: 8, leaks: 4, heatmap: 4, mae: 4, dist: 4, rolling: 4, behaviour: 4, before: 4, plan: 4, symbols: 8, recent: 4 };
const SPANS: Span[] = [3, 4, 6, 8, 12];
export const MAX_TABS = 8;
export const MAX_NAME = 24;

const s = (id: WId, span: Span): Slot => ({ id, span });
export const BUILTIN_TABS: LayoutTab[] = [
  { id: 'overview', name: 'Overview', builtin: true, slots: [s('equity', 8), s('leaks', 4), s('heatmap', 6), s('recent', 6), s('mae', 6), s('dist', 6), s('rolling', 3), s('behaviour', 3), s('before', 3), s('plan', 3), s('symbols', 12)] },
  { id: 'risk', name: 'Risk', builtin: true, slots: [s('equity', 8), s('leaks', 4), s('dist', 4), s('rolling', 4), s('behaviour', 4), s('symbols', 12)] },
  { id: 'execution', name: 'Execution', builtin: true, slots: [s('heatmap', 6), s('mae', 6), s('before', 4), s('plan', 4), s('recent', 4), s('symbols', 12)] },
];

/** "equity" / "equity:8" → slots; unknown ids, bad spans and repeats dropped. */
export function parseSlots(widgets: unknown): Slot[] {
  if (!Array.isArray(widgets)) return [];
  const out: Slot[] = [];
  for (const w of widgets) {
    if (typeof w !== 'string') continue;
    const [id, sp] = w.split(':');
    if (!WIDGETS.includes(id as WId) || out.some(x => x.id === id)) continue;
    const n = Number(sp);
    out.push({ id: id as WId, span: SPANS.includes(n as Span) ? (n as Span) : DEFAULT_SPAN[id as WId] });
  }
  return out;
}
export const serializeSlots = (slots: Slot[]) => slots.map(x => `${x.id}:${x.span}`);
const sameSlots = (a: Slot[], b: Slot[]) => a.length === b.length && a.every((x, i) => x.id === b[i]!.id && x.span === b[i]!.span);

/** Built-in tabs (with any saved override) first, then the trader's own in saved order. */
export function resolveTabs(saved: SavedLayouts | null | undefined): LayoutTab[] {
  const list = Array.isArray(saved?.dashboard?.tabs) ? saved!.dashboard!.tabs : [];
  const tabs: LayoutTab[] = BUILTIN_TABS.map(b => {
    const o = list.find(t => t?.id === b.id);
    const slots = o ? parseSlots(o.widgets) : [];
    return slots.length ? { ...b, slots } : { ...b, slots: [...b.slots] };
  });
  for (const t of list) {
    if (!t || typeof t.id !== 'string' || BUILTIN_TABS.some(b => b.id === t.id) || tabs.some(x => x.id === t.id)) continue;
    const slots = parseSlots(t.widgets);
    const name = typeof t.name === 'string' ? t.name.trim().slice(0, MAX_NAME) : '';
    if (slots.length && name && /^[a-z0-9-]{1,40}$/.test(t.id)) tabs.push({ id: t.id, name, slots, builtin: false });
  }
  return tabs.slice(0, MAX_TABS);
}

/** What gets saved: own tabs, and built-ins only where they differ from the default. */
export function toSaved(tabs: LayoutTab[]): SavedLayouts {
  const out: SavedTab[] = [];
  for (const t of tabs) {
    const def = BUILTIN_TABS.find(b => b.id === t.id);
    if (def && sameSlots(def.slots, t.slots)) continue;
    out.push({ id: t.id, name: (def ? def.name : t.name).slice(0, MAX_NAME), widgets: serializeSlots(t.slots) });
  }
  return { dashboard: { tabs: out } };
}
export const isModified = (t: LayoutTab) => { const d = BUILTIN_TABS.find(b => b.id === t.id); return !!d && !sameSlots(d.slots, t.slots); };
export const defaultOf = (id: string) => BUILTIN_TABS.find(b => b.id === id) ?? null;

/** Rows of 12 in order; the last widget of a short row stretches to fill it. */
export function packRows(slots: Slot[]): Array<{ id: WId; span: CellSpan }> {
  const out: Array<{ id: WId; span: CellSpan }> = [];
  let row: Array<{ id: WId; span: CellSpan }> = [];
  let used = 0;
  const close = () => { if (row.length) { row[row.length - 1]!.span = (row[row.length - 1]!.span + 12 - used) as CellSpan; out.push(...row); } row = []; used = 0; };
  for (const x of slots) {
    if (used + x.span > 12) close();
    row.push({ id: x.id, span: x.span });
    used += x.span;
  }
  close();
  return out;
}

/** On mid-width screens ≤4-column widgets go half width; one left alone on its row goes full width. */
export function fillAlone(list: Array<{ id: WId; span: number }>): Set<WId> {
  const out = new Set<WId>();
  let col = 0;
  list.forEach(({ id, span }, i) => {
    if (span > 4) { col = 0; return; }
    const next = list[i + 1];
    if (col === 0 && (!next || next.span > 4)) { out.add(id); return; }
    col = (col + 6) % 12;
  });
  return out;
}

// ── editing (pure) ──

/** Editor rows: every widget, shown ones first in layout order. */
export interface EditRow { id: WId; on: boolean; span: Span }
export function editRows(slots: Slot[]): EditRow[] {
  return [...slots.map(x => ({ id: x.id, on: true, span: x.span })), ...WIDGETS.filter(w => !slots.some(x => x.id === w)).map(id => ({ id, on: false, span: DEFAULT_SPAN[id] }))];
}
export const rowsToSlots = (rows: EditRow[]): Slot[] => rows.filter(r => r.on).map(r => ({ id: r.id, span: r.span }));
export function moveRow<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = [...rows];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x!);
  return next;
}
export const toggleRow = (rows: EditRow[], id: WId): EditRow[] => {
  const on = rows.filter(r => r.on).length;
  return rows.map(r => (r.id === id ? (r.on && on <= 1 ? r : { ...r, on: !r.on }) : r));
};

export function newLayoutId(tabs: LayoutTab[]): string {
  for (let i = 1; ; i++) if (!tabs.some(t => t.id === `c-${i}`)) return `c-${i}`;
}
export function newLayoutName(tabs: LayoutTab[]): string {
  for (let i = 1; ; i++) { const n = `Layout ${i}`; if (!tabs.some(t => t.name.toLowerCase() === n.toLowerCase())) return n; }
}
/** Trimmed, unique among the other tabs, ≤ 24 chars; null when unusable. */
export function cleanName(name: string, tabs: LayoutTab[], selfId: string): string | null {
  const n = name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  if (!n) return null;
  return tabs.some(t => t.id !== selfId && t.name.toLowerCase() === n.toLowerCase()) ? null : n;
}
