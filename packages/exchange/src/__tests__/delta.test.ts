import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExchangeError } from '../errors.js';
import { deltaConfigFromEnv, type DeltaConfig } from '../delta/config.js';
import { deltaSignature, encodeQuery, mapDeltaError } from '../delta/rest.js';
import { deltaClientOrderId, deltaOrderBody, deltaTime, DeltaIndiaExchange, mapDeltaOrder, parseUserTrade } from '../delta/adapter.js';
import type { WsLike } from '../delta/ws.js';

const CFG: DeltaConfig = { env: 'testnet', restUrl: 'https://delta.test', wsUrl: 'wss://delta.test', userAgent: 'tradelogs/1.0' };
const CREDS = { apiKey: 'key-1', apiSecret: 'test-secret' };

describe('signing', () => {
  it('matches independently computed HMAC vectors', () => {
    // Reference values computed with Python's hmac module.
    expect(deltaSignature('test-secret', 'GET', '1542110948', '/v2/orders', '?product_id=1&state=open', '')).toBe(
      '0d782b80c7da29f8316fb50c2bf9caf1fdf95a7036e3d2e9b6c2f232d87f9cd5',
    );
    expect(deltaSignature('test-secret', 'POST', '1700000000', '/v2/orders', '', '{"product_id":84,"size":1}')).toBe(
      '67e8920e9469c0608c0a00f7470ae1715dd863709aa3a23a96c7f0dcfbfb9ad2',
    );
  });

  it('builds query strings in insertion order and skips empty values', () => {
    expect(encodeQuery({ product_id: 1, after: undefined, state: 'open', x: '' })).toBe('?product_id=1&state=open');
    expect(encodeQuery({})).toBe('');
  });
});

describe('config', () => {
  it('requires DELTA_ENV', () => {
    expect(() => deltaConfigFromEnv({})).toThrow(/DELTA_ENV/);
    expect(() => deltaConfigFromEnv({ DELTA_ENV: 'prod' })).toThrow(/DELTA_ENV/);
  });

  it('defaults testnet URLs', () => {
    const c = deltaConfigFromEnv({ DELTA_ENV: 'testnet' });
    expect(c.restUrl).toBe('https://cdn-ind.testnet.deltaex.org');
    expect(c.wsUrl).toBe('wss://socket-ind.testnet.deltaex.org');
  });

  it('refuses live without the second switch', () => {
    expect(() => deltaConfigFromEnv({ DELTA_ENV: 'live' })).toThrow(/DELTA_LIVE_ENABLED/);
    expect(deltaConfigFromEnv({ DELTA_ENV: 'live', DELTA_LIVE_ENABLED: 'true' }).restUrl).toBe('https://api.india.delta.exchange');
  });

  it('refuses a testnet env pointed at production hosts', () => {
    expect(() => deltaConfigFromEnv({ DELTA_ENV: 'testnet', DELTA_REST_URL: 'https://api.india.delta.exchange' })).toThrow(/production/);
  });
});

