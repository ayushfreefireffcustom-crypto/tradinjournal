import { describe, expect, it } from 'vitest';
import {
  BUILTIN_TABS, cleanName, editRows, fillAlone, isModified, moveRow, newLayoutId, newLayoutName, packRows, parseSlots, resolveTabs, rowsToSlots,
  serializeSlots, toggleRow, toSaved, WIDGETS, type LayoutTab,
} from './dash-layouts';

describe('dashboard layouts', () => {
  it('built-in tabs pack to full rows of 12 exactly as before', () => {
    for (const t of BUILTIN_TABS) {
      expect(packRows(t.slots).map(c => c.span)).toEqual(t.slots.map(x => x.span));
    }
    // Same as the page's old fillAlone on the old [id, span] lists.
    // Overview (polish v1): on tablets Leaks sits alone after the full-width equity curve, so it fills the row.
    expect([...fillAlone(packRows(BUILTIN_TABS[0]!.slots))]).toEqual(['leaks']);
    expect([...fillAlone(packRows(BUILTIN_TABS[1]!.slots))]).toEqual([]);
    expect([...fillAlone(packRows(BUILTIN_TABS[2]!.slots))]).toEqual(['recent']);
  });
  it('parse / serialize: unknown ids, bad spans and repeats dropped', () => {
    expect(parseSlots(['equity:8', 'leaks', 'nope', 'leaks:3', 'mae:5', 42])).toEqual([{ id: 'equity', span: 8 }, { id: 'leaks', span: 4 }, { id: 'mae', span: 4 }]);
    expect(parseSlots('x')).toEqual([]);
    expect(serializeSlots([{ id: 'equity', span: 12 }])).toEqual(['equity:12']);
  });
  it('short rows stretch their last widget', () => {
    expect(packRows([{ id: 'equity', span: 8 }, { id: 'symbols', span: 8 }])).toEqual([{ id: 'equity', span: 12 }, { id: 'symbols', span: 12 }]);
    expect(packRows([{ id: 'leaks', span: 4 }, { id: 'mae', span: 4 }, { id: 'equity', span: 8 }]).map(c => c.span)).toEqual([4, 8, 12]);
    expect(packRows([{ id: 'rolling', span: 3 }, { id: 'leaks', span: 4 }, { id: 'plan', span: 3 }]).map(c => c.span)).toEqual([3, 4, 5]);
    expect(packRows([])).toEqual([]);
  });
  it('resolve: overrides built-ins, appends own tabs, drops junk, caps at 8', () => {
    const tabs = resolveTabs({ dashboard: { tabs: [
      { id: 'risk', name: 'Risk', widgets: ['symbols:12', 'equity:8'] },
      { id: 'c-1', name: '  Mine ', widgets: ['leaks:4', 'plan'] },
      { id: 'c-2', name: 'Empty', widgets: ['bogus'] },
      { id: 'BAD ID', name: 'x', widgets: ['leaks'] },
      { id: 'c-3', name: '', widgets: ['leaks'] },
    ] } });
    expect(tabs.map(t => t.id)).toEqual(['overview', 'risk', 'execution', 'c-1']);
    expect(tabs[1]!.slots.map(s => s.id)).toEqual(['symbols', 'equity']);
    expect(tabs[3]).toMatchObject({ name: 'Mine', builtin: false });
    expect(resolveTabs(null).map(t => t.id)).toEqual(['overview', 'risk', 'execution']);
    const many = Array.from({ length: 10 }, (_, i) => ({ id: `c-${i}`, name: `L${i}`, widgets: ['leaks'] }));
    expect(resolveTabs({ dashboard: { tabs: many } })).toHaveLength(8);
  });
  it('toSaved keeps own tabs and only modified built-ins; round-trips', () => {
    const tabs: LayoutTab[] = resolveTabs(null);
    expect(toSaved(tabs)).toEqual({ dashboard: { tabs: [] } });
    const changed = tabs.map(t => (t.id === 'execution' ? { ...t, slots: t.slots.slice(1) } : t));
    const mine: LayoutTab = { id: 'c-1', name: 'Mine', builtin: false, slots: [{ id: 'equity', span: 12 }] };
    const saved = toSaved([...changed, mine]);
    expect(saved.dashboard!.tabs.map(t => t.id)).toEqual(['execution', 'c-1']);
    expect(resolveTabs(saved)).toEqual([...changed, mine]);
    expect(isModified(changed[2]!)).toBe(true);
    expect(isModified(tabs[0]!)).toBe(false);
  });
  it('editing: rows, move, toggle (never below one shown)', () => {
    const rows = editRows(BUILTIN_TABS[1]!.slots);
    expect(rows).toHaveLength(WIDGETS.length);
    expect(rows.filter(r => r.on).map(r => r.id)).toEqual(['equity', 'leaks', 'dist', 'rolling', 'behaviour', 'symbols']);
    const moved = moveRow(rows, 5, 0);
    expect(rowsToSlots(moved)[0]).toEqual({ id: 'symbols', span: 12 });
    expect(moveRow(rows, 0, -1)).toBe(rows);
    const off = toggleRow(rows, 'leaks');
    expect(rowsToSlots(off).map(s => s.id)).not.toContain('leaks');
    const on = toggleRow(off, 'heatmap');
    expect(rowsToSlots(on).map(s => s.id)).toContain('heatmap');
    let one = editRows([{ id: 'equity', span: 8 }]);
    one = toggleRow(one, 'equity');
    expect(rowsToSlots(one)).toEqual([{ id: 'equity', span: 8 }]);
  });
  it('new ids and names; names unique, trimmed, capped', () => {
    const tabs = [...resolveTabs(null), { id: 'c-1', name: 'Layout 1', builtin: false, slots: [] }];
    expect(newLayoutId(tabs)).toBe('c-2');
    expect(newLayoutName(tabs)).toBe('Layout 2');
    expect(cleanName('  my   view ', tabs, 'c-9')).toBe('my view');
    expect(cleanName('overview', tabs, 'c-9')).toBeNull();
    expect(cleanName('Layout 1', tabs, 'c-1')).toBe('Layout 1');
    expect(cleanName('   ', tabs, 'c-9')).toBeNull();
    expect(cleanName('x'.repeat(40), tabs, 'c-9')).toHaveLength(24);
  });
});
