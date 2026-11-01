// Trading desk (D1, D3, D4, D12) against the local test DB with a fake exchange.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ExchangeError, type Exchange, type FillEvent, type OrderInfo, type PlaceOrderRequest, type PositionInfo } from '@tradinjournal/exchange';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);
if (local) {
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
}

const KEY = randomBytes(32);

class FakeVenue {
  positions: PositionInfo[] = [];
  open: OrderInfo[] = [];
  fills: FillEvent[] = [];
  placed: PlaceOrderRequest[] = [];
  fillRatio = 1;
  reject: ExchangeError | null = null;
  slow = false;
  asExchange(): Exchange {
    return {
      getPositions: async () => { if (this.slow) await new Promise((r) => setTimeout(r, 300)); return this.positions; },
      getOpenOrders: async () => this.open,
      getFills: async () => [...this.fills].reverse(),
      getInstrument: async (symbol: string) => ({ symbol, contractMultiplier: symbol === 'BTCUSD' ? 0.001 : 0.01, qtyStep: 1, minQty: 1 }),
      placeOrder: async (_c: unknown, o: PlaceOrderRequest) => {
        this.placed.push(o);
        if (this.reject) throw this.reject;
        const filled = Math.floor(o.qty * this.fillRatio);
        return { exchangeOrderId: `x${Date.now()}-${randomBytes(3).toString("hex")}`, clientOrderId: o.clientOrderId ?? null, symbol: o.symbol, side: o.side, type: 'MARKET', status: filled >= o.qty ? 'FILLED' : filled > 0 ? 'CANCELLED' : 'CANCELLED', qty: o.qty, filledQty: filled, avgFillPrice: filled ? 70_100 : null, limitPrice: null, stopPrice: null, reduceOnly: true, createdAt: new Date() } as OrderInfo;
      },
      getOrder: async () => null,
    } as unknown as Exchange;
  }
}

describe('anchorPositions', () => {
  it("walks back from today's position so a window that starts mid-trade still adds up", async () => {
    const { anchorPositions } = await import('../trading.service.js');
    const { closedTrades } = await import('@tradinjournal/exchange');
    const ts = (m: number) => new Date(Date.UTC(2026, 10, 1, 0, m));
    // Oldest first: the window opens with a SELL 1 of a long 3 bought before it (unknown entry),
    // then a full round trip 2 → 0, then a buy that is still open now (1).
    const oldestFirst = [
      { symbol: 'BTCUSD', side: 'SELL' as const, qty: 1, price: 100, ts: ts(0) }, // 3 → 2 (entry unknown)
      { symbol: 'BTCUSD', side: 'SELL' as const, qty: 2, price: 110, ts: ts(1) }, // 2 → 0: closes the unknown one
      { symbol: 'BTCUSD', side: 'BUY' as const, qty: 2, price: 100, ts: ts(2) }, // 0 → 2
      { symbol: 'BTCUSD', side: 'SELL' as const, qty: 2, price: 105, ts: ts(3) }, // 2 → 0: +10
      { symbol: 'BTCUSD', side: 'BUY' as const, qty: 1, price: 100, ts: ts(4) }, // 0 → 1, still open
    ];
    const anchored = anchorPositions([...oldestFirst].reverse(), [{ symbol: 'BTCUSD', size: 1 }]);
    expect(anchored.map((f) => f.positionAfter)).toEqual([1, 0, 2, 0, 2]);
    const trips = closedTrades(anchored.reverse().map((f) => ({ ...f })), () => 1);
    expect(trips.map((t) => [t.side, t.qty, t.pnlUsd])).toEqual([['LONG', 2, 10]]);
    // Without anchoring the same fills read as a short that never closes: no trades at all.
    expect(closedTrades(oldestFirst.map((f) => ({ ...f, positionAfter: null })), () => 1).map((t) => t.pnlUsd)).not.toEqual([10]);
  });

  it("prefers the venue's own position figure when a fill has one", async () => {
    const { anchorPositions } = await import('../trading.service.js');
    const r = anchorPositions([
      { symbol: 'ETHUSD', side: 'BUY' as const, qty: 1 },
      { symbol: 'ETHUSD', side: 'BUY' as const, qty: 1, positionAfter: 7 },
      { symbol: 'ETHUSD', side: 'SELL' as const, qty: 3 },
    ], [{ symbol: 'ETHUSD', size: 4 }]);
    expect(r.map((f) => f.positionAfter)).toEqual([4, 7, 6]);
  });
});

