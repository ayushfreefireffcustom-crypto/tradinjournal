// One regime for the whole app: buildMacroState reports the overview trail's
// regime (not classifyRegime's) whenever the trail computes, and falls back to
// classifyRegime otherwise. The assistant prompt reads state.regime, so it agrees.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const indicatorFindMany = vi.fn();
const buildMacroOverview = vi.fn();

vi.mock('@tradinjournal/db', () => ({
  prisma: {
    macroIndicator: { findMany: indicatorFindMany },
    macroMarketQuote: { findMany: vi.fn().mockResolvedValue([]) },
    economicEvent: { findMany: vi.fn().mockResolvedValue([]) },
    newsItem: { findMany: vi.fn().mockResolvedValue([]) },
  },
  Prisma: {},
}));
vi.mock('@tradinjournal/config', () => ({ env: { MACRO_ENABLED: true, MACRO_STATE_CACHE_TTL: 60 } }));
vi.mock('@tradinjournal/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../../lib/cache.js', () => ({ cacheGet: vi.fn(), cacheSet: vi.fn(), cacheDel: vi.fn() }));
vi.mock('../../../lib/macro/providers/markets.js', () => ({ fetchMarketQuotes: vi.fn(), fetchFxBasket: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../lib/macro/providers/fred.js', () => ({ fetchFredIndicators: vi.fn(), fetchFredHistory: vi.fn() }));
vi.mock('../../../lib/macro/providers/cot.js', () => ({ fetchCotPositioning: vi.fn() }));
vi.mock('../macro-signals.service.js', () => ({ computeAndPersistSignals: vi.fn() }));
vi.mock('../macro-overview.service.js', () => ({ buildMacroOverview }));

const { buildMacroState } = await import('../macro.service.js');
const { templateFallback } = await import('../macro-assistant.prompt.js');

const dec = (n: number) => ({ toNumber: () => n });
const row = (key: string, value: number, prev: number) => ({
  key, label: key, value: dec(value), prev: dec(prev), forecast: null, unit: null, source: 'fred', asOf: new Date('2026-10-01T00:00:00Z'),
});

describe('state.regime source of truth', () => {
  beforeEach(() => {
    buildMacroOverview.mockReset();
    // CPI index up (classifyRegime → inflation up), payrolls up → "Reflation".
    indicatorFindMany.mockImplementation(async (args: { distinct?: string[] }) =>
      args.distinct ? [row('CPILFESL', 339.9, 338.9), row('PAYEMS', 159_293, 159_044), row('UNRATE', 4.1, 4.2)] : [],
    );
  });

  it('reports the trail regime when the overview computes', async () => {
    buildMacroOverview.mockResolvedValue({
      asOf: '', inputs: [], drivers: [], grid: [], surprise: null, cuts: null,
      regime: {
        label: 'Goldilocks', since: '2026-08', months: 3, line: 'Growth improving, inflation cooling', seriesCount: 3, near: null,
        points: [{ month: '2026-10', growth: 0.59, inflation: -0.45, label: 'Goldilocks' }],
      },
    });
    const s = await buildMacroState();
    expect(s.regime).toMatchObject({ label: 'Goldilocks', growth: 'up', inflation: 'down' });
    expect(s.overview!.regime!.label).toBe(s.regime!.label);
    // The assistant's grounded fallback reads the same regime.
    expect(templateFallback('What is the regime?', s)).toContain('Regime: Goldilocks');
  });

  it('falls back to classifyRegime when the trail cannot compute', async () => {
    buildMacroOverview.mockResolvedValue({ asOf: '', inputs: [], drivers: [], grid: [], surprise: null, cuts: null, regime: null });
    const s = await buildMacroState();
    expect(s.regime!.label).toBe('Reflation');
  });

  it('falls back when the overview throws', async () => {
    buildMacroOverview.mockRejectedValue(new Error('db down'));
    const s = await buildMacroState();
    expect(s.regime!.label).toBe('Reflation');
    expect(s.overview).toBeUndefined();
  });
});
