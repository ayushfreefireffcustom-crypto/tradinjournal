'use client';

// Detected chart patterns for the active chart (E8) with an explanation per
// pattern (E9). Clicking a pattern highlights it on the chart and draws its
// measured-move target.
import { useState } from 'react';
import { useLoad } from '@/components/v6/ui/data';
import Modal from '@/components/v6/ui/modal';
import { STATUS_LABEL, patternsApi, type ChartPattern, type PatternsResult } from '@/lib/patterns-api';
import '@/styles/v6/kit.css';

const px = (v: number | null | undefined) => (v == null ? '—' : Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : v.toLocaleString('en-US', { maximumSignificantDigits: 6 }));

function levelsLine(p: ChartPattern): string {
  if (p.family === 'level') return `${p.touches ?? 2} touches at ${px(p.breakout)}`;
  const parts: string[] = [];
  if (p.breakout != null) parts.push(`${p.family === 'double' ? 'Neckline' : 'Breakout'} ${px(p.breakout)}`);
  if (p.invalidation != null) parts.push(`wrong ${p.bias === 'bearish' ? 'above' : 'below'} ${px(p.invalidation)}`);
  if (p.target != null) parts.push(`target ${px(p.target)}`);
  return parts.join(' · ') || 'Watch for a close outside either line';
}

export default function PatternsPanel({ symbol, tf, state, selected, onSelect, unsupported }: {
  symbol: string;
  tf: string;
  state: { data: PatternsResult | null; error: string | null; loading: boolean };
  selected: string | null;
  onSelect: (id: string | null) => void;
  unsupported?: string;
}) {
  const [explaining, setExplaining] = useState<ChartPattern | null>(null);
  const list = state.data?.patterns ?? [];
  const shapes = list.filter(p => p.family !== 'level');
  const levels = list.filter(p => p.family === 'level');
  const row = (p: ChartPattern) => (
    <li key={p.id} className={`mk-pt-row ${selected === p.id ? 'on' : ''}`} data-testid={`pattern-${p.kind}`}>
      <button type="button" className="mk-pt-main" onClick={() => onSelect(selected === p.id ? null : p.id)} aria-pressed={selected === p.id}>
        <span className={`mk-pt-dot ${p.family === 'level' ? (p.kind === 'support' ? 'g' : 'r') : p.bias === 'bullish' ? 'g' : p.bias === 'bearish' ? 'r' : ''}`} aria-hidden="true" />
        <span className="mk-pt-name">{p.label}</span>
        {p.family !== 'level' && <span className={`x-tag ${p.status === 'forming' ? '' : 'x-tag--m'}`}>{STATUS_LABEL[p.status]}</span>}
        <span className="mk-pt-lv m">{levelsLine(p)}</span>
      </button>
      <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => setExplaining(p)} data-testid={`explain-${p.kind}`}>Explain</button>
    </li>
  );
  return (
    <section className="x-card mk-pt" aria-label="Chart patterns" data-testid="patterns-panel">
      <div className="mk-pt-hd"><b>Patterns</b><span className="x-muted">{symbol} · {tf}</span></div>
      {unsupported ? <p className="x-muted mk-pt-msg">{unsupported}</p>
        : state.error ? <p className="cp-err mk-pt-msg">{state.error}</p>
        : !state.data ? <div className="x-skel" style={{ height: 90 }} />
        : !list.length ? <p className="x-muted mk-pt-msg" data-testid="patterns-none">No clear patterns or levels in the last {state.data.bars} closed bars.</p>
        : (
          <>
            {shapes.length > 0 && <ul className="mk-pt-list">{shapes.map(row)}</ul>}
            {levels.length > 0 && <><div className="mk-pt-sub">Support and resistance</div><ul className="mk-pt-list">{levels.map(row)}</ul></>}
            <p className="mk-pt-note">Found on closed bars{state.data.barTime ? ` up to ${new Date(state.data.barTime).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}. Shapes describe the chart; they don&rsquo;t predict it.</p>
          </>
        )}
      {explaining && <ExplainDialog symbol={symbol} tf={tf} pattern={explaining} onClose={() => setExplaining(null)} />}
    </section>
  );
}

function ExplainDialog({ symbol, tf, pattern, onClose }: { symbol: string; tf: string; pattern: ChartPattern; onClose: () => void }) {
  const e = useLoad(() => patternsApi.explain(symbol, tf, pattern.id), [symbol, tf, pattern.id]);
  return (
    <Modal title={pattern.label} sub={`${symbol} · ${tf} · ${STATUS_LABEL[pattern.status].toLowerCase()}`} onClose={onClose} testId="pattern-explain"
      footer={<button className="x-btn x-btn--hi" onClick={onClose}>Done</button>}>
      {e.error ? <p className="cp-err" data-testid="pattern-explain-error">{e.error}</p> : !e.data ? <div className="x-skel" style={{ height: 220 }} /> : (
        <div className="mk-pt-exp">
          <section><h3>What it is</h3><p>{e.data.whatItIs}</p></section>
          <section><h3>Why it matters</h3><p>{e.data.whyItMatters}</p></section>
          <section><h3>Where it&rsquo;s wrong</h3><p>{e.data.whereItsWrong}</p></section>
          <section><h3>Measured move</h3><p>{e.data.measuredMove}</p></section>
          <p className="cp-fine" data-testid="pattern-explain-source">{e.data.source === 'ai' ? 'Written by Claude from this pattern’s levels.' : 'Standard explanation built from this pattern’s levels.'} Educational only, not financial advice.</p>
        </div>
      )}
    </Modal>
  );
}
