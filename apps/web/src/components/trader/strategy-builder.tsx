'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { traderApi, type TraderStrategy, type TraderStrategyRules, type TraderTimeframe } from '@/lib/trader-api';
import { formatMacroNumber } from '@/lib/macro-format';
import { SideChip } from '@/components/v6/desk';
import { Spinner } from '@/components/v6/ai/bits';
import { pct } from './outcome-badge';

const IDEAS = [
  {
    label: 'EMA cross',
    prompt: 'Long when EMA20 crosses above EMA50. Stop 1.5 ATR, target 2R, 48 bars.',
  },
  {
    label: 'RSI bounce',
    prompt: 'Long when RSI(14) drops under 30. Stop 1.5 ATR, target 2R. Short above 70.',
  },
  {
    label: 'Trend follow',
    prompt: 'Trade price vs EMA50. Long above, short below. Stop 1.2 ATR, target 2.5R.',
  },
  {
    label: 'Breakout',
    prompt: 'Long on a 20-bar high breakout, short on a 20-bar low. Stop 1.5 ATR, target 2R.',
  },
] as const;

const TFS: TraderTimeframe[] = ['15m', '1h', '4h', '1d'];

function kindLabel(kind: TraderStrategyRules['kind']): string {
  if (kind === 'ema_cross') return 'EMA cross';
  if (kind === 'rsi_threshold') return 'RSI';
  if (kind === 'breakout') return 'Breakout';
  if (kind === 'macd_cross') return 'MACD';
  return 'Price vs EMA';
}

function ruleChips(rules: TraderStrategyRules): string[] {
  const dir = rules.direction === 'BOTH' ? 'Long + short' : rules.direction === 'LONG' ? 'Long' : 'Short';
  const chips = [kindLabel(rules.kind), dir];
  if (rules.kind === 'ema_cross' || rules.kind === 'price_vs_ema') {
    chips.push(`${rules.fast ?? 20}/${rules.slow ?? 50}`);
  }
  if (rules.kind === 'rsi_threshold') {
    chips.push(`RSI ${rules.rsiPeriod ?? 14}`);
  }
  if (rules.kind === 'breakout') chips.push(`${rules.lookback ?? 20} bars`);
  if (rules.timeframe) chips.push(rules.timeframe);
  chips.push(`${rules.stopAtr ?? 1.5} ATR stop`);
  chips.push(`${rules.targetR ?? 2}R target`);
  return chips;
}

function SplitBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  return <div className="ai-split" aria-hidden><i style={{ flex: total ? wins : 1 }} /><i className="l" style={{ flex: total ? losses : 1 }} /></div>;
}

const statusLabel = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');

