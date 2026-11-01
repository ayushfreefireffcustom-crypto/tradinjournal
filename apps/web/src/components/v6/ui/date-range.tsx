'use client';

// Custom date range (A2.25, QW.1): presets for the usual periods, or any two
// days. Sits next to the quick range chips; shows the chosen window when one
// is active. Esc or a click outside closes it.
import { useEffect, useId, useRef, useState } from 'react';
import { PRESETS, isoDay, presetRange, rangeText } from '@/lib/date-presets';
import type { CustomRange } from '@/lib/stats';

export default function DateRangePicker({ value, onChange }: { value: CustomRange | null; onChange: (r: CustomRange) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CustomRange>(() => value ?? presetRange('thisMonth'));
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const today = isoDay(new Date());

  useEffect(() => {
    if (!open) return;
    setDraft(value ?? presetRange('thisMonth'));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open, value]);

  const pick = (r: CustomRange) => { onChange(r); setOpen(false); };
  const valid = !!draft.from && !!draft.to && draft.from <= draft.to;

  return (
    <div className="x-dr" ref={box}>
      <button type="button" className={`x-btn x-dr-b ${value ? 'is-on' : ''}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} data-testid="range-custom">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
        <span>{value ? rangeText(value) : 'Custom'}</span>
      </button>
      {open && (
        <div className="x-pop x-dr-pop" id={id} role="dialog" aria-label="Choose dates" data-testid="range-custom-pop">
          <div className="x-dr-presets">
            {PRESETS.map(([k, label]) => (
              <button key={k} type="button" onClick={() => pick(presetRange(k))} data-testid={`range-preset-${k}`}>{label}</button>
            ))}
          </div>
          <div className="x-dr-custom">
            <label className="x-field"><span>From</span><input className="x-input" type="date" value={draft.from} max={draft.to || today} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} data-testid="range-from" /></label>
            <label className="x-field"><span>To</span><input className="x-input" type="date" value={draft.to} min={draft.from} max={today} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} data-testid="range-to" /></label>
            <button type="button" className="x-btn x-btn--hi" disabled={!valid} onClick={() => pick(draft)} data-testid="range-apply">Show {valid ? rangeText(draft) : 'these dates'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
