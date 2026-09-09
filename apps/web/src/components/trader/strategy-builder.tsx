'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flask, Play } from '@phosphor-icons/react';
import { traderApi, type TraderStrategy } from '@/lib/trader-api';
import { pct } from './outcome-badge';

export default function StrategyBuilder() {
  const [prompt, setPrompt] = useState('Buy when EMA20 crosses above EMA50; exit on 1.5 ATR stop or 2R target.');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [rows, setRows] = useState<TraderStrategy[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [runningId, setRunningId] = useState<string | null>(null);

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
    setBusy(true);
    setError('');
    try {
      await traderApi.createStrategy(prompt);
      setPrompt('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function runBacktest(id: string) {
    setRunningId(id);
    setError('');
    try {
      await traderApi.backtestStrategy(id, symbol.trim().toUpperCase() || 'BTCUSDT', '1h');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backtest failed');
    } finally {
      setRunningId(null);
    }
  }

  return (
    <section
      className="rounded-xl border border-border bg-surface p-4 animate-[fade-up_0.5s_ease_both]"
      data-testid="trader-strategy-builder"
    >
      <div className="flex items-center gap-2 mb-1">
        <Flask size={14} className="text-fg-3" />
        <h3 className="text-sm font-medium text-fg">Strategy builder</h3>
      </div>
      <p className="text-xs text-fg-3 mb-3">Describe a rule → compile → backtest on candles.</p>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={3}
        placeholder="e.g. Long when RSI &lt; 30, stop 1.5 ATR, target 2R…"
        className="w-full rounded-lg border border-border bg-app px-3 py-2 text-sm text-fg placeholder:text-fg-3 outline-none focus:border-border-strong focus:ring-2 focus:ring-white/10 resize-none"
      />

      <div className="mt-2 flex items-center gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          className="h-8 w-28 rounded-md border border-border bg-app px-2 text-xs tabular-nums outline-none focus:border-border-strong"
          placeholder="BTCUSDT"
        />
        <button
          type="button"
          disabled={busy || prompt.trim().length < 8}
          onClick={() => void create()}
          className="h-8 px-3 rounded-md text-xs font-medium bg-white text-black disabled:opacity-40"
        >
          {busy ? '…' : 'Compile'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-loss">{error}</p>}

      {rows.length > 0 && (
        <ul className="mt-4 space-y-2">
          {rows.map((s) => (
            <li key={s.id} className="rounded-lg border border-border bg-app/50 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  <div className="text-[11px] text-fg-3 truncate">{s.rules.kind} · {s.rules.direction}</div>
                  {s.lastBacktest && (
                    <div className="mt-1 text-[11px] tabular-nums text-fg-2">
                      {s.lastBacktest.trades} trades · hit {pct(s.lastBacktest.hitRate, 0)} · E[
                      {s.lastBacktest.expectancyPct == null
                        ? '—'
                        : `${s.lastBacktest.expectancyPct >= 0 ? '+' : ''}${s.lastBacktest.expectancyPct.toFixed(2)}%`}
                      ]
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void runBacktest(s.id)}
                  disabled={runningId === s.id}
                  className="h-7 px-2 rounded-md border border-border text-[11px] text-fg-2 hover:text-fg inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <Play size={11} weight="fill" />
                  {runningId === s.id ? '…' : 'Test'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
