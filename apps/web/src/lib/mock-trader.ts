// Mock-mode SignalX (dev-only): deterministic analyses anchored to the mock
// market's latest close, a canned graded history and track record.
import type { TraderAnalysis, TraderStrategy, TraderTimeframe, TraderTrackRecord } from '@/lib/trader-api';
import { MOCK_SYMBOLS, mockCandles } from '@/lib/mock-market';

const g = globalThis as unknown as { __trHist?: TraderAnalysis[]; __trStrat?: TraderStrategy[] };
const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();

export function mockAnalyze(symbol: string, tfs: TraderTimeframe[]): TraderAnalysis {
  const sym = symbol.toUpperCase();
  const meta = MOCK_SYMBOLS.find(s => s.symbol === sym);
  const c = mockCandles(sym, tfs[0] ?? '1h', 120);
  const last = c[c.length - 1]!.close;
  const atr = c.slice(-14).reduce((a, b) => a + (b.high - b.low), 0) / 14;
  const up = c[c.length - 1]!.close > c[c.length - 40]!.close;
  const dir = up ? 1 : -1;
  const r = (n: number) => +n.toFixed(last < 10 ? 5 : last < 1000 ? 2 : 1);
  return {
    id: `an-${Date.now()}`, symbol: sym, assetClass: meta?.assetClass ?? 'crypto', timeframes: tfs, direction: up ? 'LONG' : 'SHORT',
    entryLow: r(last - dir * atr * 0.6), entryHigh: r(last - dir * atr * 0.2), stop: r(last - dir * atr * 1.8),
    t1: r(last + dir * atr * 1.2), t2: r(last + dir * atr * 2.4), t3: r(last + dir * atr * 4),
    support: [{ price: r(last - atr * 1.8), label: 'Swing low' }, { price: r(last - atr * 3), label: 'Prior range' }],
    resistance: [{ price: r(last + atr * 1.2), label: 'Swing high' }, { price: r(last + atr * 2.4), label: 'Weekly high' }],
    confidence: up ? 72 : 61,
    rationale: up ? `Higher lows on the ${tfs[0]} above the rising 50-EMA, with the higher timeframe aligned. A pullback into the entry zone offers a defined-risk long.` : `Lower highs below the falling 50-EMA. A retest of the entry zone offers a defined-risk short.`,
    invalidation: `Invalid on a ${tfs[0]} close beyond the stop.`,
    detail: 'Momentum and trend agree; flow is neutral; macro is a mild headwind.',
    perTimeframe: tfs.map(tf => ({ tf, trend: up ? 'up' : 'down', rsi: up ? 58 : 42, atr: +atr.toFixed(4), note: '' })),
    laneBreakdown: [
      { id: 'technical', score: 0.42 * dir, weight: 0.4, rationale: 'Trend + structure', source: 'Trend' },
      { id: 'ml', score: 0.31 * dir, weight: 0.25, rationale: 'Momentum model', source: 'Momentum' },
      { id: 'flow', score: 0.08, weight: 0.15, rationale: 'Order-flow balance', source: 'Flow' },
      { id: 'macro', score: -0.12, weight: 0.2, rationale: 'Real yields rising', source: 'Macro' },
    ],
    confidenceSource: 'meta_v1', aiUsed: false, asOf: new Date().toISOString(), engineVer: 'sx-1.4', outcome: null, hitLevel: null,
  };
}

export const history = () => (g.__trHist ??= [
  { ...mockAnalyze('BTCUSDT', ['4h']), id: 'h1', asOf: ago(90), outcome: 'TARGET_HIT', hitLevel: 'T2' },
  { ...mockAnalyze('EURUSD', ['1h']), id: 'h2', direction: 'SHORT', asOf: ago(110), outcome: 'STOP_HIT', hitLevel: null },
  { ...mockAnalyze('US100', ['1h']), id: 'h3', asOf: ago(140), outcome: 'TARGET_HIT', hitLevel: 'T1' },
  { ...mockAnalyze('XAUUSD', ['1h', '4h']), id: 'h4', asOf: ago(3), outcome: null, hitLevel: null },
] as TraderAnalysis[]);

export const trackRecord = (): TraderTrackRecord => ({
  sampleSize: 56, graded: 48, pending: 3, skipped: 0, targetHits: 28, stopHits: 15, expired: 5, hitRate: 0.58, expectancyR: 0.42,
  calibration: [
    { bucket: '50-60', predicted: 55, count: 14, hitRate: 0.54, targetHits: 7, stopHits: 5, expired: 2 },
    { bucket: '60-70', predicted: 65, count: 16, hitRate: 0.61, targetHits: 9, stopHits: 5, expired: 2 },
    { bucket: '70-80', predicted: 75, count: 12, hitRate: 0.68, targetHits: 8, stopHits: 3, expired: 1 },
    { bucket: '80-100', predicted: 85, count: 6, hitRate: 0.79, targetHits: 4, stopHits: 2, expired: 0 },
  ],
  bySymbol: [], methodology: 'Graded at the first touch of a target or the stop within the horizon.',
  disclaimer: 'A call is graded TARGET_HIT when price touches T1 or beyond before the stop within the horizon; STOP_HIT when the stop is touched first; otherwise EXPIRED. Educational only.',
  asOf: new Date().toISOString(),
});

export const strategies = () => (g.__trStrat ??= [
  { id: 's1', name: 'London breakout · XAUUSD', prompt: 'Long on a 20-bar high breakout…', rules: { kind: 'breakout', direction: 'LONG', timeframe: '1h', lookback: 20, stopAtr: 1.5, targetR: 2 }, status: 'paper',
    lastBacktest: { trades: 42, wins: 25, losses: 17, hitRate: 0.6, expectancyPct: 0.31, maxDrawdownPct: 4.2, symbol: 'XAUUSD', timeframe: '1h', promote: { ok: true, reasons: [] } }, emailOn: true, createdAt: ago(200), updatedAt: ago(20) },
  { id: 's2', name: 'RSI bounce · BTCUSD', prompt: 'Long when RSI(14) drops under 30…', rules: { kind: 'rsi_threshold', direction: 'LONG', timeframe: '1h', rsiPeriod: 14, rsiBelow: 30, stopAtr: 1.5, targetR: 2 }, status: 'draft',
    lastBacktest: null, emailOn: false, createdAt: ago(30), updatedAt: ago(30) },
] as TraderStrategy[]);
