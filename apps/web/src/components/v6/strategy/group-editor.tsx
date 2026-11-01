'use client';

// Edits one signal group (F4): ALL/ANY of conditions like
// "[RSI(14)] [crosses below] [30]", each optionally N bars ago or on a
// higher timeframe.
import OperandPicker from '@/components/v6/indicators/operand-picker';
import { comparable, IA_OPERATORS, OPERATOR_LABEL, type CatalogueItem, type IaOperator, type IndicatorOperand } from '@/lib/indicator-alerts-api';
import { emptyCondition, INTERVALS, type Interval, type SignalGroup, type StrategyCondition } from '@/lib/strategies-api';

export default function GroupEditor({ group, onChange, catalogue, interval, testId, emptyText }: {
  group: SignalGroup;
  onChange: (g: SignalGroup) => void;
  catalogue: CatalogueItem[];
  interval: Interval;
  testId: string;
  emptyText?: string;
}) {
  const set = (k: number, patch: Partial<StrategyCondition>) => onChange({ ...group, conditions: group.conditions.map((c, i) => (i === k ? { ...c, ...patch } : c)) });
  const scaleOf = (o: IndicatorOperand) => catalogue.find(c => c.id === o.id)?.outputs.find(x => x.key === o.output)?.scale ?? 'price';
  const higher = INTERVALS.slice(INTERVALS.indexOf(interval));
  return (
    <div className="sb-group" data-testid={testId}>
      <div className="sb-group-h">
        <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Match">
          <button type="button" role="radio" aria-checked={group.match === 'all'} onClick={() => onChange({ ...group, match: 'all' })}>All of</button>
          <button type="button" role="radio" aria-checked={group.match === 'any'} onClick={() => onChange({ ...group, match: 'any' })}>Any of</button>
        </div>
      </div>
      {!group.conditions.length && <p className="x-muted sb-empty">{emptyText ?? 'No conditions yet.'}</p>}
      {group.conditions.map((c, k) => {
        const leftKey = { id: c.left.id, scale: scaleOf(c.left) };
        const allow = (it: CatalogueItem, out: CatalogueItem['outputs'][number]) => comparable(leftKey, { id: it.id, scale: out.scale });
        const firstRight = (): IndicatorOperand | null => {
          for (const it of catalogue) for (const o of it.outputs) if (allow(it, o) && !(it.id === c.left.id && o.key === c.left.output)) return { kind: 'indicator', id: it.id, output: o.key, params: Object.fromEntries(it.params.map(p => [p.key, p.default])) };
          return null;
        };
        return (
          <div key={k} className="sb-cond" data-testid={`${testId}-cond-${k}`}>
            <OperandPicker catalogue={catalogue} value={c.left} label="Indicator" testId={`${testId}-${k}-left`}
              onChange={left => set(k, c.right.kind === 'indicator' && !comparable({ id: left.id, scale: scaleOf(left) }, { id: c.right.id, scale: scaleOf(c.right) }) ? { left, right: { kind: 'value', value: scaleOf(left) === 'percent' ? 50 : 0 } } : { left })} />
            <select className="x-select" aria-label="Condition" value={c.operator} onChange={e => set(k, { operator: e.target.value as IaOperator })} data-testid={`${testId}-${k}-op`}>
              {IA_OPERATORS.map(o => <option key={o} value={o}>{OPERATOR_LABEL[o]}</option>)}
            </select>
            <div className="sb-right">
              <select className="x-select" aria-label="Compare with" value={c.right.kind} onChange={e => { if (e.target.value === 'value') set(k, { right: { kind: 'value', value: 0 }, rightBarsAgo: undefined }); else { const r = firstRight(); if (r) set(k, { right: r }); } }} data-testid={`${testId}-${k}-rk`}>
                <option value="value">a number</option>
                <option value="indicator">a line</option>
              </select>
              {c.right.kind === 'value'
                ? <input className="x-input m sb-num" type="number" inputMode="decimal" aria-label="Value" value={Number.isFinite(c.right.value) ? c.right.value : ''} onChange={e => set(k, { right: { kind: 'value', value: e.target.value === '' ? NaN : Number(e.target.value) } })} data-testid={`${testId}-${k}-value`} />
                : <OperandPicker catalogue={catalogue} value={c.right} allow={allow} label="Line" testId={`${testId}-${k}-right`} onChange={right => set(k, { right })} />}
            </div>
            <div className="sb-cond-more">
              <label>On
                <select className="x-select" value={c.timeframe ?? interval} onChange={e => set(k, { timeframe: e.target.value === interval ? undefined : e.target.value as Interval })} data-testid={`${testId}-${k}-tf`}>
                  {higher.map(t => <option key={t} value={t}>{t === interval ? `${t} (strategy)` : t}</option>)}
                </select>
              </label>
              <label>Bars ago
                <input className="x-input m sb-mini" type="number" min={0} max={200} value={c.barsAgo ?? 0} onChange={e => set(k, { barsAgo: Number(e.target.value) || undefined })} data-testid={`${testId}-${k}-ago`} />
              </label>
              {c.right.kind === 'indicator' && (
                <label title="Shift only the right side back, e.g. close above the highest high of the bars before">Line from
                  <input className="x-input m sb-mini" type="number" min={0} max={200} value={c.rightBarsAgo ?? 0} onChange={e => set(k, { rightBarsAgo: Number(e.target.value) || undefined })} />
                  bars back
                </label>
              )}
              <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== k) })} data-testid={`${testId}-${k}-rm`}>Remove</button>
            </div>
          </div>
        );
      })}
      <button type="button" className="x-btn x-btn--sm" onClick={() => onChange({ ...group, conditions: [...group.conditions, emptyCondition()] })} disabled={group.conditions.length >= 12} data-testid={`${testId}-add`}>+ Add condition</button>
    </div>
  );
}
