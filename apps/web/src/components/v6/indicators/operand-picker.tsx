'use client';

// Picks an indicator line and its parameters, e.g. "MACD Signal (12, 26, 9)".
// Shared by indicator alerts and the screener; `allow` limits which lines can
// be picked (the right-hand side only offers lines in the same units).
import type { CatalogueItem, IndicatorOperand } from '@/lib/indicator-alerts-api';
import '@/styles/v6/tools.css';

const GROUPS: Array<[CatalogueItem['group'], string]> = [['price', 'Price'], ['trend', 'Trend'], ['oscillator', 'Oscillators'], ['volatility', 'Volatility'], ['volume', 'Volume']];

/** Indicator + output + parameters. `allow` filters which outputs can be picked. */
export default function OperandPicker({ catalogue, value, onChange, allow, label, testId }: {
  catalogue: CatalogueItem[]; value: IndicatorOperand; onChange: (v: IndicatorOperand) => void; allow?: (it: CatalogueItem, out: CatalogueItem['outputs'][number]) => boolean; label: string; testId: string;
}) {
  const spec = catalogue.find(c => c.id === value.id);
  const ok = (it: CatalogueItem) => it.outputs.filter(o => !allow || allow(it, o));
  const pickIndicator = (id: string) => {
    const it = catalogue.find(c => c.id === id)!;
    onChange({ kind: 'indicator', id, output: (ok(it)[0] ?? it.outputs[0]!).key, params: Object.fromEntries(it.params.map(p => [p.key, p.default])) });
  };
  return (
    <div className="ia-op" data-testid={testId}>
      <div className="ia-op-row">
        <select className="x-select" aria-label={`${label} indicator`} value={value.id} onChange={e => pickIndicator(e.target.value)} data-testid={`${testId}-id`}>
          {GROUPS.map(([g, name]) => {
            const items = catalogue.filter(c => c.group === g && ok(c).length);
            return items.length ? <optgroup key={g} label={name}>{items.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup> : null;
          })}
        </select>
        {spec && spec.outputs.length > 1 && (
          <select className="x-select" aria-label={`${label} line`} value={value.output} onChange={e => onChange({ ...value, output: e.target.value })} data-testid={`${testId}-out`}>
            {ok(spec).map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        )}
      </div>
      {spec && spec.params.length > 0 && (
        <div className="ia-params">
          {spec.params.map(p => (
            <label key={p.key} className="ia-param">
              <span>{p.label}</span>
              <input className="x-input m" type="number" inputMode="decimal" min={p.min} max={p.max} step={p.step}
                value={Number.isFinite(value.params?.[p.key] ?? p.default) ? (value.params?.[p.key] ?? p.default) : ''} data-testid={`${testId}-p-${p.key}`}
                onChange={e => onChange({ ...value, params: { ...Object.fromEntries(spec.params.map(q => [q.key, q.default])), ...value.params, [p.key]: e.target.value === '' ? NaN : Number(e.target.value) } })} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

