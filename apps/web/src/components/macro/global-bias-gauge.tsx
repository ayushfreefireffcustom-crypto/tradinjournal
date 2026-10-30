'use client';

import { useCountUp } from '@/hooks/use-count-up';
import { averageBiasScore } from '@/lib/macro-format';
import type { MacroState } from '@/lib/macro-api';
import CountUp from './count-up';

function lean(score: number): [string, string] {
  if (score >= 70) return ['Strongly bullish', 'broad risk-on'];
  if (score >= 60) return ['Bullish', 'risk-on'];
  if (score >= 55) return ['Mildly bullish', 'risk-on tilt'];
  if (score > 45) return ['Neutral', 'no clear tilt'];
  if (score > 40) return ['Mildly bearish', 'risk-off tilt'];
  if (score > 30) return ['Bearish', 'risk-off'];
  return ['Strongly bearish', 'broad risk-off'];
}

/** Global bias: big score + bear→bull scale with a marker (weighted average of asset biases). */
export default function GlobalBiasGauge({ bias }: { bias: MacroState['bias'] }) {
  const avg = averageBiasScore(bias);
  const live = useCountUp(avg == null ? null : avg, { duration: 1100 }) ?? avg ?? 50;
  const [l1, l2] = lean(Math.round(live));
  const tone = avg == null ? '' : live >= 55 ? 'pos' : live <= 45 ? 'neg' : '';
  const bull = bias.filter(b => b.score >= 55).length, bear = bias.filter(b => b.score <= 45).length, neu = bias.length - bull - bear;
  return (
    <section className="x-card mc-gb" data-testid="macro-global-bias" aria-labelledby="mc-gb-t">
      <div className="x-ch"><h2 id="mc-gb-t">Global market bias</h2><span className="x-sub">across {bias.length || '—'} assets</span></div>
      <div className="mc-big">
        <b className={tone} data-testid="global-bias-score">{avg == null ? '—' : <CountUp value={Math.round(avg)} duration={1100} />}</b>
        <span>{avg == null ? 'Awaiting factors' : <><em>{l1}</em> · {l2}</>}</span>
      </div>
      <div className="mc-scale" role="img" aria-label={`Bias ${Math.round(live)} of 100`}>
        <span className="mc-scale-band" />
        <i style={{ left: `${Math.max(0, Math.min(100, live))}%` }} className={tone} />
      </div>
      <div className="mc-scale-ax"><span>Bearish <b className="m">0</b></span><span>Neutral <b className="m">45–55</b></span><span><b className="m">100</b> Bullish</span></div>
      {bias.length > 0 && (
        <div className="mc-split" aria-label={`${bull} bullish, ${neu} neutral, ${bear} bearish`}>
          <div className="mc-split-bar">{bull > 0 && <i className="g" style={{ flex: bull }} />}{neu > 0 && <i className="n" style={{ flex: neu }} />}{bear > 0 && <i className="r" style={{ flex: bear }} />}</div>
          <div className="mc-split-l">
            <span><i className="g" /><b className="m">{bull}</b> bullish</span>
            <span><i className="n" /><b className="m">{neu}</b> neutral</span>
            <span><i className="r" /><b className="m">{bear}</b> bearish</span>
          </div>
        </div>
      )}
      <p className="mc-foot">Weighted average of asset scores. 0 is max bearish, 100 is max bullish.</p>
    </section>
  );
}
