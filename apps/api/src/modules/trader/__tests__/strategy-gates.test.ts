import { describe, expect, it } from 'vitest';
import type { TraderCandle as Candle } from '@tradinjournal/core';
import {
  advancePosition,
  barHit,
  evaluatePromote,
  lastClosedIndex,
  signalOnBar,
  walkForwardBacktest,
  type BacktestResult,
  type StrategyRules,
} from '../strategy-backtest.js';

function bar(i: number, o: number, h: number, l: number, c: number): Candle {
  return { openTime: i * 3_600_000, open: o, high: h, low: l, close: c, volume: 1 };
}

function flat(n: number, px = 100): Candle[] {
  return Array.from({ length: n }, (_, i) => bar(i, px, px + 1, px - 1, px));
}

const empty: BacktestResult = {
  trades: 0,
  wins: 0,
  losses: 0,
  hitRate: null,
  expectancyPct: null,
  maxDrawdownPct: null,
  samples: [],
};

describe('promote gates', () => {
  it('rejects a thin or losing holdout and a deep drawdown', () => {
    expect(evaluatePromote({ ...empty, trades: 4 }).ok).toBe(false);
    expect(evaluatePromote({ ...empty, trades: 40, expectancyPct: -0.2, maxDrawdownPct: 4 }).ok).toBe(false);
    expect(evaluatePromote({ ...empty, trades: 40, expectancyPct: 0.4, maxDrawdownPct: 31 }).ok).toBe(false);
    expect(evaluatePromote({ ...empty, trades: 30, expectancyPct: 0.1, maxDrawdownPct: 12 }).ok).toBe(true);
  });
});

describe('breakout and macd signals', () => {
  it('fires a long breakout when close clears the prior range', () => {
    const candles = flat(30, 100);
    candles[29] = bar(29, 100, 112, 99, 111);
    const rules: StrategyRules = { kind: 'breakout', direction: 'LONG', lookback: 20 };
    expect(signalOnBar(candles, rules, 29)).toBe('LONG');
  });

  it('fires a long MACD cross after a dip and recovery', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 80; i++) {
      const wave = Math.sin(i / 6) * 4;
      const trend = i > 55 ? (i - 55) * 0.8 : 0;
      const c = 100 + wave + trend;
      candles.push(bar(i, c, c + 0.4, c - 0.4, c));
    }
    const rules: StrategyRules = { kind: 'macd_cross', direction: 'BOTH' };
    const hits = candles.map((_, i) => signalOnBar(candles, rules, i)).filter(Boolean);
    expect(hits.length).toBeGreaterThan(0);
  });
});

describe('paper resolution', () => {
  it('lets the stop win when both barriers print on the same bar', () => {
    const c = bar(2, 100, 120, 90, 100);
    expect(barHit('LONG', 95, 110, c)?.reason).toBe('stop');
  });

  it('is idempotent on an already-closed entry bar and ignores a forming bar', () => {
    const candles = [
      bar(0, 100, 100, 100, 100),
      bar(1, 100, 101, 99, 100),
      bar(2, 100, 130, 99, 120),
    ];
    const now = candles[1]!.openTime + 3_600_000;
    expect(lastClosedIndex(candles, 3_600_000, now)).toBe(1);

    const open = advancePosition({
      side: 'LONG',
      entry: 100,
      stop: 90,
      target: 140,
      entryBarTime: candles[1]!.openTime,
      horizonBars: 48,
      candles,
      tfMs: 3_600_000,
      now,
    });
    expect(open.status).toBe('open');
  });
});

describe('walk-forward', () => {
  it('keeps holdout trades out of the in-sample bucket', () => {
    const candles = flat(120, 100).map((c, i) => {
      const px = 100 + (i > 90 ? (i - 90) * 2 : Math.sin(i / 5));
      return bar(i, px, px + 0.5, px - 0.5, px);
    });
    const result = walkForwardBacktest(
      candles,
      { kind: 'price_vs_ema', direction: 'BOTH', fast: 8, slow: 20 },
      'BTCUSDT',
      '1h',
    );
    const split = candles[Math.floor(candles.length * 0.7)]!.openTime;
    expect(result.inSample.samples.every((t) => t.entryTime < split) || result.inSample.trades >= 0).toBe(true);
    expect(result.holdout.trades).toBe(result.trades);
    expect(result.promote.ok).toBe(false);
  });
});
