'use client';

import { useState } from 'react';
import { formatMacroNumber } from '@/lib/macro-format';
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

export default function AnalysisReport({ a }: { a: TraderAnalysis }) {
  const [showDetail, setShowDetail] = useState(false);
  const conf = Math.max(0, Math.min(100, a.confidence));
  const isLong = a.direction === 'LONG', isShort = a.direction === 'SHORT';
  const levels: [string, string, string][] = [
    ['Entry', `${formatMacroNumber(a.entryLow)} — ${formatMacroNumber(a.entryHigh)}`, ''],
    ['Stop', formatMacroNumber(a.stop), 'sh'],
    ['T1', formatMacroNumber(a.t1), 'lg'], ['T2', formatMacroNumber(a.t2), 'lg'], ['T3', formatMacroNumber(a.t3), 'lg'],
  ];
  return (
    <article className="v3-card sx-rep" data-testid="trader-report">
      <header className="sx-rep-hd">
        <h2>{a.symbol}</h2>
        <span className={`v3-pill ${isLong ? 'g' : isShort ? 'r' : 'n'}`} data-testid="trader-direction">{isLong ? 'Long' : isShort ? 'Short' : 'Wait'}</span>
        <OutcomeBadge outcome={a.outcome} hitLevel={a.hitLevel} pending={!a.outcome && !!a.id} />
        <span className="sx-asof num">{a.timeframes.join(' · ')} · as of {new Date(a.asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</span>
      </header>
      <div className="sx-conf">
        <span>Confidence{a.confidenceSource === 'meta_lgbm' ? ' · model' : a.confidenceSource === 'meta_v1' ? ' · meta' : ''}</span><b className="num">{a.confidence}%</b>
      </div>
      <div className="sx-cbar"><i style={{ width: `${conf}%` }} /></div>
      {a.laneBreakdown && a.laneBreakdown.length > 0 && (
        <div className="sx-lanes" data-testid="trader-lanes">
          {a.laneBreakdown.map(l => {
            const t = l.score > 0.08 ? 'g' : l.score < -0.08 ? 'r' : 'n';
            return <span key={l.id} title={l.rationale} className={`sx-lane ${t}`}>{l.source ?? LANE_NAME[l.id] ?? l.id} <b className="num">{l.score > 0 ? '+' : l.score < 0 ? '−' : ''}{Math.abs(l.score).toFixed(2)}</b>{l.stale && <em> · stale</em>}</span>;
          })}
        </div>
      )}
      <div className="sx-levels">{levels.map(([k, v, c]) => <div key={k}><span>{k}</span><b className={`num ${c}`}>{v}</b></div>)}</div>
      <LevelsChart a={a} />
      {(a.support.length > 0 || a.resistance.length > 0) && (
        <div className="sx-sr">
          {a.support.length > 0 && <><span>Support</span>{a.support.slice(0, 3).map((x, i) => <b key={`s${i}`} className="num" title={x.label}>{formatMacroNumber(x.price)}</b>)}</>}
          {a.resistance.length > 0 && <><span>Resistance</span>{a.resistance.slice(0, 3).map((x, i) => <b key={`r${i}`} className="num" title={x.label}>{formatMacroNumber(x.price)}</b>)}</>}
        </div>
      )}
      <p className="sx-why">{shortRationale(a.rationale)}{' '}
        <button type="button" className="v3-link" onClick={() => setShowDetail(v => !v)} aria-expanded={showDetail} data-testid="trader-detail-toggle">{showDetail ? 'Less' : 'Details'}</button>
      </p>
      {showDetail && (
        <div className="sx-detail" data-testid="trader-detail">
          <p className="mute">{a.invalidation}</p>
          <p>{a.detail}</p>
          <div className="sx-tfs">{a.perTimeframe.map(tf => (
            <span key={tf.tf} className="num"><b>{tf.tf}</b> <em className={tf.trend === 'up' ? 'lg' : tf.trend === 'down' ? 'sh' : ''}>{tf.trend}</em> · RSI {tf.rsi.toFixed(0)} · ATR {formatMacroNumber(tf.atr)}</span>
          ))}</div>
        </div>
      )}
    </article>
  );
}
