// Patterns service with fake candles and a fake AI: no network.
import { describe, expect, it } from 'vitest';
import { explainPattern, findPatterns, ruleExplanation, type PatternsDeps } from '../patterns.service.js';

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 1, 12, 30);
// A double top that confirmed, then a forming bar that must be ignored.
function candles() {
  const pts: Array<[number, number]> = [[0, 70], [25, 100], [37, 88], [49, 100.3], [64, 85]];
  const closes: number[] = [];
  for (let k = 1; k < pts.length; k++) { const [i0, p0] = pts[k - 1]!; const [i1, p1] = pts[k]!; for (let i = i0; i < i1; i++) closes.push(p0 + ((p1 - p0) * (i - i0)) / (i1 - i0)); }
  closes.push(85, 300); // the last bar is still forming
  const first = Math.floor(NOW / H) * H - (closes.length - 1) * H;
  return closes.map((c, i) => ({ openTime: first + i * H, open: i ? closes[i - 1]! : c, high: c + 0.3, low: c - 0.3, close: c, volume: 1 }));
}
const base = (over: Partial<PatternsDeps> = {}): PatternsDeps => ({ loadCandles: async () => candles(), now: () => NOW, cache: false, ai: () => false, explainWithAi: async () => ({}), ...over });

describe('patterns service', () => {
  it('detects on closed bars and validates input', async () => {
    const r = await findPatterns(' btcusdt ', '1h', base());
    expect(r.symbol).toBe('BTCUSDT');
    expect(r.price).toBe(85); // the forming 300 bar is ignored
    expect(r.patterns.find((p) => p.kind === 'double_top')).toMatchObject({ status: 'confirmed' });
    await expect(findPatterns('BTC/USDT', '1h', base())).rejects.toThrow(/market symbol/);
    await expect(findPatterns('BTCUSDT', '3h', base())).rejects.toThrow(/Timeframe/);
    await expect(findPatterns('ZZZUSDT', '1h', base({ loadCandles: async () => [] }))).rejects.toThrow(/No market data/);
  });

  it('explains from the rules when AI is off, using the pattern’s own numbers', async () => {
    const r = await findPatterns('BTCUSDT', '1h', base());
    const top = r.patterns.find((p) => p.kind === 'double_top')!;
    const e = await explainPattern('BTCUSDT', '1h', top.id, base());
    expect(e.source).toBe('rules');
    expect(e.whatItIs).toMatch(/double top/);
    expect(e.whatItIs).toMatch(/confirmed/);
    expect(e.whereItsWrong).toContain('above 100.6');
    expect(e.measuredMove).toMatch(/about 74\.8/);
    await expect(explainPattern('BTCUSDT', '1h', 'nope', base())).rejects.toThrow(/isn’t on the chart/);
  });

  it('uses Claude when it answers properly, and falls back when it doesn’t', async () => {
    const r = await findPatterns('BTCUSDT', '1h', base());
    const id = r.patterns.find((p) => p.kind === 'double_top')!.id;
    const prompts: string[] = [];
    const good = { whatItIs: 'Two peaks near 100.5 with a dip to 87.7 between them.', whyItMatters: 'Failing twice at the same high often marks exhaustion.', whereItsWrong: 'A close back above about 100.6 would undo it.', measuredMove: 'Neckline minus the height points to roughly 74.8.' };
    const e = await explainPattern('BTCUSDT', '1h', id, base({ ai: () => true, explainWithAi: async (m) => { prompts.push(m.map((x) => x.content).join('\n')); return good; } }));
    expect(e).toMatchObject({ source: 'ai', ...good });
    expect(prompts[0]).toContain('"pattern":"Double top"');
    expect(prompts[0]).toContain('never tell the reader to buy or sell');
    const bad = await explainPattern('BTCUSDT', '1h', id, base({ ai: () => true, explainWithAi: async () => ({ whatItIs: 'x' }) }));
    expect(bad.source).toBe('rules');
    const down = await explainPattern('BTCUSDT', '1h', id, base({ ai: () => true, explainWithAi: async () => { throw new Error('overloaded'); } }));
    expect(down.source).toBe('rules');
  });

  it('writes sensible fallbacks for every family', () => {
    const lvl = ruleExplanation({ id: 'x', kind: 'support', family: 'level', label: 'Support', bias: 'neutral', status: 'forming', startTime: 0, endTime: 0, lines: [], points: [], breakout: 99.8, invalidation: null, target: null, quality: 1, touches: 3 }, 'ETHUSDT', '4h');
    expect(lvl.whatItIs).toContain('3 touches near 99.8');
    expect(lvl.whereItsWrong).toMatch(/flip to resistance/);
    expect(lvl.measuredMove).toMatch(/no measured move/);
  });
});