describe.skipIf(!local)('trading desk', () => {
  let prisma: typeof import('@tradinjournal/db').prisma;
  let svc: typeof import('../trading.service.js');
  let encrypt: typeof import('@tradinjournal/secrets').encryptWithKey;
  const tag = `desk${Date.now()}`;
  const venues: Record<string, FakeVenue> = {};
  let me = '';
  let other = '';
  const conns: Record<string, string> = {};

  beforeAll(async () => {
    ({ prisma } = await import('@tradinjournal/db'));
    svc = await import('../trading.service.js');
    ({ encryptWithKey: encrypt } = await import('@tradinjournal/secrets'));
    me = (await prisma.user.create({ data: { name: 'me', email: `${tag}-me@trading.test` } })).id;
    other = (await prisma.user.create({ data: { name: 'o', email: `${tag}-o@trading.test` } })).id;
    const mk = async (userId: string, label: string, over: Record<string, unknown> = {}) =>
      (await prisma.exchangeConnection.create({ data: { userId, exchange: 'DELTA_INDIA', environment: 'TESTNET', label, apiKeyEnc: encrypt(label, KEY), apiSecretEnc: encrypt('s', KEY), keyLast4: label.slice(-4), keyFingerprint: `${tag}-${label}`, canTrade: true, ...over } })).id;
    conns.main = await mk(me, 'Main');
    conns.second = await mk(me, 'Second');
    conns.readonly = await mk(me, 'Readonly', { canTrade: false });
    conns.broken = await mk(me, 'Broken', { status: 'INVALID' });
    conns.theirs = await mk(other, 'Theirs');
    for (const k of Object.keys(conns)) venues[k] = new FakeVenue();
  });

  beforeEach(() => {
    for (const v of Object.values(venues)) Object.assign(v, { positions: [], open: [], fills: [], placed: [], fillRatio: 1, reject: null, slow: false });
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email: { startsWith: tag } } });
    await prisma?.$disconnect();
  });

  // Each connection's apiKeyEnc decrypts to its label; the adapter is chosen per call from the creds.
  const depsFor = () => {
    const venueFor = (label: string) => venues[Object.keys(conns).find((k) => k.toLowerCase() === label.toLowerCase())!]!;
    return {
      key: () => KEY,
      sleep: async () => undefined,
      timeoutMs: 150,
      adapterFor: () => new Proxy({}, {
        // Signed calls go to the account the creds belong to; public ones (instrument data) are the same everywhere.
        get: (_t, prop: string) => (first: unknown, ...rest: unknown[]) => {
          const v = typeof first === 'object' && first && 'apiKey' in first ? venueFor((first as { apiKey: string }).apiKey) : venues.main!;
          return (v.asExchange() as unknown as Record<string, (...a: unknown[]) => unknown>)[prop]!(first, ...rest);
        },
      }) as Exchange,
    };
  };

  it('combines positions, open orders and closed trades across accounts', async () => {
    venues.main!.positions = [{ symbol: 'BTCUSD', size: 5, avgEntry: 70_000, markPrice: 70_500, unrealizedPnl: 2.5, liquidationPrice: 60_000, leverage: null }];
    venues.second!.positions = [{ symbol: 'ETHUSD', size: -3, avgEntry: 3000, markPrice: 2990, unrealizedPnl: 0.3, liquidationPrice: null, leverage: null }, { symbol: 'XRPUSD', size: 0, avgEntry: 0, markPrice: null, unrealizedPnl: 0, liquidationPrice: null, leverage: null }];
    venues.main!.open = [{ exchangeOrderId: 'o1', clientOrderId: null, symbol: 'BTCUSD', side: 'BUY', type: 'LIMIT', status: 'OPEN', qty: 1, filledQty: 0, avgFillPrice: null, limitPrice: 60_000, stopPrice: null, reduceOnly: false, createdAt: new Date() }];
    const t = (m: number) => new Date(Date.now() - m * 60_000);
    venues.second!.fills = [
      { externalId: 'a', symbol: 'BTCUSD', side: 'BUY', qty: 10, price: 70_000, reduceOnly: false, timestamp: t(30), positionAfter: 10, contractMultiplier: 0.001 },
      { externalId: 'b', symbol: 'BTCUSD', side: 'SELL', qty: 10, price: 71_000, reduceOnly: false, timestamp: t(20), positionAfter: 0, contractMultiplier: 0.001 },
    ];
    const r = await svc.deskOverview(me, new Date(), depsFor());
    expect(r.positions.map((p) => [p.connectionLabel, p.symbol, p.side, p.size])).toEqual([['Main', 'BTCUSD', 'LONG', 5], ['Second', 'ETHUSD', 'SHORT', 3]]);
    expect(r.pending.map((o) => [o.connectionLabel, o.exchangeOrderId, o.limitPrice])).toEqual([['Main', 'o1', 60_000]]);
    expect(r.closed).toEqual([expect.objectContaining({ connectionLabel: 'Second', symbol: 'BTCUSD', side: 'LONG', qty: 10, pnlUsd: 10 })]);
    expect(r.counts).toMatchObject({ open: 2, pending: 1, closed: 1 });
    // The broken key isn't read at all; nothing from another user shows up.
    expect(r.errors).toEqual([]);
    expect(JSON.stringify(r)).not.toContain('Theirs');
  });

  it('reports an account the exchange is slow or failing for, instead of showing it empty', async () => {
    venues.main!.slow = true;
    venues.second!.positions = [{ symbol: 'ETHUSD', size: 1, avgEntry: 3000, markPrice: null, unrealizedPnl: 0, liquidationPrice: null, leverage: null }];
    const r = await svc.deskOverview(me, new Date(Date.now() + 5 * 60_000), depsFor());
    expect(r.errors.map((e) => [e.connectionLabel, e.message])).toEqual([['Main', 'The exchange took too long to answer.']]);
    expect(r.positions.map((p) => p.connectionLabel)).toEqual(['Second']);
  });

  it('closes a whole position with a reduce-only market order and logs it', async () => {
    venues.main!.positions = [{ symbol: 'BTCUSD', size: 5, avgEntry: 70_000, markPrice: null, unrealizedPnl: 0, liquidationPrice: null, leverage: null }];
    const r = await svc.closePosition(me, { connectionId: conns.main!, symbol: 'BTCUSD' }, new Date(), depsFor());
    expect(venues.main!.placed).toEqual([expect.objectContaining({ symbol: 'BTCUSD', side: 'SELL', qty: 5, type: 'MARKET', reduceOnly: true })]);
    expect(r.order).toMatchObject({ source: 'MANUAL', status: 'FILLED', filledQty: 5, avgFillPrice: 70_100, connectionLabel: 'Main' });
    expect(r.message).toBe('Closed 5 BTCUSD at 70100.');
  });

  it('closes part of a short, rounding down to whole contracts and never past the position', async () => {
    venues.second!.positions = [{ symbol: 'ETHUSD', size: -3, avgEntry: 3000, markPrice: null, unrealizedPnl: 0, liquidationPrice: null, leverage: null }];
    await svc.closePosition(me, { connectionId: conns.second!, symbol: 'ETHUSD', qty: 1.7 }, new Date(), depsFor());
    await svc.closePosition(me, { connectionId: conns.second!, symbol: 'ETHUSD', qty: 50 }, new Date(), depsFor());
    expect(venues.second!.placed.map((o) => [o.side, o.qty])).toEqual([['BUY', 1], ['BUY', 3]]);
    await expect(svc.closePosition(me, { connectionId: conns.second!, symbol: 'ETHUSD', qty: 0.4 }, new Date(), depsFor())).rejects.toThrow(/smallest amount/i);
  });

  it('records a partial fill and an exchange rejection honestly', async () => {
    venues.main!.positions = [{ symbol: 'BTCUSD', size: 4, avgEntry: 70_000, markPrice: null, unrealizedPnl: 0, liquidationPrice: null, leverage: null }];
    venues.main!.fillRatio = 0.5;
    const part = await svc.closePosition(me, { connectionId: conns.main!, symbol: 'BTCUSD' }, new Date(), depsFor());
    expect(part.order).toMatchObject({ status: 'PARTIAL', filledQty: 2, qty: 4 });
    expect(part.message).toMatch(/Closed 2 of 4/);
    venues.main!.reject = new ExchangeError('INSUFFICIENT_MARGIN', 'Not enough margin.');
    const rej = await svc.closePosition(me, { connectionId: conns.main!, symbol: 'BTCUSD' }, new Date(), depsFor());
    expect(rej.order).toMatchObject({ status: 'REJECTED', error: 'Not enough margin.' });
    expect(rej.message).toMatch(/didn't accept/);
  });

  it('refuses closes that make no sense or are not yours', async () => {
    const run = (connectionId: string, symbol = 'BTCUSD') => svc.closePosition(me, { connectionId, symbol }, new Date(), depsFor());
    await expect(run(conns.theirs!)).rejects.toThrow(/not found/i);
    await expect(run(conns.broken!)).rejects.toThrow(/stopped working/i);
    await expect(run(conns.readonly!)).rejects.toThrow(/read-only/i);
    await expect(run(conns.main!, 'DOGEUSD')).rejects.toThrow(/no open DOGEUSD/i);
    expect(venues.theirs!.placed).toEqual([]);
  });

  it('asks before closing a position a live copy manages', async () => {
    const lu = await prisma.user.create({ data: { name: 'lead', email: `${tag}-lead@trading.test` } });
    const lc = await prisma.exchangeConnection.create({ data: { userId: lu.id, exchange: 'DELTA_INDIA', environment: 'TESTNET', label: 'L', apiKeyEnc: 'x', apiSecretEnc: 'x', keyLast4: 'L', keyFingerprint: `${tag}-L` } });
    const leader = await prisma.copyLeader.create({ data: { userId: lu.id, connectionId: lc.id, displayName: `${tag} Alpha`, status: 'VERIFIED' } });
    const follow = await prisma.copyFollow.create({ data: { userId: me, leaderId: leader.id, connectionId: conns.main!, sizingMode: 'MULTIPLIER', sizingValue: 1 } });
    await prisma.exchangePosition.create({ data: { connectionId: conns.main!, followId: follow.id, positionKey: follow.id, source: 'COPY', symbol: 'BTCUSD', side: 'LONG', qty: 2, avgEntry: 70_000 } });
    venues.main!.positions = [{ symbol: 'BTCUSD', size: 2, avgEntry: 70_000, markPrice: null, unrealizedPnl: 0, liquidationPrice: null, leverage: null }];
    expect((await svc.deskOverview(me, new Date(Date.now() + 10 * 60_000), depsFor())).positions[0]!.copiedFrom).toEqual({ followId: follow.id, leaderName: `${tag} Alpha` });
    await expect(svc.closePosition(me, { connectionId: conns.main!, symbol: 'BTCUSD' }, new Date(), depsFor())).rejects.toMatchObject({ code: 'COPY_MANAGED', statusCode: 409 });
    expect(venues.main!.placed).toEqual([]);
    const ok = await svc.closePosition(me, { connectionId: conns.main!, symbol: 'BTCUSD', confirmCopied: true }, new Date(), depsFor());
    expect(ok.order.status).toBe('FILLED');
  });

  it('pages the order log with filters, only for this user', async () => {
    const all = await svc.deskOrders(me, { status: 'all', limit: 3 });
    expect(all.items.length).toBe(3);
    expect(all.items.every((o) => o.source === 'MANUAL')).toBe(true);
    const next = await svc.deskOrders(me, { status: 'all', limit: 3, cursor: all.nextCursor! });
    expect(new Set([...all.items, ...next.items].map((o) => o.id)).size).toBe(all.items.length + next.items.length);
    expect((await svc.deskOrders(me, { status: 'rejected', limit: 50 })).items.map((o) => o.status)).toEqual(['REJECTED']);
    expect((await svc.deskOrders(me, { status: 'filled', limit: 50 })).items.every((o) => ['FILLED', 'PARTIAL'].includes(o.status))).toBe(true);
    expect((await svc.deskOrders(other, { status: 'all', limit: 50 })).items).toEqual([]);
    expect((await svc.deskOverview(me, new Date(Date.now() + 20 * 60_000), depsFor())).counts.rejected).toBe(1);
  });
  it('reads closed history fresh right after a close, even though the exchange lags', async () => {
    const t0 = new Date(Date.now() + 60 * 60_000);
    const at = (s: number) => new Date(t0.getTime() - s * 1000);
    venues.main!.positions = [{ symbol: 'BTCUSD', size: 2, avgEntry: 70_000, markPrice: null, unrealizedPnl: 0, liquidationPrice: null, leverage: null }];
    venues.main!.fills = [{ externalId: 'o', symbol: 'BTCUSD', side: 'BUY', qty: 2, price: 70_000, reduceOnly: false, timestamp: at(60), contractMultiplier: 0.001 }];
    expect((await svc.deskOverview(me, t0, depsFor())).closed.filter((c) => c.connectionLabel === 'Main')).toEqual([]);
    // (An earlier test left a copy managing this symbol on Main, hence the confirmation.)
    await svc.closePosition(me, { connectionId: conns.main!, symbol: 'BTCUSD', confirmCopied: true }, t0, depsFor());
    // Right after the close the exchange hasn't published the fill yet...
    expect((await svc.deskOverview(me, new Date(t0.getTime() + 1000), depsFor())).closed.filter((c) => c.connectionLabel === 'Main')).toEqual([]);
    // ...a few seconds later it has, and the desk shows it without waiting out the cache.
    venues.main!.positions = [];
    venues.main!.fills.push({ externalId: 'c', symbol: 'BTCUSD', side: 'SELL', qty: 2, price: 70_500, reduceOnly: false, timestamp: at(-2), contractMultiplier: 0.001 });
    const later = await svc.deskOverview(me, new Date(t0.getTime() + 5000), depsFor());
    expect(later.closed.filter((c) => c.connectionLabel === 'Main').map((c) => [c.symbol, c.qty, c.pnlUsd])).toEqual([['BTCUSD', 2, 1]]);
  });
});
