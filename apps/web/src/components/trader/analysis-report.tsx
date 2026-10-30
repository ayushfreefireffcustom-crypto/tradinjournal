'use client';

import { useState } from 'react';
import { formatMacroNumber } from '@/lib/macro-format';
import { tickerMark } from '@/lib/desk';
import { DirChip } from '@/components/v6/ai/bits';
import LevelsChart from './levels-chart';
import type { TraderAnalysis } from '@/lib/trader-api';
import { OutcomeBadge } from './outcome-badge';

function shortRationale(text: string): string {
  const cleaned = text
    .replace(/\s*Not financial advice[^.]*\.?/gi, '')
    .replace(/\s*Lanes\s+\d+%[^.]*\.?/gi, '')
    .trim();
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence;
}

const LANE_NAME: Record<string, string> = { technical: 'Trend', ml: 'Momentum', flow: 'Flow', macro: 'Macro', news: 'News' };

export default function AnalysisReport({ a, dim = false }: { a: TraderAnalysis; dim?: boolean }) {
  const [showDetail, setShowDetail] = useState(false);
  const conf = Math.max(0, Math.min(100, a.confidence));
  const levels: [string, string, string][] = [
    ['Entry zone', `${formatMacroNumber(a.entryLow)} – ${formatMacroNumber(a.entryHigh)}`, ''],
    ['Stop', formatMacroNumber(a.stop), 'neg'],
    ['Target 1', formatMacroNumber(a.t1), 'pos'], ['Target 2', formatMacroNumber(a.t2), 'pos'], ['Target 3', formatMacroNumber(a.t3), 'pos'],
  ];
  const src = a.confidenceSource === 'meta_lgbm' ? ' · model' : a.confidenceSource === 'meta_v1' ? ' · meta' : '';
  return (
    <article className={`x-card ai-rep ${dim ? 'dim' : ''}`} data-testid="trader-report" aria-busy={dim || undefined}>
      <header className="ai-rep-hd">
        <span className="x-mk">{tickerMark(a.symbol)}</span>
        <h2>{a.symbol}</h2>
        <DirChip dir={a.direction} testId="trader-direction" />
        <OutcomeBadge outcome={a.outcome} hitLevel={a.hitLevel} pending={!a.outcome && !!a.id} />
        <span className="ai-asof"><span className="m">{a.timeframes.join(' · ')}</span> · as of <span className="m">{new Date(a.asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}</span> UTC</span>
      </header>

      <div className="ai-conf">
        <span>Confidence{src}</span>
        <div className="x-bar" role="meter" aria-valuenow={conf} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence"><i style={{ width: `${conf}%` }} /></div>
        <b className="m">{a.confidence}%</b>
      </div>

      {a.laneBreakdown && a.laneBreakdown.length > 0 && (
        <div className="ai-lanes" data-testid="trader-lanes">
          {a.laneBreakdown.map(l => {
            const t = l.score > 0.08 ? 'x-tag--g' : l.score < -0.08 ? 'x-tag--r' : '';
            return (
              <span key={l.id} title={l.rationale} className={`x-tag ${t}`}>
                {l.source ?? LANE_NAME[l.id] ?? l.id} <b>{l.score > 0 ? '+' : l.score < 0 ? '−' : ''}{Math.abs(l.score).toFixed(2)}</b>{l.stale && <span> · stale</span>}
              </span>
            );
          })}
        </div>
      )}

      <div className="ai-lv"><div className="x-strip">
        {levels.map(([k, v, c]) => <div key={k}><span>{k}</span><b className={c}>{v}</b></div>)}
      </div></div>

      <LevelsChart a={a} />

      {(a.support.length > 0 || a.resistance.length > 0) && (
        <div className="ai-sr">
          {a.support.length > 0 && <><span>Support</span><div>{a.support.slice(0, 3).map((x, i) => <span key={`s${i}`} className="x-tag x-tag--m" title={x.label}>{formatMacroNumber(x.price)}</span>)}</div></>}
          {a.resistance.length > 0 && <><span>Resistance</span><div>{a.resistance.slice(0, 3).map((x, i) => <span key={`r${i}`} className="x-tag x-tag--m" title={x.label}>{formatMacroNumber(x.price)}</span>)}</div></>}
        </div>
      )}

      <p className="ai-why">{shortRationale(a.rationale)}
        <button type="button" className="x-link" onClick={() => setShowDetail(v => !v)} aria-expanded={showDetail} data-testid="trader-detail-toggle">{showDetail ? 'Less' : 'Details'}</button>
      </p>
      {showDetail && (
        <div className="x-inset ai-detail" data-testid="trader-detail">
          <p className="x-muted">{a.invalidation}</p>
          <p>{a.detail}</p>
          <div className="ai-tfs">{a.perTimeframe.map(tf => (
            <div key={tf.tf}>
              <b className="m">{tf.tf}</b>
              <span className={tf.trend === 'up' ? 'pos' : tf.trend === 'down' ? 'neg' : ''}>{tf.trend === 'up' ? 'Uptrend' : tf.trend === 'down' ? 'Downtrend' : 'Range'}</span>
              <span className="m ai-ell">RSI {tf.rsi.toFixed(0)} · ATR {formatMacroNumber(tf.atr)}</span>
            </div>
          ))}</div>
        </div>
      )}
    </article>
  );
}