describe('errors', () => {
  it('maps the nested error envelope', () => {
    const e = mapDeltaError(400, { success: false, result: null, error: { code: 'ip_not_whitelisted_for_api_key' } });
    expect(e.code).toBe('IP_NOT_WHITELISTED');
    expect(e.isCredentialProblem).toBe(true);
    expect(mapDeltaError(400, { success: false, result: null, error: { code: 'insufficient_margin' } }).code).toBe('INSUFFICIENT_MARGIN');
    expect(mapDeltaError(400, { success: false, result: null, error: { code: 'less_than_order_min_size' } }).code).toBe('SIZE_TOO_SMALL');
    expect(mapDeltaError(400, { success: false, result: null, error: { code: 'no_position_for_reduce_only' } }).code).toBe('NO_POSITION');
    expect(mapDeltaError(400, { success: false, result: null, error: { code: 'no_liquidity_for_market_order' } }).code).toBe('REJECTED');
    expect(mapDeltaError(401, { success: false, result: null, error: { code: 'invalid_api_key' } }).code).toBe('AUTH');
  });

  it('maps the flat error envelope', () => {
    expect(mapDeltaError(401, { success: false, result: null, error: 'SignatureExpired', message: 'your signature has expired' }).code).toBe('AUTH');
    expect(mapDeltaError(403, { success: false, result: null, error: 'UnauthorizedApiAccess', message: 'Api Key not authorised to access this endpoint' }).code).toBe('PERMISSION');
  });

  it('falls back on HTTP status', () => {
    expect(mapDeltaError(429, null).code).toBe('RATE_LIMIT');
    expect(mapDeltaError(429, null).isTransient).toBe(true);
    expect(mapDeltaError(503, null).code).toBe('UNAVAILABLE');
    expect(mapDeltaError(400, null).code).toBe('REQUEST');
  });

  it('never leaks credentials in messages', () => {
    const e = mapDeltaError(401, { success: false, result: null, error: { code: 'invalid_api_key' } });
    expect(e.message).not.toContain('key-1');
  });
});

describe('order mapping', () => {
  it('builds each order kind', () => {
    const base = { symbol: 'BTCUSD', side: 'BUY' as const, qty: 2, clientOrderId: 'k' };
    expect(deltaOrderBody(84, { ...base, type: 'MARKET' })).toMatchObject({ product_id: 84, size: 2, side: 'buy', order_type: 'market_order', time_in_force: 'ioc', reduce_only: false });
    expect(deltaOrderBody(84, { ...base, type: 'LIMIT', limitPrice: 70000, tif: 'GTC', postOnly: true })).toMatchObject({ order_type: 'limit_order', limit_price: '70000', time_in_force: 'gtc', post_only: true });
    expect(deltaOrderBody(84, { ...base, side: 'SELL', type: 'STOP_MARKET', stopPrice: 65000, reduceOnly: true })).toMatchObject({ order_type: 'market_order', stop_order_type: 'stop_loss_order', stop_price: '65000', reduce_only: true, side: 'sell' });
    expect(deltaOrderBody(84, { ...base, type: 'TAKE_PROFIT_LIMIT', stopPrice: 90000, limitPrice: 89900 })).toMatchObject({ order_type: 'limit_order', stop_order_type: 'take_profit_order' });
  });

  it('rejects fractional sizes, FOK and missing prices before calling Delta', () => {
    const base = { symbol: 'BTCUSD', side: 'BUY' as const, clientOrderId: 'k' };
    expect(() => deltaOrderBody(84, { ...base, qty: 1.5, type: 'MARKET' })).toThrow(ExchangeError);
    expect(() => deltaOrderBody(84, { ...base, qty: 0, type: 'MARKET' })).toThrow(/whole number/);
    expect(() => deltaOrderBody(84, { ...base, qty: 1, type: 'LIMIT', tif: 'FOK', limitPrice: 1 })).toThrow(/fill-or-kill/);
    expect(() => deltaOrderBody(84, { ...base, qty: 1, type: 'LIMIT' })).toThrow(/limit price/);
    expect(() => deltaOrderBody(84, { ...base, qty: 1, type: 'STOP_MARKET' })).toThrow(/trigger price/);
  });

  it('hashes client order ids to at most 32 stable characters', () => {
    const id = deltaClientOrderId('copy:DELTA_INDIA:follow_cuid_very_long:fill-uuid-1234-5678');
    expect(id.length).toBeLessThanOrEqual(32);
    expect(id).toBe(deltaClientOrderId('copy:DELTA_INDIA:follow_cuid_very_long:fill-uuid-1234-5678'));
    expect(id).not.toBe(deltaClientOrderId('copy:DELTA_INDIA:follow_cuid_very_long:fill-uuid-1234-5679'));
  });

  it('maps order states, including a partly filled cancelled IOC', () => {
    expect(mapDeltaOrder({ id: 1, state: 'closed', size: 5, unfilled_size: 0, average_fill_price: '100' })).toMatchObject({ status: 'FILLED', filledQty: 5, avgFillPrice: 100 });
    expect(mapDeltaOrder({ id: 2, state: 'cancelled', size: 5, unfilled_size: 3 })).toMatchObject({ status: 'CANCELLED', filledQty: 2 });
    expect(mapDeltaOrder({ id: 3, state: 'open', size: 5, unfilled_size: 4 })).toMatchObject({ status: 'PARTIAL', filledQty: 1 });
    expect(mapDeltaOrder({ id: 4, state: 'open', size: 5, unfilled_size: 5 }).status).toBe('OPEN');
    expect(mapDeltaOrder({ id: 5, state: 'pending', size: 5, order_type: 'market_order', stop_order_type: 'stop_loss_order' })).toMatchObject({ status: 'PENDING', type: 'STOP_MARKET' });
  });
});

