'use client';

// "Edit layout" for Dashboard v2: show/hide and reorder the widgets of the
// current layout tab, rename or delete your own layouts, reset a built-in one.
// Keyboard: every row has Move up / Move down buttons; on desktop (fine
// pointer) rows can also be dragged by the handle. The grid behind updates
// live; nothing is stored until Save. Layouts are saved in trading prefs, or
// on this device while settings storage isn't ready.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, DotsSixVertical } from '@phosphor-icons/react';
import {
  cleanName, defaultOf, editRows, isModified, MAX_NAME, moveRow, resolveTabs, rowsToSlots, toggleRow, toSaved, WIDGET_NAME,
  type EditRow, type LayoutTab, type Slot,
} from '@/lib/dash-layouts';
import { readLocalLayouts, useTradingPrefs, writeLocalLayouts } from '@/lib/trading-prefs';

const ACTIVE_KEY = 'tl-dash-layout';

/** Layout tabs from trading prefs (or this device while storage isn't ready) and the active one. */
export function useDashLayouts() {
  const { prefs, state, save } = useTradingPrefs();
  const [local, setLocal] = useState<ReturnType<typeof readLocalLayouts>>(null);
  const [activeId, setActiveId] = useState('overview');
  const [where, setWhere] = useState<'server' | 'device'>('server');
  useEffect(() => {
    setLocal(readLocalLayouts());
    try { const a = localStorage.getItem(ACTIVE_KEY); if (a) setActiveId(a); } catch { /* storage unavailable */ }
  }, []);
  const deviceOnly = state.status === 'error' || (!!prefs && !prefs.persisted);
  useEffect(() => { if (deviceOnly) setWhere('device'); }, [deviceOnly]);
  // Server layouts once storage works; this device's until then (and as the
  // starting point if nothing was saved on the server yet).
  const tabs = useMemo(() => resolveTabs(deviceOnly || where === 'device' ? local : prefs?.layouts?.dashboard?.tabs?.length ? prefs.layouts : local), [deviceOnly, where, local, prefs?.layouts]);
  const active = tabs.find(t => t.id === activeId) ?? tabs[0]!;
  const setActive = useCallback((id: string) => { setActiveId(id); try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* ignore */ } }, []);

  /** Store the whole tab list. Returns where it went. */
  const saveTabs = useCallback(async (next: LayoutTab[]): Promise<{ ok: boolean; where: 'server' | 'device'; error?: string }> => {
    const body = toSaved(next);
    if (!deviceOnly && where === 'server') {
      const r = await save({ layouts: body });
      if (r.ok) return { ok: true, where: 'server' };
      if (!r.local) return { ok: false, where: 'server', error: r.error };
    }
    if (!writeLocalLayouts(body)) return { ok: false, where: 'device', error: 'Couldn’t save on this device' };
    setLocal(body);
    setWhere('device');
    return { ok: true, where: 'device' };
  }, [deviceOnly, where, save]);

  return { tabs, active, setActive, saveTabs, where: deviceOnly ? 'device' as const : where, ready: state.status !== 'loading' };
}

export interface EditTarget { tab: LayoutTab; isNew: boolean }