export default function StrategyBuilder() {
  const [prompt, setPrompt] = useState('');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState<TraderTimeframe>('1h');
  const [rows, setRows] = useState<TraderStrategy[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [activeIdea, setActiveIdea] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await traderApi.strategies());
    } catch {
      /* empty ok */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    const text = prompt.trim();
    if (text.length < 8) return;
    setBusy(true);
    setError('');
    try {
      await traderApi.createStrategy(text, symbol.trim().toUpperCase() || 'BTCUSDT', timeframe);
      setPrompt('');
      setActiveIdea(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not compile');
    } finally {
      setBusy(false);
    }
  }

  async function runBacktest(id: string) {
    setRunningId(id);
    setError('');
    try {
      await traderApi.backtestStrategy(id, symbol.trim().toUpperCase() || 'BTCUSDT', timeframe);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed');
    } finally {
      setRunningId(null);
    }
  }

  async function promote(id: string) {
    setActingId(id);
    setError('');
    try {
      const res = await traderApi.promoteStrategy(id);
      if (!res.emailOn) setError('Paper is on. Email is off in notification settings, so fills only show in the inbox.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not promote');
    } finally {
      setActingId(null);
    }
  }

  async function archive(id: string) {
    setActingId(id);
    setError('');
    try {
      await traderApi.archiveStrategy(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stop');
    } finally {
      setActingId(null);
    }
  }

  const visible = rows.filter(r => r.status !== 'archived');
  return (
    <section className="x-card" data-testid="trader-strategy-builder" aria-labelledby="ai-st-t">
      <div className="x-ch">
        <h2 id="ai-st-t">Strategies</h2>
        <span className="x-sub">{visible.length ? `${visible.length} · ` : ''}compile, test, then paper trade</span>
      </div>
      <div className="ai-ideas" role="group" aria-label="Presets">
        {IDEAS.map(idea => (
          <button key={idea.label} type="button" className="x-tag" aria-pressed={activeIdea === idea.label} onClick={() => { setActiveIdea(idea.label); setPrompt(idea.prompt); }}>{idea.label}</button>
        ))}
      </div>
      <div className="ai-compose">
        <textarea className="x-textarea" value={prompt} onChange={e => { setPrompt(e.target.value); setActiveIdea(null); }} rows={2}
          placeholder="Long when RSI dips under 30 on the 1h and price is above the 200-EMA…" aria-label="Strategy rule" />
        <div className="ai-compose-ft">
          <input className="x-input" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} aria-label="Backtest symbol" />
          <div className="x-seg x-seg--sm" role="group" aria-label="Backtest timeframe">
            {TFS.map(tf => <button key={tf} type="button" aria-pressed={timeframe === tf} onClick={() => setTimeframe(tf)}>{tf}</button>)}
          </div>
          <button type="button" disabled={busy || prompt.trim().length < 8} onClick={() => void create()} className="x-btn x-btn--hi x-btn--sm">
            {busy ? <><Spinner size={13} /> Compiling</> : 'Compile'}
          </button>
        </div>
      </div>
      {error && <div className="x-banner x-banner--err ai-mt" role="alert"><span>{error}</span></div>}
      {visible.length === 0 ? (
        <div className="x-empty ai-st-empty"><b>No strategies yet</b><p>Pick a preset or write your own rule.</p></div>
      ) : (
        <ul className="ai-strats">
          {visible.map(s => {
            const bt = s.lastBacktest;
            const edge = bt?.expectancyPct;
            const running = runningId === s.id;
            const positions = s.positions ?? [];
            return (
              <li key={s.id} className="x-inset ai-strat">
                <div className="ai-strat-t"><b>{s.name}</b><span className={`x-tag ${s.status === 'paper' ? 'x-tag--g' : ''}`}>{s.status === 'paper' ? 'Paper' : 'Draft'}</span></div>
                {(() => {
                  // Three rule chips at most; the rest are named in the "+N" tooltip.
                  const chips = ruleChips(s.rules);
                  return (
                    <div className="ai-chips">
                      {chips.slice(0, 3).map(c => <span key={c} className="x-tag">{c}</span>)}
                      {chips.length > 3 && <span className="x-muted" title={chips.slice(3).join(', ')}>+{chips.length - 3}</span>}
                    </div>
                  );
                })()}
                {bt ? (
                  <>
                    <p className="ai-bt">
                      Holdout <span className="m">{bt.trades}</span> trades · <span className="m">{bt.wins}W {bt.losses}L</span> · hit <span className="m">{pct(bt.hitRate, 0)}</span> · edge{' '}
                      <b className={`m ${edge == null ? '' : edge >= 0 ? 'pos' : 'neg'}`}>{edge == null ? '—' : `${edge >= 0 ? '+' : '−'}${Math.abs(edge).toFixed(2)}%`}</b>
                      {bt.symbol ? <> · {bt.symbol} {bt.timeframe ?? ''}</> : null}
                    </p>
                    <SplitBar wins={bt.wins} losses={bt.losses} />
                  </>
                ) : <p className="ai-bt">Not tested yet.</p>}
                <div className="ai-strat-a">
                  <button type="button" className="x-btn x-btn--sm" onClick={() => void runBacktest(s.id)} disabled={running}>{running ? <><Spinner size={12} /> Testing</> : bt ? 'Re-test' : 'Run backtest'}</button>
                  {s.status !== 'paper' && bt && (
                    <button type="button" className="x-btn x-btn--sm" disabled={!bt.promote?.ok || actingId === s.id} title={bt.promote?.reasons?.[0]} onClick={() => void promote(s.id)}>
                      {bt.promote?.ok ? 'Promote to paper' : bt.promote?.reasons?.[0] ?? 'Test first'}
                    </button>
                  )}
                  {s.status === 'paper' && <button type="button" className="x-btn x-btn--sm" disabled={actingId === s.id} onClick={() => void archive(s.id)}>Stop paper</button>}
                </div>
                {s.status !== 'paper' && !s.emailOn && bt?.promote?.ok && (
                  <p className="ai-bt">Email alerts are off. <Link className="x-link" href="/settings">Turn them on</Link> or fills only show in the inbox.</p>
                )}
                {positions.length > 0 && (
                  <div className="ai-blot" data-testid="trader-paper-blotter">
                    <h5>Paper positions</h5>
                    {positions.map(p => (
                      <div key={p.id} className="ai-blot-row">
                        {p.side === 'LONG' || p.side === 'SHORT' ? <SideChip dir={p.side} /> : <span className="x-tag">{p.side}</span>}
                        <span className="ai-px ai-ell"><b>{p.symbol}</b>{formatMacroNumber(p.entry)}</span>
                        <span className="x-tag">{statusLabel(p.status)}</span>
                        <span className={`ai-pl ${p.pnlPct == null ? 'x-dim' : p.pnlPct >= 0 ? 'pos' : 'neg'}`}>
                          {p.pnlPct == null ? '—' : `${p.pnlPct >= 0 ? '+' : '−'}${Math.abs(p.pnlPct).toFixed(2)}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
