'use client';

import { useCallback, useEffect, useState } from 'react';
import { traderApi, type TraderStrategy, type TraderStrategyRules, type TraderTimeframe } from '@/lib/trader-api';
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
  const chips = [kindLabel(rules.kind), rules.direction];
  if (rules.kind === 'ema_cross' || rules.kind === 'price_vs_ema') {
    chips.push(`${rules.fast ?? 20}/${rules.slow ?? 50}`);
  }
  if (rules.kind === 'rsi_threshold') {
    chips.push(`RSI ${rules.rsiPeriod ?? 14}`);
  }
  if (rules.kind === 'breakout') chips.push(`${rules.lookback ?? 20} bars`);
  if (rules.timeframe) chips.push(rules.timeframe);
  chips.push(`${rules.stopAtr ?? 1.5} ATR`);
  chips.push(`${rules.targetR ?? 2}R`);
  return chips;
}

function SplitBar({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  return <div className="sx-split"><i style={{ flex: total ? wins : 1 }} /><i className="l" style={{ flex: total ? losses : 1 }} /></div>;
}

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
      if (!res.emailOn) setError('Paper is on. Email is off in notification settings — inbox only.');
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
    <section className="v3-card sx-st" data-testid="trader-strategy-builder" aria-labelledby="sx-st-t">
      <div className="sx-tr-hd">
        <h3 id="sx-st-t">Strategies <span>· {visible.length}</span></h3>
        <p>Compile a rule, test the holdout, then paper it.</p>
      </div>
      <div className="sx-st-bd">
        <div className="sx-ideas">
          {IDEAS.map(idea => (
            <button key={idea.label} type="button" aria-pressed={activeIdea === idea.label} onClick={() => { setActiveIdea(idea.label); setPrompt(idea.prompt); }}>{idea.label}</button>
          ))}
        </div>
        <div className="sx-compose">
          <textarea value={prompt} onChange={e => { setPrompt(e.target.value); setActiveIdea(null); }} rows={2} placeholder="Long when RSI dips under 30 on the 1h and price is above the 200-EMA…" aria-label="Strategy rule" />
          <div className="sx-compose-ft">
            <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} aria-label="Backtest symbol" className="num" />
            <div className="v3-seg sm">{TFS.map(tf => <button key={tf} type="button" aria-pressed={timeframe === tf} onClick={() => setTimeframe(tf)}>{tf}</button>)}</div>
            <button type="button" disabled={busy || prompt.trim().length < 8} onClick={() => void create()} className="v3-btn v3-btn--ink sx-compile">{busy ? 'Compiling…' : 'Compile'}</button>
          </div>
        </div>
        {error && <p className="r-err">{error}</p>}
        {visible.length === 0 ? (
          <div className="sx-none"><b>No strategies yet</b>Pick a preset, or write your own rule.</div>
        ) : (
          <ul className="sx-list">
            {visible.map((s, i) => {
              const bt = s.lastBacktest;
              const edge = bt?.expectancyPct;
              const running = runningId === s.id;
              return (
                <li key={s.id} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                  <div className="t"><b>{s.name}</b><span className={s.status === 'paper' ? 'v3-pill v' : 'mute'}>{s.status === 'paper' ? 'Paper' : 'Draft'}</span></div>
                  <div className="chips">{ruleChips(s.rules).map(c => <span key={c}>{c}</span>)}</div>
                  {bt ? (
                    <>
                      <p className="m num">Holdout · {bt.trades} trades · {bt.wins}W {bt.losses}L · hit {pct(bt.hitRate, 0)} · edge <b className={edge == null ? '' : edge >= 0 ? 'lg' : 'sh'}>{edge == null ? '—' : `${edge >= 0 ? '+' : '−'}${Math.abs(edge).toFixed(2)}%`}</b>{bt.symbol ? ` · ${bt.symbol} ${bt.timeframe ?? ''}` : ''}</p>
                      <SplitBar wins={bt.wins} losses={bt.losses} />
                    </>
                  ) : <p className="m">Not tested yet.</p>}
                  <div className="a">
                    <button type="button" className="v3-btn v3-btn--o" onClick={() => void runBacktest(s.id)} disabled={running}>{running ? 'Testing…' : bt ? 'Re-test' : 'Test'}</button>
                    {s.status !== 'paper' && bt && (
                      <button type="button" className="v3-btn v3-btn--ink" disabled={!bt.promote?.ok || actingId === s.id} title={bt.promote?.reasons?.[0]} onClick={() => void promote(s.id)} style={{ paddingRight: 16 }}>
                        {bt.promote?.ok ? 'Promote to paper' : bt.promote?.reasons?.[0] ?? 'Test first'}
                      </button>
                    )}
                    {s.status === 'paper' && <button type="button" className="v3-btn v3-btn--o" disabled={actingId === s.id} onClick={() => void archive(s.id)}>Stop paper</button>}
                  </div>
                  {s.status !== 'paper' && !s.emailOn && bt?.promote?.ok && <p className="m">Email alerts are off — <a className="v3-link" href="/settings" style={{ margin: 0, fontSize: 13 }}>turn them on</a> or fills only show in the inbox.</p>}
                  {(s.positions ?? []).length > 0 && (
                    <ul className="pos">{(s.positions ?? []).map(p => (
                      <li key={p.id} className="num"><span className={p.side === 'LONG' ? 'lg' : 'sh'}>{p.side === 'LONG' ? 'Long' : 'Short'}</span> {p.symbol} · {p.status}<span className="r">{p.pnlPct == null ? 'open' : `${p.pnlPct >= 0 ? '+' : '−'}${Math.abs(p.pnlPct).toFixed(2)}%`}</span></li>
                    ))}</ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
