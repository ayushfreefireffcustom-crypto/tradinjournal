'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flask, Play, Sparkle } from '@phosphor-icons/react';
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
  const winPct = total > 0 ? (wins / total) * 100 : 50;
  return (
    <div className="h-1.5 rounded-full overflow-hidden bg-loss/40 flex">
      <div className="h-full bg-profit" style={{ width: `${winPct}%` }} />
    </div>
  );
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

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-border bg-surface p-4 animate-[fade-up_0.5s_ease_both]"
      data-testid="trader-strategy-builder"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-50"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in oklab, var(--color-profit) 12%, transparent), transparent)',
        }}
      />

      <div className="relative">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flask size={14} className="text-profit" />
            <h3 className="text-sm font-medium text-fg">Strategies</h3>
          </div>
          <span className="text-[10px] tabular-nums text-fg-3">{rows.length}</span>
        </div>
        <p className="mt-0.5 text-xs text-fg-3">Compile a rule, test the holdout, then paper it. Paper fills are not the public hit rate.</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {IDEAS.map((idea) => {
            const on = activeIdea === idea.label;
            return (
              <button
                key={idea.label}
                type="button"
                onClick={() => {
                  setActiveIdea(idea.label);
                  setPrompt(idea.prompt);
                }}
                className={`h-7 px-2.5 rounded-md text-[11px] transition-colors ${
                  on
                    ? 'bg-white text-black font-medium'
                    : 'border border-border text-fg-2 hover:text-fg hover:border-border-strong'
                }`}
              >
                {idea.label}
              </button>
            );
          })}
        </div>

        <div className="mt-2.5 rounded-lg border border-border bg-app focus-within:border-border-strong focus-within:ring-2 focus-within:ring-white/10 transition-all">
          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setActiveIdea(null);
            }}
            rows={2}
            placeholder="Long when RSI dips under 30…"
            className="w-full bg-transparent px-3 pt-2.5 pb-1 text-sm text-fg placeholder:text-fg-3 outline-none resize-none"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="h-7 w-[6.5rem] rounded-md bg-surface px-2 text-[11px] tabular-nums text-fg outline-none border border-transparent focus:border-border"
              aria-label="Backtest symbol"
            />
            <div className="flex rounded-md border border-border overflow-hidden">
              {TFS.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  className={`h-7 px-1.5 text-[10px] tabular-nums ${
                    timeframe === tf ? 'bg-white text-black font-medium' : 'text-fg-3 hover:text-fg'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || prompt.trim().length < 8}
              onClick={() => void create()}
              className="ml-auto h-7 px-2.5 rounded-md text-[11px] font-medium bg-profit text-black disabled:opacity-40 inline-flex items-center gap-1 transition-opacity"
            >
              <Sparkle size={11} weight="fill" />
              {busy ? 'Compiling' : 'Compile'}
            </button>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-loss">{error}</p>}

        {rows.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center">
            <p className="text-sm text-fg-2">No strategies yet</p>
            <p className="mt-1 text-xs text-fg-3">Pick a preset, or write your own rule.</p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows.map((s, i) => {
              const bt = s.lastBacktest;
              const edge = bt?.expectancyPct;
              const running = runningId === s.id;
              return (
                <li
                  key={s.id}
                  className="rounded-lg border border-border bg-app/60 px-3 py-2.5 animate-[fade-up_0.35s_ease_both]"
                  style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{s.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${
                            s.status === 'paper'
                              ? 'border-profit/25 text-profit bg-profit/10'
                              : 'border-border text-fg-3'
                          }`}
                        >
                          {s.status === 'paper' ? 'Paper' : 'Draft'}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {ruleChips(s.rules).map((chip) => (
                          <span
                            key={chip}
                            className="text-[10px] tracking-wide uppercase px-1.5 py-0.5 rounded bg-white/5 text-fg-3"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void runBacktest(s.id)}
                      disabled={running}
                      className="h-7 shrink-0 px-2 rounded-md border border-border text-[11px] text-fg-2 hover:text-fg hover:border-border-strong inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <Play size={11} weight="fill" />
                      {running ? '…' : 'Test'}
                    </button>
                  </div>

                  {bt ? (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-fg-3">
                        <span>Holdout {bt.symbol ? `· ${bt.symbol}` : ''} {bt.timeframe ? bt.timeframe : ''}</span>
                        {bt.inSample && (
                          <span className="tabular-nums normal-case tracking-normal">
                            in-sample {bt.inSample.trades} · {bt.inSample.expectancyPct == null ? '—' : `${bt.inSample.expectancyPct >= 0 ? '+' : ''}${bt.inSample.expectancyPct.toFixed(2)}%`}
                          </span>
                        )}
                      </div>
                      <SplitBar wins={bt.wins} losses={bt.losses} />
                      <div className="flex items-center gap-3 text-[11px] tabular-nums">
                        <span className="text-fg-3">{bt.trades} trades</span>
                        <span className="text-profit">{bt.wins}W</span>
                        <span className="text-loss">{bt.losses}L</span>
                        <span className="text-fg-2">{pct(bt.hitRate, 0)}</span>
                        <span
                          className={`ml-auto font-medium ${
                            edge == null ? 'text-fg-3' : edge >= 0 ? 'text-profit' : 'text-loss'
                          }`}
                        >
                          {edge == null ? '—' : `${edge >= 0 ? '+' : ''}${edge.toFixed(2)}%`}
                        </span>
                      </div>
                      {s.status !== 'paper' && (
                        <button
                          type="button"
                          disabled={!bt.promote?.ok || actingId === s.id}
                          title={bt.promote?.reasons?.[0]}
                          onClick={() => void promote(s.id)}
                          className="h-7 px-2 rounded-md text-[11px] font-medium bg-white text-black disabled:opacity-40"
                        >
                          {bt.promote?.ok ? 'Promote to paper' : bt.promote?.reasons?.[0] ?? 'Test first'}
                        </button>
                      )}
                      {s.status === 'paper' && (
                        <button
                          type="button"
                          disabled={actingId === s.id}
                          onClick={() => void archive(s.id)}
                          className="h-7 px-2 rounded-md border border-border text-[11px] text-fg-2 hover:text-fg"
                        >
                          Stop paper
                        </button>
                      )}
                      {s.status !== 'paper' && !s.emailOn && bt.promote?.ok && (
                        <p className="text-[11px] text-fg-3">
                          Email is off. <a className="underline" href="/settings">Turn it on</a> or you will only see fills in the inbox.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-fg-3">Not tested on {symbol || 'a symbol'} yet.</p>
                  )}

                  {(s.positions ?? []).length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {(s.positions ?? []).map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-[11px] tabular-nums">
                          <span className={p.side === 'LONG' ? 'text-profit' : 'text-loss'}>{p.side}</span>
                          <span className="text-fg-2">{p.symbol}</span>
                          <span className="text-fg-3">{p.status}</span>
                          <span className="ml-auto text-fg-3">
                            {p.pnlPct == null ? 'open' : `${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct.toFixed(2)}%`}
                          </span>
                        </li>
                      ))}
                    </ul>
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
