// AI coach context chips and tools (H11) against the local test DB, no AI calls.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StrategySpec } from '@tradinjournal/core';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
const tag = `coach${Date.now()}`;
const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 1);

describe.skipIf(!local)('coach chips and tools', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let chips: typeof import('../context-chips.service.js');
  let strat: typeof import('../../strategies/strategies.service.js');
  let ai: typeof import('../ai.service.js');
  let core: typeof import('@tradinjournal/core');
  let env: typeof import('@tradinjournal/config').env;
  const u: Record<string, string> = {};
  const deps = (tune: (m: unknown) => Promise<unknown>) => ({
    candles: async (_s: string, _tf: string, f: number, t: number, limit: number) => {
      const out = [];
      for (let ts = Math.ceil(f / H) * H; ts <= t && out.length < limit; ts += H) { const i = ts / H; const c = 100 + 10 * Math.sin(i / 15) + (i % 7) * 0.1; out.push({ openTime: ts, open: c, high: c + 0.6, low: c - 0.6, close: c, volume: 10 }); }
      return out;
    },
    now: () => NOW, ai: () => true, generate: async () => ({}), tune,
  });
  beforeAll(async () => {
    vi.resetModules();
    Object.assign(process.env, { DATABASE_URL: DB, DIRECT_URL: DB });
    ({ prisma } = await import('@tradinjournal/db'));
    ({ env } = await import('@tradinjournal/config'));
    chips = await import('../context-chips.service.js');
    strat = await import('../../strategies/strategies.service.js');
    ai = await import('../ai.service.js');
    core = await import('@tradinjournal/core');
    for (const n of ['me', 'other']) u[n] = (await prisma.user.create({ data: { email: `${tag}-${n}@trading.test`, name: n } })).id;
  });
  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  it('offers only the chips the user has data for, and builds the context from their own records', async () => {
    expect(await chips.availableChips(u.me!)).toEqual([]);
    const s = await strat.createStrategy(u.me!, { name: 'Chip strat', spec: core.defaultSpec('BTCUSDT') });
    const d = await prisma.strategyDeployment.create({ data: { userId: u.me!, strategyId: s.id, version: 1, spec: {}, name: 'Chip run', mode: 'paper', capital: 1000, startedAt: new Date(NOW - 48 * H) } });
    await prisma.deploymentTrade.create({ data: { deploymentId: d.id, symbol: 'BTCUSDT', side: 'long', qty: 1, entryPrice: 100, entryTime: new Date(NOW - 5 * H), exitPrice: 104, exitTime: new Date(NOW - 2 * H), pnl: 4, pnlPct: 4, fees: 0, rMultiple: 1, reason: 'target' } });
    // Someone else's run must never appear.
    const so = await strat.createStrategy(u.other!, { name: 'Other strat', spec: core.defaultSpec('ETHUSDT') });
    await prisma.strategyDeployment.create({ data: { userId: u.other!, strategyId: so.id, version: 1, spec: {}, name: 'Not mine', mode: 'paper', capital: 1000 } });
    const conn = await prisma.exchangeConnection.create({ data: { userId: u.me!, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: 'Coach conn', apiKeyEnc: 'a', apiSecretEnc: 'b', keyLast4: '1111', keyFingerprint: `${tag}-fp`, status: 'REVOKED' } });
    await prisma.exchangeFill.create({ data: { connectionId: conn.id, externalId: `${tag}-f1`, symbol: 'BTCUSD', side: 'BUY', qty: 3, price: 78000, fee: 0.12, exchTs: new Date(NOW - 24 * H) } });
    await prisma.exchangeFill.create({ data: { connectionId: conn.id, externalId: `${tag}-f2`, symbol: 'BTCUSD', side: 'SELL', qty: 3, price: 79000, exchTs: new Date(NOW - 9 * 24 * H) } });
    const list = await chips.availableChips(u.me!, new Date(NOW));
    expect(list.find((c) => c.id === 'strategies')).toEqual({ id: 'strategies', label: 'Live strategies', count: 1 });
    // A revoked connection doesn't offer live positions.
    expect(list.some((c) => c.id === 'positions')).toBe(false);
    if (env.TRADING_ENABLED) expect(list.find((c) => c.id === 'fills7d')).toMatchObject({ count: 1 });
    const text = (await chips.chipContext(u.me!, ['strategies', 'fills7d'], new Date(NOW)))!;
    expect(text).toMatch(/^<ACCOUNT_DATA/);
    expect(text).toContain('"Chip run" on paper, running');
    expect(text).toContain('1 closed trades, 4 USD closed P&L');
    expect(text).not.toContain('Not mine');
    if (env.TRADING_ENABLED) { expect(text).toContain('BUY 3 BTCUSD @ 78,000 fee 0.12'); expect(text).not.toContain('79,000'); }
    expect(await chips.chipContext(u.me!, [], new Date(NOW))).toBeNull();
  });

  it('tunes a strategy: keeps markets and stop, refuses no-ops, backtests both on one window', async () => {
    const spec = core.defaultSpec('BTCUSDT');
    spec.entry.long = { match: 'all', conditions: [{ left: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 9 } }, operator: 'crosses_above', right: { kind: 'indicator', id: 'ema', output: 'value', params: { length: 21 } } }] };
    spec.risk.stopLoss = { mode: 'pct', value: 3 };
    const s = await strat.createStrategy(u.me!, { name: 'Tune me', spec });
    const tighter = structuredClone(spec); tighter.risk.stopLoss = { mode: 'pct', value: 1.5 }; tighter.market.symbols = [{ symbol: 'DOGEUSDT' }];
    let calls = 0;
    const r = await strat.tuneStrategy(u.me!, s.id, 'Smaller losses', deps(async () => { calls++; return { spec: tighter, changes: ['Stop loss from 3% to 1.5%'] }; }) as never);
    expect(calls).toBe(1);
    expect(r.changes).toEqual(['Stop loss from 3% to 1.5%']);
    expect((r.proposal as StrategySpec).market.symbols).toEqual([{ symbol: 'BTCUSDT' }]); // markets can't be changed by a tune
    expect((r.proposal as StrategySpec).risk.stopLoss).toEqual({ mode: 'pct', value: 1.5 });
    expect(r.window.days).toBe(180);
    expect(typeof r.before.totalReturnPct).toBe('number');
    expect(typeof r.after.totalReturnPct).toBe('number');
    expect(r.readback.join(' ')).toMatch(/1\.5%/);
    // Nothing is saved until the user confirms.
    expect((await strat.getStrategy(u.me!, s.id)).version).toBe(1);
    // Removing the stop or changing nothing is refused (after one retry).
    const noStop = structuredClone(spec); noStop.risk.stopLoss = null;
    await expect(strat.tuneStrategy(u.me!, s.id, 'More trades', deps(async () => ({ spec: noStop, changes: [] })) as never)).rejects.toThrow(/stop loss can’t be removed/);
    await expect(strat.tuneStrategy(u.me!, s.id, 'More trades', deps(async () => ({ spec, changes: [] })) as never)).rejects.toThrow(/Nothing was changed/);
    await expect(strat.tuneStrategy(u.me!, s.id, 'Anything', { ...deps(async () => ({})), ai: () => false } as never)).rejects.toThrow(/needs AI/);
    await expect(strat.tuneStrategy(u.other!, s.id, 'Anything', deps(async () => ({})) as never)).rejects.toThrow(/not found/);
  });

  it('saves a tool result as a conversation turn', async () => {
    const id = await ai.persistTurn({ userId: u.me!, brokerAccountId: 'none', userContent: 'Generate a strategy: buy RSI dips', assistantContent: 'Made **RSI dip**. Backtest: +4.2% over 90 days.', lane: 'personal' });
    const c = await ai.getConversation(u.me!, id);
    expect(c!.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
  });
});
