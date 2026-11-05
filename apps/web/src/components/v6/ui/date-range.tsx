'use client';

// Custom date range (A2.25, QW.1): presets for the usual periods, or any two
// days. Sits next to the quick range chips; shows the chosen window when one
// is active. Esc or a click outside closes it.
import { useEffect, useId, useRef, useState } from 'react';
import { PRESETS, isoDay, presetRange, rangeText } from '@/lib/date-presets';
import type { CustomRange } from '@/lib/stats';
import { useOnScreen } from './use-on-screen';

export default function DateRangePicker({ value, onChange, maxDays, note }: {
  value: CustomRange | null; onChange: (r: CustomRange) => void;
  /** Longest window allowed, in days (both ends counted). */
  maxDays?: number;
  /** A line under the date fields, e.g. which time zone the days are in. */
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const pop = useOnScreen(open);
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
  const span = (r: CustomRange) => (Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000 + 1;
  const ordered = !!draft.from && !!draft.to && draft.from <= draft.to;
  const tooLong = ordered && !!maxDays && span(draft) > maxDays;
  const valid = ordered && !tooLong;

  return (
    <div className="x-dr" ref={box}>
      <button type="button" className={`x-btn x-dr-b ${value ? 'is-on' : ''}`} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} data-testid="range-custom">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
        <span>{value ? rangeText(value) : 'Custom'}</span>
      </button>
      {open && (
        <div ref={pop} className="x-pop x-dr-pop" id={id} role="dialog" aria-label="Choose dates" data-testid="range-custom-pop">
          <div className="x-dr-presets">
            {PRESETS.filter(([k]) => !maxDays || span(presetRange(k)) <= maxDays).map(([k, label]) => (
              <button key={k} type="button" onClick={() => pick(presetRange(k))} data-testid={`range-preset-${k}`}>{label}</button>
            ))}
          </div>
          <div className="x-dr-custom">
            <label className="x-field"><span>From</span><input className="x-input" type="date" value={draft.from} max={draft.to || today} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} data-testid="range-from" /></label>
            <label className="x-field"><span>To</span><input className="x-input" type="date" value={draft.to} min={draft.from} max={today} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} data-testid="range-to" /></label>
            {tooLong && <span className="x-help x-dr-err" role="alert" data-testid="range-too-long">Pick at most {maxDays} days.</span>}
            <button type="button" className="x-btn x-btn--hi" disabled={!valid} onClick={() => pick(draft)} data-testid="range-apply">Show {valid ? rangeText(draft) : 'these dates'}</button>
            {note && <span className="x-help">{note}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