describe('fill feed', () => {
  it('parses the documented v2/user_trades frame', () => {
    const f = parseUserTrade({ type: 'v2/user_trades', sy: 'BTCUSD', f: '1234-abcd', R: 'normal', o: 3283999, S: 'buy', s: 190, p: '17289.2', po: 5, r: 'taker', c: 'GA123', t: 1685794274866438, se: 4 });
    expect(f).toMatchObject({ externalId: '1234-abcd', symbol: 'BTCUSD', side: 'BUY', qty: 190, price: 17289.2, exchangeOrderId: '3283999', clientOrderId: 'GA123', positionAfter: 5 });
    expect(f?.timestamp.toISOString()).toBe('2023-06-03T12:11:14.866Z');
    // Position went from -185 to +5: the buy closed a short (and flipped).
    expect(f?.reduceOnly).toBe(true);
  });

  it('marks opening and adding fills as not reducing', () => {
    expect(parseUserTrade({ type: 'v2/user_trades', sy: 'BTCUSD', f: 'a', S: 'buy', s: 3, p: '1', po: 3, t: 1 })?.reduceOnly).toBe(false);
    expect(parseUserTrade({ type: 'v2/user_trades', sy: 'BTCUSD', f: 'b', S: 'sell', s: 2, p: '1', po: -5, t: 1 })?.reduceOnly).toBe(false);
    expect(parseUserTrade({ type: 'v2/user_trades', sy: 'BTCUSD', f: 'c', S: 'sell', s: 2, p: '1', po: 1, t: 1 })?.reduceOnly).toBe(true);
  });

  it('ignores other frames and malformed fills', () => {
    expect(parseUserTrade({ type: 'orders' })).toBeNull();
    expect(parseUserTrade({ type: 'v2/user_trades', sy: 'BTCUSD', f: 'x', S: 'hold', s: 1 })).toBeNull();
    expect(parseUserTrade({ type: 'v2/user_trades', sy: 'BTCUSD', f: 'x', S: 'buy', s: 0 })).toBeNull();
  });

  it('reads µs, ms, s and ISO timestamps', () => {
    const ms = Date.UTC(2026, 9, 31, 12);
    expect(deltaTime(ms * 1000)?.getTime()).toBe(ms);
    expect(deltaTime(String(ms * 1000))?.getTime()).toBe(ms);
    expect(deltaTime(ms)?.getTime()).toBe(ms);
    expect(deltaTime(ms / 1000)?.getTime()).toBe(ms);
    expect(deltaTime('2026-10-31T12:00:00Z')?.getTime()).toBe(ms);
    expect(deltaTime(null)).toBeNull();
  });
});

// ─── adapter against a fake Delta ───────────────────────────────────────────

