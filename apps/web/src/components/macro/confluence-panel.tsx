'use client';

import { useCountUp } from '@/hooks/use-count-up';
import { biasTone, averageBiasScore } from '@/lib/macro-format';
import type { MacroState } from '@/lib/macro-api';
import { LeanTag, Meter } from '@/components/v6/macro/ui';
import CountUp from './count-up';

/** Confluence engine: net-bias gauge and per-asset lean bars. */
export default function ConfluencePanel({ bias }: { bias: MacroState['bias'] }) {
  const avg = averageBiasScore(bias);
  const target = avg ?? 50;
  const score = useCountUp(avg == null ? null : target, { duration: 1000 }) ?? (avg == null ? 0 : target);
  const live = avg == null ? 50 : score;
  const rad = (((live / 100) * 180 - 90) * Math.PI) / 180;
  const cx = 60, cy = 58, r = 42;
  const nx = cx + r * Math.sin(rad);
  const ny = cy - r * Math.cos(rad);
  const gTone = avg == null ? 'neutral' : live >= 55 ? 'bull' : live <= 45 ? 'bear' : 'neutral';
  const col = gTone === 'bull' ? 'var(--g)' : gTone === 'bear' ? 'var(--r)' : 'var(--mut)';
  const arcLen = Math.PI * r;

  return (
    <section className="x-card mc-cf" data-testid="macro-confluence">
      <div className="x-ch"><h2>Confluence engine</h2><span className="x-sub"><span className="m">{bias.length}</span> assets</span></div>
      <div className="mc-cf-in">
        <div className="mc-cf-g">
          <svg viewBox="0 0 120 66" width="132" height="73" aria-hidden>
            <path d="M 18 58 A 42 42 0 0 1 102 58" fill="none" stroke="var(--track)" strokeWidth="8" strokeLinecap="round" />
            <path d="M 18 58 A 42 42 0 0 1 102 58" fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(live / 100) * arcLen} ${arcLen}`} />
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--tx)" strokeWidth="2" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="3" fill="var(--tx)" />
          </svg>
          <b className={gTone === 'bull' ? 'pos' : gTone === 'bear' ? 'neg' : ''} data-testid="confluence-avg">{avg == null ? '—' : <CountUp value={target} duration={1000} />}</b>
          <span>Net bias</span>
        </div>
        <div className="mc-cf-rows">
          {bias.length === 0 ? <p className="x-muted mc-p">No confluence scores yet.</p> : bias.map(b => (
            <div key={b.asset} className="mc-cf-r" data-testid={`confluence-asset-${b.asset}`}>
              <span className="mc-cf-a">{b.asset}</span>
              <Meter score={b.score} tone={biasTone(b.label)} />
              <LeanTag score={b.score} />
              <CountUp value={b.score} className="m mc-cf-n" />
            </div>
          ))}
        </div>
      </div>
      <div className="mc-legend"><span className="pos">Long ≥ 55</span><span>Neutral 45–55</span><span className="neg">Short ≤ 45</span></div>
    </section>
  );
}
