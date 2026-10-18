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

/** Global bias: big score + bear→bull scale with a knob (weighted average of asset biases). */
export default function GlobalBiasGauge({ bias }: { bias: MacroState['bias'] }) {
  const avg = averageBiasScore(bias);
  const live = useCountUp(avg == null ? null : avg, { duration: 1100 }) ?? avg ?? 50;
  const [l1, l2] = lean(Math.round(live));
  const tone = avg == null ? '' : live >= 55 ? 'lg' : live <= 45 ? 'sh' : '';
  return (
    <section className="v3-card mg" data-testid="macro-global-bias" aria-labelledby="mg-t">
      <h3 id="mg-t" className="mc-lbl">Global macro market bias</h3>
      <div className="mg-row">
        <b className="mg-n num" data-testid="global-bias-score">{avg == null ? '—' : <CountUp value={Math.round(avg)} duration={1100} />}</b>
        <span className="mg-l">{avg == null ? 'Awaiting factors' : <><b className={tone}>{l1}</b> · {l2}</>}</span>
      </div>
      <div className="mg-scale" role="img" aria-label={`Bias ${Math.round(live)} of 100`}>
        <i className="mg-knob" style={{ left: `${Math.max(0, Math.min(100, live))}%` }} />
      </div>
      <div className="mg-axis"><span>Bear</span><span>Neutral 45–55</span><span>Bull</span></div>
      {bias.length > 0 && (() => {
        const bull = bias.filter(b => b.score >= 55).length, bear = bias.filter(b => b.score <= 45).length, neu = bias.length - bull - bear;
        return (
          <div className="mg-split" aria-label={`${bull} bullish, ${neu} neutral, ${bear} bearish`}>
            <div className="bar">{bull > 0 && <i className="g" style={{ flex: bull }} />}{neu > 0 && <i className="n" style={{ flex: neu }} />}{bear > 0 && <i className="r" style={{ flex: bear }} />}</div>
            <div className="lg2"><span><b className="num">{bull}</b> bullish</span><span><b className="num">{neu}</b> neutral</span><span><b className="num">{bear}</b> bearish</span></div>
          </div>
        );
      })()}
      <p className="mg-foot">Weighted across {bias.length || '—'} assets · 0 = max bearish, 100 = max bullish</p>
    </section>
  );
}
