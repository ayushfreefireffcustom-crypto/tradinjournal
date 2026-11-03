'use client';

import EmptyState from '@/components/v6/ui/empty-state';
import type { MacroState } from '@/lib/macro-api';
import { biasTone } from '@/lib/macro-format';
import { BiasTag, LeanTag, Meter, toneText } from '@/components/v6/macro/ui';
import CountUp from './count-up';

export default function BullBearScanner({ bias }: { bias: MacroState['bias'] }) {
  if (!bias.length) {
    return (
      <div className="x-card"><EmptyState icon="signal" ghost="table" testId="macro-scanner-empty" title="No bias scores yet">Bull and bear scores for each asset appear after the next macro update.</EmptyState></div>
    );
  }

  const ranked = [...bias].sort((a, b) => b.score - a.score);

  return (
    <section className="x-card" data-testid="macro-scanner">
      <div className="x-ch"><h2>Bull / bear scanner</h2><span className="x-sub">ranked by score</span>
        <span className="x-r mc-legend mc-legend--in"><span className="neg">Bearish</span><span className="m">50</span><span className="pos">Bullish</span></span></div>
      <div className="mc-sc">
        {ranked.map((b, i) => {
          const tone = biasTone(b.label);
          return (
            <article key={b.asset} className="mc-sc-r" data-testid={`macro-scanner-${b.asset}`}>
              <div className="mc-sc-h">
                <span className="m mc-sc-k">{i + 1}</span>
                <b className="mc-sc-a">{b.asset}</b>
                <BiasTag tone={tone} label={b.label} />
                <span className="mc-sc-sp" />
                <LeanTag score={b.score} />
                <CountUp value={b.score} className={`m mc-sc-n ${toneText(tone)}`} />
              </div>
              <Meter score={b.score} tone={tone} />
              <div className="mc-sc-f">
                <div className="mc-tags">
                  {b.supporting.length === 0 ? <span className="x-dim">No supporting factors</span>
                    : b.supporting.map(s => <span key={s} className="x-tag x-tag--g">+ {s}</span>)}
                </div>
                <div className="mc-tags mc-tags--r">
                  {b.opposing.length === 0 ? <span className="x-dim">No opposing factors</span>
                    : b.opposing.map(s => <span key={s} className="x-tag x-tag--r">− {s}</span>)}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