export function LayoutEditor({ target, tabs, onPreview, onName, onSave, onCancel, onDelete, busy, note }: {
  target: EditTarget;
  tabs: LayoutTab[];
  /** Live preview of the grid while editing. */
  onPreview: (slots: Slot[]) => void;
  /** Live name of a layout being named (the new tab's label). */
  onName?: (name: string) => void;
  onSave: (tab: LayoutTab) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  busy: boolean;
  note: string;
}) {
  const [rows, setRows] = useState<EditRow[]>(() => editRows(target.tab.slots));
  const [name, setName] = useState(target.tab.name);
  const [say, setSay] = useState('');
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const [fine, setFine] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => { setRows(editRows(target.tab.slots)); setName(target.tab.name); }, [target.tab.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onPreview(rowsToSlots(rows)); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onName?.(name); }, [name]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const mq = window.matchMedia('(pointer: fine)'); setFine(mq.matches); }, []);
  useEffect(() => { if (target.isNew) requestAnimationFrame(() => { nameRef.current?.focus(); nameRef.current?.select(); }); }, [target.isNew]);

  const custom = !target.tab.builtin;
  const clean = custom ? cleanName(name, tabs, target.tab.id) : target.tab.name;
  const shown = rows.filter(r => r.on).length;
  const draftTab: LayoutTab = { ...target.tab, name: clean ?? target.tab.name, slots: rowsToSlots(rows) };
  const def = defaultOf(target.tab.id);

  const move = (i: number, to: number, focusDir?: 'up' | 'down') => {
    if (to < 0 || to >= rows.length) return;
    const next = moveRow(rows, i, to);
    setRows(next);
    setSay(`${WIDGET_NAME[rows[i]!.id]} moved to position ${to + 1} of ${rows.length}`);
    // Keep focus on the same button of the moved row (keyboard users).
    if (focusDir) requestAnimationFrame(() => {
      const btn = listRef.current?.querySelectorAll<HTMLButtonElement>(`[data-move=${focusDir}]`)[to];
      if (btn && !btn.disabled) btn.focus(); else listRef.current?.querySelectorAll<HTMLButtonElement>(`[data-move=${focusDir === 'up' ? 'down' : 'up'}]`)[to]?.focus();
    });
  };

  return (
    <section className="d2-card d2-edit" aria-label="Edit layout" data-testid="layout-editor">
      <header className="d2-edit-h">
        <h3>{target.isNew ? 'New layout' : `Edit ${target.tab.name}`}</h3>
        <span className="d2-edit-sub">{shown} of {rows.length} widgets · {fine ? 'drag or use the arrows' : 'use the arrows'}</span>
      </header>
      {custom && (
        <label className="d2-edit-name">
          <span>Name</span>
          <input ref={nameRef} className="x-input" value={name} maxLength={MAX_NAME} onChange={e => setName(e.target.value)} aria-invalid={!clean || undefined} data-testid="layout-name" />
          {!clean && <small className="dn">{name.trim() ? 'Another layout has this name' : 'Give it a name'}</small>}
        </label>
      )}
      <ol className="d2-edit-list" ref={listRef} data-testid="layout-rows">
        {rows.map((r, i) => (
          <li key={r.id} className={`d2-edit-row${r.on ? '' : ' off'}${drag && drag.over === i && drag.from !== i ? ` over ${drag.from < i ? 'below' : 'above'}` : ''}${drag?.from === i ? ' dragging' : ''}`}
            data-testid={`row-${r.id}`}
            draggable={fine}
            onDragStart={e => { setDrag({ from: i, over: i }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); }}
            onDragOver={e => { if (!drag) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (drag.over !== i) setDrag({ ...drag, over: i }); }}
            onDrop={e => { e.preventDefault(); if (drag) move(drag.from, i); setDrag(null); }}
            onDragEnd={() => setDrag(null)}>
            {fine && <span className="d2-edit-grip" aria-hidden><DotsSixVertical size={14} /></span>}
            <label className="d2-edit-chk">
              <input type="checkbox" checked={r.on} disabled={r.on && shown <= 1} onChange={() => setRows(toggleRow(rows, r.id))} data-testid={`show-${r.id}`} />
              <span>{WIDGET_NAME[r.id]}</span>
            </label>
            <span className="d2-edit-mv">
              <button type="button" data-move="up" onClick={() => move(i, i - 1, 'up')} disabled={i === 0} aria-label={`Move ${WIDGET_NAME[r.id]} up`} data-testid={`up-${r.id}`}><ArrowUp size={13} /></button>
              <button type="button" data-move="down" onClick={() => move(i, i + 1, 'down')} disabled={i === rows.length - 1} aria-label={`Move ${WIDGET_NAME[r.id]} down`} data-testid={`down-${r.id}`}><ArrowDown size={13} /></button>
            </span>
          </li>
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">{say}</p>
      <footer className="d2-edit-f">
        {custom && !target.isNew && <button type="button" className="d2-fp d2-edit-del" onClick={() => onDelete(target.tab.id)} disabled={busy} data-testid="layout-delete">Delete layout</button>}
        {!custom && def && isModified(draftTab) && <button type="button" className="d2-fp" onClick={() => setRows(editRows(def.slots))} disabled={busy} data-testid="layout-reset">Reset to default</button>}
        <span className="d2-edit-note" role="status" data-testid="layout-note">{note}</span>
        <button type="button" className="d2-fp" onClick={onCancel} disabled={busy} data-testid="layout-cancel">Cancel</button>
        <button type="button" className="x-btn x-btn--hi x-btn--sm" onClick={() => clean && onSave(draftTab)} disabled={busy || !clean || !shown} data-testid="layout-save">{busy ? 'Saving…' : 'Save layout'}</button>
      </footer>
    </section>
  );
}