const PRODUCTS = [
  { id: 84, symbol: 'BTCUSD', contract_type: 'perpetual_futures', state: 'live', trading_status: 'operational', contract_value: '0.001', contract_unit_currency: 'BTC', tick_size: '0.5', initial_margin: '0.5', quoting_asset: { symbol: 'USD' }, settling_asset: { symbol: 'USD' } },
  { id: 3136, symbol: 'ETHUSD', contract_type: 'perpetual_futures', state: 'live', contract_value: '0.01', contract_unit_currency: 'ETH', tick_size: '0.05', quoting_asset: { symbol: 'USD' } },
  { id: 9001, symbol: 'C-BTC-90000-311026', contract_type: 'call_options', state: 'live', contract_value: '0.001', contract_unit_currency: 'BTC', quoting_asset: { symbol: 'USD' } },
];

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

type Reply = { status?: number; body: unknown };

function fakeDelta(routes: Record<string, (call: Call) => Reply>) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const call: Call = { url, method: init?.method ?? 'GET', headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined };
    calls.push(call);
    const path = url.replace(CFG.restUrl, '').split('?')[0]!;
    const key = `${call.method} ${path}`;
    const handler: ((call: Call) => Reply) | null = routes[key] ?? (path === '/v2/products' ? () => ({ body: { success: true, result: PRODUCTS, meta: { after: null } } }) : null);
    if (!handler) return new Response(JSON.stringify({ success: false, error: { code: 'not_found' } }), { status: 404 });
    const r = handler(call);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  const ex = new DeltaIndiaExchange(CFG, { fetch: fetchImpl, now: () => 1_700_000_000_000 });
  return { ex, calls };
}

