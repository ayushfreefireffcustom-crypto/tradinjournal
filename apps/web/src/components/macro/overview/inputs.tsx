'use client';

// "What put us here": the four inputs behind the regime, each a big number,
// a sparkline and the latest change coloured by its effect on risk assets.
import type { MacroOverviewInput } from '@/lib/macro-api';
import { Quiet, SecHead, Spark, useWidth } from './parts';
import { inputDelta, inputValue } from './format';

export default function Inputs({ inputs }: { inputs: MacroOverviewInput[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const narrow = w > 0 && w < 440;
  const sparkW = narrow ? 84 : 120;
  return (
    <div ref={ref}>
      <SecHead title="What put us here" sub={`${inputs.length} input${inputs.length === 1 ? '' : 's'}, 12 months`} />
      {inputs.length === 0 ? (
        <Quiet>No inputs yet. They appear after the next macro update.</Quiet>
      ) : (
        <div className={`mo-k4${narrow ? ' mo-k4--n' : ''}`}>
          {inputs.map(i => {
            const v = inputValue(i);
            const d = inputDelta(i);
            return (
              <div key={i.key} className="mo-k4-row" data-testid={`macro-input-${i.key}`}>
                <div className="mo-k4-lab">
                  {i.label}
                  <small>{i.sub}</small>
                  <div className="mo-k4-v m">{v.value}{v.unit && <span className="mo-k4-u">{v.unit}</span>}</div>
                </div>
                <Spark values={i.spark} w={sparkW} h={40} label={`${i.label}, ${i.spark.length} points`} />
                <div className={`mo-k4-d m ${i.tone === 'pos' ? 'pos' : i.tone === 'neg' ? 'neg' : ''}`}>
                  {d || '–'}
                  <small>{i.deltaLabel}</small>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
