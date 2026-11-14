'use client';

// Saved views, search and filter chips for the trade log.
import { useEffect, useRef, useState } from 'react';
import { CaretDown, Funnel, MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import { RESULT_LABEL, RULE_LABEL, type SavedView, type TlFilters, type TlResult, type TlRuleFilter, type TradelogDTO } from '@/lib/tradelog-v2-api';

export interface ViewTab { id: string; name: string; count: number | null; active: boolean; custom?: boolean; title?: string }

export function ViewTabs({ tabs, onPick, onDelete, onSave, canSave }: {
  tabs: ViewTab[]; onPick: (id: string) => void; onDelete: (id: string) => void; onSave: (name: string) => void; canSave: boolean;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (naming) input.current?.focus(); }, [naming]);
  const save = () => { const n = name.trim(); if (n) onSave(n.slice(0, 40)); setNaming(false); setName(''); };
  return (
    <div className="tl-views" role="tablist" aria-label="Saved views" data-testid="views">
      {tabs.map(t => (
        <span key={t.id} className={`tl-view${t.active ? ' on' : ''}`}>
          <button type="button" role="tab" aria-selected={t.active} onClick={() => onPick(t.id)} title={t.title} data-testid={`view-${t.id}`}>
            {t.name}{t.count != null && <small>{t.count.toLocaleString('en-US')}</small>}
          </button>
          {t.custom && <button type="button" className="tl-view-x" aria-label={`Delete view ${t.name}`} onClick={() => onDelete(t.id)}><X size={11} /></button>}
        </span>
      ))}
      {naming ? (
        <form className="tl-view-new" onSubmit={e => { e.preventDefault(); save(); }}>
          <input ref={input} value={name} onChange={e => setName(e.target.value)} placeholder="View name" maxLength={40} aria-label="View name"
            onKeyDown={e => { if (e.key === 'Escape') { setNaming(false); setName(''); } }} onBlur={() => { if (!name.trim()) setNaming(false); }} data-testid="view-name" />
          <button type="submit" className="tl-view-ok">Save</button>
        </form>
      ) : (
        <button type="button" className="tl-view-add" onClick={() => setNaming(true)} disabled={!canSave} title={canSave ? 'Save these filters as a view on this device' : 'Set a filter first'} data-testid="save-view">
          <Plus size={13} />Save view
        </button>
      )}
    </div>
  );
}

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setV(value), [value]);
  useEffect(() => {
    if (v === value) return;
    const id = setTimeout(() => onChange(v), 250);
    return () => clearTimeout(id);
  }, [v]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === '/' && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) { e.preventDefault(); ref.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <label className="tl-search" data-testid="search">
      <MagnifyingGlass size={15} aria-hidden />
      <input ref={ref} type="search" value={v} onChange={e => setV(e.target.value)} placeholder="Search symbol, tag, note, ticket" aria-label="Search symbol, tag, note or ticket" maxLength={80}
        onKeyDown={e => { if (e.key === 'Escape') { setV(''); onChange(''); } if (e.key === 'Enter') onChange(v); }} />
      {v ? <button type="button" className="tl-search-x" aria-label="Clear search" onClick={() => { setV(''); onChange(''); ref.current?.focus(); }}><X size={12} /></button> : <kbd aria-hidden>/</kbd>}
    </label>
  );
}

export function Chip({ label, value, all, options, onChange, disabled, testid }: {
  label: string; value: string; all: string; options: Array<{ v: string; label: string }>; onChange: (v: string) => void; disabled?: boolean; testid?: string;
}) {
  const cur = options.find(o => o.v === value);
  return (
    <label className={`d2-fp d2-fsel tl-fp${value ? ' set' : ''}${disabled ? ' off' : ''}`} data-testid={testid ?? `filter-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <span>{label}</span> <b>{cur ? cur.label.replace(/ \(\d+\)$/, '') : all}</b><CaretDown size={11} aria-hidden />
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={`${label} filter`} disabled={disabled}>
        <option value="">{label}: {all}</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </label>
  );
}

const GRADE_OPTS = [{ v: 'A', label: 'A' }, { v: 'B', label: 'B' }, { v: 'C', label: 'C' }, { v: 'D', label: 'D' }, { v: 'F', label: 'F' }, { v: 'A,B', label: 'A–B' }, { v: 'D,F', label: 'D–F' }];

export function FilterChips({ data, f, set, date, onClear, ownRules = false }: {
  data: TradelogDTO; f: TlFilters; set: (patch: Partial<TlFilters>) => void;
  /** The trader has rules of their own (adds a "Your rules" option). */
  ownRules?: boolean;
  date: { value: string; label: string; options: Array<{ v: string; label: string }>; onChange: (v: string) => void };
  onClear: (() => void) | null;
}) {
  const results: TlResult[] = ['win', 'loss', 'tp', 'sl', 'stopout', 'manual', ...(data.bigLoss ? ['bigloss' as const] : []), 'open'];
  const bigLabel = data.bigLoss?.unit === 'R' ? 'Losers past −1R' : data.bigLoss ? `Losers past −$${Math.round(Math.abs(data.bigLoss.threshold)).toLocaleString('en-US')}` : '';
  const rules: TlRuleFilter[] = ['any', 'none', ...(ownRules || f.rule === 'user-rule' ? ['user-rule' as const] : []), 'after-losses', 'revenge', 'oversized', 'losing-hour', ...(data.counts.withR ? ['r-tail' as const] : [])];
  return (
    <div className="tl-filters" data-testid="filters">
      <Funnel size={15} aria-hidden className="tl-fi" />
      <Chip label="Symbol" value={f.symbol ?? ''} all={`All ${data.options.symbols.length}`} options={data.options.symbols.map(s => ({ v: s.symbol, label: `${s.symbol} (${s.trades})` }))}
        onChange={v => set({ symbol: v || undefined })} />
      <Chip label="Side" value={f.side ?? ''} all="Both" options={[{ v: 'LONG', label: 'Long' }, { v: 'SHORT', label: 'Short' }]} onChange={v => set({ side: (v || undefined) as TlFilters['side'] })} />
      <Chip label="Session" value={f.session ?? ''} all="All" options={[{ v: 'ASIA', label: 'Asia' }, { v: 'LONDON', label: 'London' }, { v: 'NY', label: 'New York' }]} onChange={v => set({ session: (v || undefined) as TlFilters['session'] })} />
      <Chip label="Result" value={f.result ?? ''} all="Any" options={results.map(r => ({ v: r, label: r === 'bigloss' ? bigLabel : RESULT_LABEL[r] }))} onChange={v => set({ result: (v || undefined) as TlResult | undefined })} />
      <Chip label="Tags" value={f.tag ?? ''} all="Any" disabled={!data.options.tags.length && !f.tag} options={data.options.tags.map(t => ({ v: t, label: t }))} onChange={v => set({ tag: v || undefined })} />
      {data.graded && <Chip label="AI grade" value={f.grade ?? ''} all="Any" options={GRADE_OPTS} onChange={v => set({ grade: v || undefined })} />}
      {data.graded && <Chip label="Rule broken" value={f.rule ?? ''} all="Any" options={rules.map(r => ({ v: r, label: RULE_LABEL[r] }))} onChange={v => set({ rule: (v || undefined) as TlRuleFilter | undefined })} />}
      <Chip label="Date" testid="filter-date" value={date.value} all={date.label} options={date.options} onChange={date.onChange} />
      {onClear && <button type="button" className="tl-clear" onClick={onClear} data-testid="clear-filters">Clear</button>}
    </div>
  );
}

export type { SavedView };