describe('DeltaIndiaExchange (fake REST)', () => {
  it('signs requests with all required headers', async () => {
    const { ex, calls } = fakeDelta({ 'GET /v2/wallet/balances': () => ({ body: { success: true, result: [], meta: { net_equity: '10' } } }) });
    await ex.getAccount(CREDS);
    const h = calls[0]!.headers;
    expect(h['api-key']).toBe('key-1');
    expect(h.timestamp).toBe('1700000000');
    expect(h['User-Agent']).toBe('tradelogs/1.0');
    expect(h.signature).toBe(deltaSignature('test-secret', 'GET', '1700000000', '/v2/wallet/balances', '', ''));
  });

  it("prefers Delta's net equity and ignores non-stable assets", async () => {
    const rows = [
      { asset_symbol: 'USD', balance: '1000', available_balance: '800', user_id: 42 },
      { asset_symbol: 'BTC', balance: '2', available_balance: '2', user_id: 42 },
    ];
    const withMeta = fakeDelta({ 'GET /v2/wallet/balances': () => ({ body: { success: true, result: rows, meta: { net_equity: '1234.5' } } }) });
    expect(await withMeta.ex.getAccount(CREDS)).toEqual({ equityUsd: 1234.5, availableUsd: 800, baseCurrency: 'USD', accountRef: '42' });
    const noMeta = fakeDelta({ 'GET /v2/wallet/balances': () => ({ body: { success: true, result: rows } }) });
    expect((await noMeta.ex.getAccount(CREDS)).equityUsd).toBe(1000);
  });

  it('places an order with the looked-up product id and signed body', async () => {
    const { ex, calls } = fakeDelta({
      'POST /v2/orders': (c) => ({ body: { success: true, result: { id: 77, state: 'closed', size: 2, unfilled_size: 0, average_fill_price: '70000', side: 'buy', order_type: 'market_order', ...JSON.parse(c.body!) } } }),
    });
    const o = await ex.placeOrder(CREDS, { symbol: 'BTCUSD', side: 'BUY', qty: 2, type: 'MARKET', clientOrderId: 'copy:1' });
    expect(o).toMatchObject({ exchangeOrderId: '77', status: 'FILLED', filledQty: 2, avgFillPrice: 70000, symbol: 'BTCUSD' });
    const post = calls.find((c) => c.method === 'POST')!;
    expect(JSON.parse(post.body!)).toMatchObject({ product_id: 84, size: 2, client_order_id: deltaClientOrderId('copy:1') });
    expect(post.headers.signature).toBe(deltaSignature('test-secret', 'POST', '1700000000', '/v2/orders', '', post.body!));
  });

  it('throws typed errors from Delta rejections', async () => {
    const { ex } = fakeDelta({ 'POST /v2/orders': () => ({ status: 400, body: { success: false, error: { code: 'insufficient_margin', context: { additional_margin_required: '5' } } } }) });
    await expect(ex.placeOrder(CREDS, { symbol: 'BTCUSD', side: 'BUY', qty: 1, type: 'MARKET', clientOrderId: 'x' })).rejects.toMatchObject({ code: 'INSUFFICIENT_MARGIN' });
  });

  it('rejects unknown symbols without calling the order endpoint', async () => {
    const { ex, calls } = fakeDelta({});
    await expect(ex.placeOrder(CREDS, { symbol: 'NOPEUSD', side: 'BUY', qty: 1, type: 'MARKET', clientOrderId: 'x' })).rejects.toMatchObject({ code: 'INSTRUMENT' });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('returns null for an unknown order', async () => {
    const { ex } = fakeDelta({});
    expect(await ex.getOrder(CREDS, { exchangeOrderId: '999' })).toBeNull();
  });

  it('closes a position with a reduce-only opposite market order', async () => {
    const { ex, calls } = fakeDelta({
      'GET /v2/positions': () => ({ body: { success: true, result: { size: -3, entry_price: '70000' } } }),
      'POST /v2/orders': (c) => ({ body: { success: true, result: { id: 5, state: 'closed', unfilled_size: 0, ...JSON.parse(c.body!) } } }),
    });
    const o = await ex.closePosition(CREDS, 'BTCUSD', 'close:1');
    expect(o?.status).toBe('FILLED');
    expect(JSON.parse(calls.find((c) => c.method === 'POST')!.body!)).toMatchObject({ side: 'buy', size: 3, reduce_only: true });
  });

  it('does nothing when closing a flat position', async () => {
    const { ex, calls } = fakeDelta({ 'GET /v2/positions': () => ({ body: { success: true, result: { size: 0 } } }) });
    expect(await ex.closePosition(CREDS, 'BTCUSD', 'close:1')).toBeNull();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('pages fills back with a cursor and adds contract metadata', async () => {
    let page = 0;
    const { ex, calls } = fakeDelta({
      'GET /v2/fills': () => {
        page++;
        const mk = (i: number) => ({ id: `f${page}-${i}`, side: 'buy', size: '1', price: '100', product_symbol: 'BTCUSD', order_id: '9', commission: '0.01', created_at: '2026-10-31T10:00:00Z' });
        return { body: { success: true, result: [mk(1), mk(2)], meta: { after: page < 3 ? `cur${page}` : null } } };
      },
    });
    const fills = await ex.getFills(CREDS, { limit: 5, since: new Date('2026-10-30T00:00:00Z') });
    expect(fills).toHaveLength(5);
    expect(fills[0]).toMatchObject({ symbol: 'BTCUSD', contractMultiplier: 0.001, baseAsset: 'BTC', fee: 0.01 });
    const fillCalls = calls.filter((c) => c.url.includes('/v2/fills'));
    expect(fillCalls[1]!.url).toContain('after=cur1');
    expect(fillCalls[0]!.url).toContain(`start_time=${Date.parse('2026-10-30T00:00:00Z') * 1000}`);
  });

  it('resolves cross-venue fills to live perpetuals only', async () => {
    const { ex } = fakeDelta({});
    expect((await ex.resolveInstrument({ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT' }))?.symbol).toBe('BTCUSD');
    expect((await ex.resolveInstrument({ symbol: 'ETHUSD' }))?.symbol).toBe('ETHUSD');
    expect(await ex.resolveInstrument({ symbol: 'DOGEUSDT', baseAsset: 'DOGE' })).toBeNull();
    const btc = await ex.getInstrument('BTCUSD');
    expect(btc).toMatchObject({ productId: 84, kind: 'PERPETUAL', contractMultiplier: 0.001, maxLeverage: 200, live: true });
  });
});

// ─── WebSocket against a fake socket ────────────────────────────────────────

class FakeWs implements WsLike {
  static last: FakeWs;
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  private handlers: Record<string, Array<(ev: { data: unknown }) => void>> = {};
  constructor(readonly url: string) {
    FakeWs.last = this;
  }
  addEventListener(type: 'open' | 'close' | 'error', cb: () => void): void;
  addEventListener(type: 'message', cb: (ev: { data: unknown }) => void): void;
  addEventListener(type: string, cb: (ev: { data: unknown }) => void): void {
    (this.handlers[type] ??= []).push(cb);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.readyState = 3;
  }
  emit(type: string, data?: unknown): void {
    if (type === 'open') this.readyState = 1;
    for (const cb of this.handlers[type] ?? []) cb({ data: JSON.stringify(data ?? null) });
  }
}

describe('DeltaIndiaExchange stream (fake WS)', () => {
  afterEach(() => vi.useRealTimers());

  async function open() {
    const { ex } = fakeDelta({});
    const exWs = new DeltaIndiaExchange(CFG, { fetch: (ex as unknown as { rest: { fetchImpl: never } }).rest.fetchImpl, WebSocket: FakeWs, now: () => 1_700_000_000_000 });
    const fills: unknown[] = [];
    const errors: Error[] = [];
    const handle = await exWs.streamFills(CREDS, { onEvent: (f) => fills.push(f), onError: (e) => errors.push(e) });
    return { ws: FakeWs.last, fills, errors, handle };
  }

  it('logs in with key-auth and a numeric timestamp, then subscribes', async () => {
    const { ws } = await open();
    ws.emit('open');
    expect(ws.sent[0]).toEqual({ type: 'key-auth', payload: { 'api-key': 'key-1', timestamp: 1700000000, signature: deltaSignature('test-secret', 'GET', '1700000000', '/live', '', '') } });
    expect(ws.sent).toHaveLength(1);
    ws.emit('message', { type: 'key-auth', success: true, status: 'authenticated' });
    expect(ws.sent[1]).toEqual({ type: 'subscribe', payload: { channels: [{ name: 'v2/user_trades', symbols: ['all'] }] } });
    expect(ws.sent[2]).toEqual({ type: 'enable_heartbeat' });
  });

  it('delivers fills with contract metadata', async () => {
    const { ws, fills } = await open();
    ws.emit('open');
    ws.emit('message', { type: 'key-auth', success: true });
    ws.emit('message', { type: 'heartbeat' });
    ws.emit('message', { type: 'v2/user_trades', sy: 'BTCUSD', f: 'f1', S: 'sell', s: 2, p: '70000', po: -2, t: 1700000000000000 });
    expect(fills).toEqual([expect.objectContaining({ externalId: 'f1', side: 'SELL', qty: 2, contractMultiplier: 0.001, baseAsset: 'BTC', reduceOnly: false })]);
  });

  it('reports a failed login once', async () => {
    const { ws, errors } = await open();
    ws.emit('open');
    ws.emit('message', { type: 'key-auth', success: false, status: 'ip_not_whitelisted' });
    ws.emit('close');
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain('ip_not_whitelisted');
  });

  it('treats 40 s of silence as a dead socket', async () => {
    vi.useFakeTimers();
    const { ws, errors } = await open();
    ws.emit('open');
    ws.emit('message', { type: 'key-auth', success: true });
    vi.advanceTimersByTime(25_000);
    expect(ws.sent.some((m) => m.type === 'ping')).toBe(true);
    vi.advanceTimersByTime(16_000);
    expect(errors.map((e) => e.message)).toEqual(['Delta WS idle timeout']);
  });

  it('stays quiet after the caller closes it', async () => {
    const { ws, errors, handle } = await open();
    ws.emit('open');
    handle.close();
    ws.emit('close');
    expect(errors).toHaveLength(0);
  });
});
