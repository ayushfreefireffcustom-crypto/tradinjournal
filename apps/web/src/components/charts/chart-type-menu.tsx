'use client';

// Chart type for the active pane (E2): candles, Heikin-Ashi, or the price-only
// Renko, Kagi and Point & Figure with their box / reversal size.
import { useEffect, useState } from 'react';
import { CHART_TYPES, DEFAULT_SIZE, type ChartType, type SizeMode, type SizeSetting } from '@/lib/chart-types';

export interface ChartTypeValue { type: ChartType; size?: SizeSetting; reversal?: number }

const MODES: Array<{ id: SizeMode; label: string; unit: string }> = [
  { id: 'atr', label: 'ATR', unit: 'bars' },
  { id: 'percent', label: 'Percent', unit: '%' },
  { id: 'fixed', label: 'Fixed', unit: 'price' },
];

/** Typed number that only reports finite, positive values; keeps what's typed meanwhile. */
function NumberField({ value, onChange, label, testId, step }: { value: number; onChange: (n: number) => void; label: string; testId: string; step?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const n = Number(text);
  const bad = text.trim() === '' || !Number.isFinite(n) || n <= 0;
  return (
    <input className={`x-input m mk-ct-num ${bad ? 'is-bad' : ''}`} type="number" inputMode="decimal" min={0} step={step ?? 'any'} aria-label={label} aria-invalid={bad}
      value={text} onChange={e => { setText(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() !== '' && Number.isFinite(v) && v > 0) onChange(v); }} data-testid={testId} />
  );
}

export default function ChartTypeMenu({ value, onChange }: { value: ChartTypeValue; onChange: (v: ChartTypeValue) => void }) {
  const priceOnly = value.type === 'renko' || value.type === 'kagi' || value.type === 'pnf';
  const size = priceOnly ? value.size ?? DEFAULT_SIZE[value.type as 'renko'] : undefined;
  const mode = MODES.find(m => m.id === size?.mode) ?? MODES[0]!;
  return (
    <div className="mk-ct" data-testid="chart-type">
      <select className="x-select mk-ct-type" aria-label="Chart type" value={value.type} data-testid="chart-type-select"
        onChange={e => { const t = e.target.value as ChartType; onChange({ type: t, size: t === 'candles' || t === 'heikin' ? undefined : DEFAULT_SIZE[t], reversal: t === 'pnf' ? value.reversal ?? 3 : undefined }); }}>
        {CHART_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      {priceOnly && size && (
        <>
          <select className="x-select mk-ct-mode" aria-label={value.type === 'kagi' ? 'Reversal size' : 'Box size'} value={size.mode} data-testid="chart-size-mode"
            onChange={e => { const m = e.target.value as SizeMode; onChange({ ...value, size: { mode: m, value: m === 'atr' ? 14 : m === 'percent' ? 1 : size.value } }); }}>
            {MODES.map(m => <option key={m.id} value={m.id}>{value.type === 'kagi' ? 'Reversal' : 'Box'}: {m.label}</option>)}
          </select>
          <label className="mk-ct-field">
            <NumberField value={size.value} onChange={v => onChange({ ...value, size: { ...size, value: v } })} label={mode.id === 'atr' ? 'ATR length' : mode.id === 'percent' ? 'Percent' : 'Price amount'} testId="chart-size-value" step={mode.id === 'atr' ? 1 : undefined} />
            <span className="x-muted">{mode.unit}</span>
          </label>
          {value.type === 'pnf' && (
            <label className="mk-ct-field">
              <NumberField value={value.reversal ?? 3} onChange={v => onChange({ ...value, reversal: Math.max(1, Math.round(v)) })} label="Reversal boxes" testId="chart-reversal" step={1} />
              <span className="x-muted">box reversal</span>
            </label>
          )}
        </>
      )}
    </div>
  );
}
