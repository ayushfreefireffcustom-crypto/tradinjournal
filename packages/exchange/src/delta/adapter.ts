// Delta Exchange India adapter. Ported from MirrorPip-X `delta.ts`, extended
// with limit/stop orders, cancel, order lookup, leverage and close, and fixed
// where the port notes (reports/mpx-port-notes.md, section 4) found gaps.
// API reference: reports/exchange-api-delta.md.

import { createHash } from 'node:crypto';
import { ExchangeError } from '../errors.js';
import type {
  AccountEvent,
  AccountEventAction,
  AccountInfo,
  ApiCredentials,
  Exchange,
  FillEvent,
  FillQuery,
  InstrumentInfo,
  OrderInfo,
  OrderStatus,
  OrderType,
  PlaceOrderRequest,
  PositionInfo,
  Side,
  StreamHandle,
  StreamHandlers,
  VerifyResult,
} from '../types.js';
import type { DeltaConfig } from './config.js';
import { DeltaRest, type FetchFn } from './rest.js';
import { openPrivateStream, type WsCtor } from './ws.js';

// ─── venue shapes ───────────────────────────────────────────────────────────

interface DeltaProduct {
  id: number;
  symbol: string;
  contract_type?: string;
  state?: string;
  trading_status?: string;
  contract_value?: string;
  contract_unit_currency?: string;
  tick_size?: string;
  initial_margin?: string;
  quoting_asset?: { symbol?: string };
  settling_asset?: { symbol?: string };
}

interface DeltaBalance {
  asset_symbol?: string;
  balance?: string;
  available_balance?: string;
  user_id?: number | string;
}

interface DeltaPosition {
  product_id?: number;
  product_symbol?: string;
  /** WS frames use `symbol`; REST uses `product_symbol`. */
  symbol?: string;
  size?: number | string;
  entry_price?: string;
  mark_price?: string;
  unrealized_pnl?: string;
  liquidation_price?: string;
}

export interface DeltaOrder {
  id?: number | string;
  client_order_id?: string | null;
  product_symbol?: string;
  symbol?: string;
  product_id?: number;
  side?: string;
  order_type?: string;
  stop_order_type?: string | null;
  size?: number | string;
  unfilled_size?: number | string;
  average_fill_price?: string | null;
  limit_price?: string | null;
  stop_price?: string | null;
  reduce_only?: boolean | string;
  state?: string;
  created_at?: string;
}

interface DeltaFill {
  id?: string;
  side?: string;
  size?: number | string;
  price?: string;
  product_symbol?: string;
  order_id?: string | number;
  commission?: string;
  created_at?: string;
  meta_data?: { order_size?: unknown; new_position?: unknown } & Record<string, unknown>;
}

// ─── pure helpers (exported for tests) ──────────────────────────────────────

export function num(v: unknown, fallback = 0): number {
  if (v === undefined || v === null || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Delta timestamps arrive as ISO strings or microsecond numbers/strings. */
export function deltaTime(v: unknown): Date | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'string' && /[-T:]/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  // µs (16 digits) vs ms (13) vs s (10).
  return new Date(n > 1e14 ? n / 1000 : n > 1e11 ? n : n * 1000);
}

/**
 * Delta allows at most 32 characters, unique only among open orders, so our
 * (longer) idempotency key is hashed deterministically. The DB claim on our
 * side remains the real idempotency guard.
 */
export function deltaClientOrderId(ourKey: string): string {
  return `tl_${createHash('sha256').update(ourKey).digest('hex').slice(0, 28)}`;
}

export function deltaOrderBody(productId: number, o: PlaceOrderRequest): Record<string, unknown> {
  const size = o.qty;
  if (!Number.isInteger(size) || size <= 0) {
    throw new ExchangeError('SIZE_TOO_SMALL', 'Delta orders must be a whole number of contracts (at least 1).');
  }
  if (o.tif === 'FOK') throw new ExchangeError('REQUEST', 'Delta no longer supports fill-or-kill orders.');
  const isLimit = o.type === 'LIMIT' || o.type === 'STOP_LIMIT' || o.type === 'TAKE_PROFIT_LIMIT';
  const stopKind = o.type.startsWith('STOP') ? 'stop_loss_order' : o.type.startsWith('TAKE_PROFIT') ? 'take_profit_order' : null;
  if (isLimit && !(o.limitPrice && o.limitPrice > 0)) throw new ExchangeError('REQUEST', 'A limit order needs a limit price.');
  if (stopKind && !(o.stopPrice && o.stopPrice > 0)) throw new ExchangeError('REQUEST', 'A stop or take-profit order needs a trigger price.');
  const body: Record<string, unknown> = {
    product_id: productId,
    size,
    side: o.side === 'BUY' ? 'buy' : 'sell',
    order_type: isLimit ? 'limit_order' : 'market_order',
    reduce_only: o.reduceOnly ?? false,
    client_order_id: deltaClientOrderId(o.clientOrderId),
  };
  if (isLimit) body.limit_price = String(o.limitPrice);
  if (stopKind) {
    body.stop_order_type = stopKind;
    body.stop_price = String(o.stopPrice);
  }
  if (o.type === 'MARKET') body.time_in_force = 'ioc';
  else if (o.tif) body.time_in_force = o.tif.toLowerCase();
  if (o.postOnly) body.post_only = true;
  return body;
}

function orderType(o: DeltaOrder): OrderType {
  const limit = o.order_type === 'limit_order';
  if (o.stop_order_type === 'stop_loss_order') return limit ? 'STOP_LIMIT' : 'STOP_MARKET';
  if (o.stop_order_type === 'take_profit_order') return limit ? 'TAKE_PROFIT_LIMIT' : 'TAKE_PROFIT_MARKET';
  return limit ? 'LIMIT' : 'MARKET';
}

/**
 * Delta states: open | pending (untriggered stop) | closed (fully filled) |
 * cancelled. A cancelled order may still have filled partly (an IOC market
 * order on a thin book): read `filledQty`, never assume zero.
 */
export function mapDeltaOrder(o: DeltaOrder): OrderInfo {
  const qty = num(o.size);
  const filledQty = Math.max(0, qty - num(o.unfilled_size, qty));
  let status: OrderStatus;
  switch (o.state) {
    case 'closed':
      status = 'FILLED';
      break;
    case 'cancelled':
      status = 'CANCELLED';
      break;
    case 'pending':
      status = 'PENDING';
      break;
    default:
      status = filledQty > 0 ? 'PARTIAL' : 'OPEN';
  }
  return {
    exchangeOrderId: String(o.id ?? ''),
    clientOrderId: o.client_order_id ?? null,
    symbol: o.product_symbol ?? o.symbol ?? '',
    side: String(o.side).toLowerCase() === 'sell' ? 'SELL' : 'BUY',
    type: orderType(o),
    status,
    qty,
    filledQty,
    avgFillPrice: o.average_fill_price ? num(o.average_fill_price) : null,
    limitPrice: o.limit_price ? num(o.limit_price) : null,
    stopPrice: o.stop_price ? num(o.stop_price) : null,
    reduceOnly: o.reduce_only === true || o.reduce_only === 'true',
    createdAt: deltaTime(o.created_at),
    raw: o,
  };
}

function productMeta(p?: DeltaProduct): Pick<FillEvent, 'baseAsset' | 'quoteAsset' | 'contractMultiplier'> {
  if (!p) return {};
  return { baseAsset: p.contract_unit_currency, quoteAsset: p.quoting_asset?.symbol, contractMultiplier: num(p.contract_value, 1) };
}

/** Parse a `v2/user_trades` frame (compact keys). Null for anything else. */
export function parseUserTrade(msg: Record<string, unknown>): Omit<FillEvent, 'baseAsset' | 'quoteAsset' | 'contractMultiplier'> | null {
  if (msg.type !== 'v2/user_trades') return null;
  const side = String(msg.S ?? '').toUpperCase();
  const qty = num(msg.s);
  if (!msg.f || !msg.sy || (side !== 'BUY' && side !== 'SELL') || qty <= 0) return null;
  // `po` is the signed position after the fill. The fill reduced the position
  // when it moved toward zero (a flip counts as a reduction of the old side).
  const after = msg.po != null && Number.isFinite(Number(msg.po)) ? Number(msg.po) : undefined;
  const before = after != null ? after - (side === 'BUY' ? qty : -qty) : undefined;
  const reduceOnly = after != null && before != null && before !== 0 && Math.sign(before) !== Math.sign(side === 'BUY' ? qty : -qty);
  return {
    externalId: String(msg.f),
    symbol: String(msg.sy),
    side: side as Side,
    qty,
    price: num(msg.p),
    reduceOnly,
    positionAfter: after,
    timestamp: deltaTime(msg.t) ?? new Date(),
    exchangeOrderId: msg.o != null ? String(msg.o) : undefined,
    clientOrderId: msg.c != null ? String(msg.c) : undefined,
  };
}

const ACTIONS = new Set<AccountEventAction>(['snapshot', 'create', 'update', 'delete']);

function mapDeltaPosition(p: DeltaPosition, closed: boolean): PositionInfo | null {
  const symbol = p.product_symbol ?? p.symbol;
  if (!symbol) return null;
  return {
    symbol: String(symbol),
    size: closed ? 0 : num(p.size),
    avgEntry: num(p.entry_price),
    markPrice: p.mark_price ? num(p.mark_price) : null,
    unrealizedPnl: num(p.unrealized_pnl),
    liquidationPrice: p.liquidation_price ? num(p.liquidation_price) : null,
    leverage: null,
  };
}

/**
 * Parse an `orders` or `positions` frame. A snapshot carries every row in
 * `result`; create/update/delete carry one row inline. Anything else is [].
 */
export function parseAccountMessage(msg: Record<string, unknown>): AccountEvent[] {
  if (msg.type !== 'orders' && msg.type !== 'positions') return [];
  const action = String(msg.action ?? '') as AccountEventAction;
  if (!ACTIONS.has(action)) return [];
  const rows = action === 'snapshot' ? (Array.isArray(msg.result) ? (msg.result as Record<string, unknown>[]) : []) : [msg];
  const out: AccountEvent[] = [];
  for (const row of rows) {
    if (msg.type === 'orders') {
      const order = mapDeltaOrder(row as DeltaOrder);
      if (order.exchangeOrderId && order.symbol) out.push({ kind: 'order', action, order });
    } else {
      const position = mapDeltaPosition(row as DeltaPosition, action === 'delete');
      if (position) out.push({ kind: 'position', action, position });
    }
  }
  return out;
}

const STABLES = new Set(['USD', 'USDT', 'USDC']);

// ─── adapter ────────────────────────────────────────────────────────────────

export interface DeltaDeps {
  fetch?: FetchFn;
  WebSocket?: WsCtor;
  now?: () => number;
}

export class DeltaIndiaExchange implements Exchange {
  readonly id = 'DELTA_INDIA' as const;
  readonly env;
  private readonly rest: DeltaRest;
  private products: { at: number; bySymbol: Map<string, DeltaProduct> } | null = null;
  private static readonly PRODUCT_TTL_MS = 10 * 60_000;

  constructor(
    private readonly cfg: DeltaConfig,
    private readonly deps: DeltaDeps = {},
  ) {
    this.env = cfg.env;
    this.rest = new DeltaRest(cfg, deps.fetch, deps.now);
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  // Product ids differ between testnet and live, so they're always looked up.
  private async productMap(): Promise<Map<string, DeltaProduct>> {
    if (this.products && this.now() - this.products.at < DeltaIndiaExchange.PRODUCT_TTL_MS) return this.products.bySymbol;
    const bySymbol = new Map<string, DeltaProduct>();
    let after: string | undefined;
    for (let page = 0; page < 20; page++) {
      const env = await this.rest.publicGet<DeltaProduct[]>('/v2/products', { page_size: 500, after });
      for (const p of env.result) bySymbol.set(p.symbol, p);
      after = (env.meta?.after as string | null | undefined) ?? undefined;
      if (!after) break;
    }
    this.products = { at: this.now(), bySymbol };
    return bySymbol;
  }

  private async product(symbol: string): Promise<DeltaProduct> {
    const p = (await this.productMap()).get(symbol);
    if (!p) throw new ExchangeError('INSTRUMENT', `Delta does not list ${symbol}.`);
    return p;
  }

  private toInstrument(p: DeltaProduct): InstrumentInfo {
    const kind: InstrumentInfo['kind'] =
      p.contract_type === 'perpetual_futures' ? 'PERPETUAL'
      : p.contract_type === 'call_options' ? 'CALL'
      : p.contract_type === 'put_options' ? 'PUT'
      : p.contract_type === 'spot' ? 'SPOT'
      : 'FUTURE';
    const im = num(p.initial_margin);
    return {
      symbol: p.symbol,
      productId: p.id,
      kind,
      baseAsset: p.contract_unit_currency ?? p.symbol.replace(/USDT?$/, ''),
      quoteAsset: p.quoting_asset?.symbol ?? 'USD',
      settleAsset: p.settling_asset?.symbol ?? 'USD',
      contractMultiplier: num(p.contract_value, 1),
      minQty: 1,
      qtyStep: 1,
      tickSize: num(p.tick_size, 0),
      // Inferred from initial margin %, per the Delta research (unconfirmed).
      maxLeverage: im > 0 ? Math.floor(100 / im) : null,
      live: p.state === 'live' && (p.trading_status ?? 'operational') === 'operational',
    };
  }

  async listInstruments(): Promise<InstrumentInfo[]> {
    return [...(await this.productMap()).values()].map((p) => this.toInstrument(p));
  }

  async getInstrument(symbol: string): Promise<InstrumentInfo | null> {
    const p = (await this.productMap()).get(symbol);
    return p ? this.toInstrument(p) : null;
  }

  async resolveInstrument(fill: Pick<FillEvent, 'symbol' | 'baseAsset' | 'quoteAsset'>): Promise<InstrumentInfo | null> {
    const all = await this.listInstruments();
    const direct = all.find((i) => i.symbol === fill.symbol);
    if (direct && !fill.baseAsset) return direct;
    if (!fill.baseAsset) return null;
    const base = fill.baseAsset.toUpperCase();
    const perps = all.filter((i) => i.kind === 'PERPETUAL' && i.live && i.baseAsset.toUpperCase() === base);
    return perps.find((i) => i.quoteAsset.toUpperCase() === fill.quoteAsset?.toUpperCase()) ?? perps[0] ?? null;
  }

  async getMarkPrice(symbol: string): Promise<number | null> {
    try {
      const t = await this.rest.publicGet<{ mark_price?: string; close?: number | string }>(`/v2/tickers/${encodeURIComponent(symbol)}`);
      const price = num(t.result.mark_price, num(t.result.close, NaN));
      return Number.isFinite(price) ? price : null;
    } catch {
      return null;
    }
  }

  async getAccount(creds: ApiCredentials): Promise<AccountInfo> {
    const env = await this.rest.signed<DeltaBalance[]>(creds, 'GET', '/v2/wallet/balances');
    const rows = env.result ?? [];
    // MirrorPip-X summed `balance` across every asset (gap G5). Use Delta's own
    // net equity when given; otherwise count stablecoin rows only.
    const stable = rows.filter((b) => STABLES.has(String(b.asset_symbol ?? '').toUpperCase()));
    const netEquity = num(env.meta?.net_equity, NaN);
    const equityUsd = Number.isFinite(netEquity) ? netEquity : stable.reduce((s, b) => s + num(b.balance), 0);
    const availableUsd = stable.length ? stable.reduce((s, b) => s + num(b.available_balance), 0) : null;
    const uid = rows.map((b) => b.user_id).find((v) => v != null && String(v).trim() !== '');
    return { equityUsd, availableUsd, baseCurrency: 'USD', accountRef: uid != null ? String(uid) : undefined };
  }

  async verify(creds: ApiCredentials): Promise<VerifyResult> {
    // Delta documents orders, positions and wallets as needing the Trading
    // permission, and trading keys must have an IP whitelist. Listing open
    // orders proves trading scope without placing or cancelling anything.
    const account = await this.getAccount(creds);
    await this.rest.signed<DeltaOrder[]>(creds, 'GET', '/v2/orders', { query: { states: 'open', page_size: 1 } });
    return { ok: true, canTrade: true, ...account };
  }

  async getPositions(creds: ApiCredentials): Promise<PositionInfo[]> {
    const env = await this.rest.signed<DeltaPosition[]>(creds, 'GET', '/v2/positions/margined');
    return (env.result ?? [])
      .filter((p) => p.product_symbol && num(p.size) !== 0)
      .map((p) => mapDeltaPosition(p, false)!);
  }

  /** Real-time signed size for one product (`/positions/margined` lags up to ~10 s). */
  async getPositionSize(creds: ApiCredentials, symbol: string): Promise<number> {
    const p = await this.product(symbol);
    const env = await this.rest.signed<{ size?: number | string } | null>(creds, 'GET', '/v2/positions', { query: { product_id: p.id } });
    return num(env.result?.size);
  }

  async getFills(creds: ApiCredentials, query: FillQuery = {}): Promise<FillEvent[]> {
    const limit = Math.max(1, Math.min(query.limit ?? 50, 1000));
    const products = await this.productMap().catch(() => new Map<string, DeltaProduct>());
    const out: FillEvent[] = [];
    let after: string | undefined;
    // Page back until we have enough or pass `since` (MirrorPip-X stopped at 50: gap G9).
    for (let page = 0; page < 40 && out.length < limit; page++) {
      const env = await this.rest.signed<DeltaFill[]>(creds, 'GET', '/v2/fills', {
        query: {
          page_size: 50,
          after,
          start_time: query.since ? query.since.getTime() * 1000 : undefined,
        },
      });
      for (const f of env.result ?? []) {
        const side = String(f.side ?? '').toUpperCase();
        const qty = num(f.size);
        if (!f.id || !f.product_symbol || (side !== 'BUY' && side !== 'SELL') || qty <= 0) continue;
        // Signed position after the fill, when Delta includes it; it lets a history rebuild spot
        // positions that were already open before the window it read.
        const np = f.meta_data?.new_position;
        const positionAfter = np != null && np !== '' && Number.isFinite(Number(np)) ? Number(np) : undefined;
        out.push({
          externalId: String(f.id),
          symbol: f.product_symbol,
          side: side as Side,
          qty,
          price: num(f.price),
          reduceOnly: false,
          timestamp: deltaTime(f.created_at) ?? new Date(0),
          exchangeOrderId: f.order_id != null ? String(f.order_id) : undefined,
          fee: f.commission != null ? num(f.commission) : undefined,
          positionAfter,
          ...productMeta(products.get(f.product_symbol)),
        });
        if (out.length >= limit) break;
      }
      after = (env.meta?.after as string | null | undefined) ?? undefined;
      if (!after) break;
    }
    return out;
  }

  async placeOrder(creds: ApiCredentials, order: PlaceOrderRequest): Promise<OrderInfo> {
    const p = await this.product(order.symbol);
    const env = await this.rest.signed<DeltaOrder>(creds, 'POST', '/v2/orders', { body: deltaOrderBody(p.id, order) });
    return mapDeltaOrder({ product_symbol: order.symbol, ...env.result });
  }

  async cancelOrder(creds: ApiCredentials, ref: { symbol: string; exchangeOrderId: string }): Promise<OrderInfo> {
    const p = await this.product(ref.symbol);
    const env = await this.rest.signed<DeltaOrder>(creds, 'DELETE', '/v2/orders', { body: { id: Number(ref.exchangeOrderId), product_id: p.id } });
    return mapDeltaOrder({ product_symbol: ref.symbol, ...env.result });
  }

  async getOrder(creds: ApiCredentials, ref: { exchangeOrderId?: string; clientOrderId?: string }): Promise<OrderInfo | null> {
    const path = ref.exchangeOrderId
      ? `/v2/orders/${encodeURIComponent(ref.exchangeOrderId)}`
      : ref.clientOrderId
        ? `/v2/orders/client_order_id/${encodeURIComponent(deltaClientOrderId(ref.clientOrderId))}`
        : null;
    if (!path) return null;
    try {
      return mapDeltaOrder((await this.rest.signed<DeltaOrder>(creds, 'GET', path)).result);
    } catch (err) {
      if (err instanceof ExchangeError && err.code === 'ORDER_NOT_FOUND') return null;
      throw err;
    }
  }

  async getOpenOrders(creds: ApiCredentials, symbol?: string): Promise<OrderInfo[]> {
    const productId = symbol ? (await this.product(symbol)).id : undefined;
    const env = await this.rest.signed<DeltaOrder[]>(creds, 'GET', '/v2/orders', {
      query: { product_ids: productId, states: 'open,pending', page_size: 50 },
    });
    return (env.result ?? []).map(mapDeltaOrder);
  }

  async getLeverage(creds: ApiCredentials, symbol: string): Promise<number | null> {
    const p = await this.product(symbol);
    const env = await this.rest.signed<{ leverage?: string | number }>(creds, 'GET', `/v2/products/${p.id}/orders/leverage`);
    const v = Number(env.result?.leverage);
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  async setLeverage(creds: ApiCredentials, symbol: string, leverage: number): Promise<number> {
    if (!(leverage > 0)) throw new ExchangeError('REQUEST', 'Leverage must be above zero.');
    const p = await this.product(symbol);
    const env = await this.rest.signed<{ leverage?: string | number }>(creds, 'POST', `/v2/products/${p.id}/orders/leverage`, {
      body: { leverage: String(leverage) },
    });
    return num(env.result?.leverage, leverage);
  }

  async closePosition(creds: ApiCredentials, symbol: string, clientOrderId: string): Promise<OrderInfo | null> {
    // Delta has no single-position close: send an opposite reduce-only market
    // order for the real-time size.
    const size = await this.getPositionSize(creds, symbol);
    if (size === 0) return null;
    return this.placeOrder(creds, {
      symbol,
      side: size > 0 ? 'SELL' : 'BUY',
      qty: Math.abs(size),
      type: 'MARKET',
      reduceOnly: true,
      clientOrderId,
    });
  }

  async streamFills(creds: ApiCredentials, handlers: StreamHandlers<FillEvent>): Promise<StreamHandle> {
    const WS = this.deps.WebSocket ?? (globalThis as unknown as { WebSocket?: WsCtor }).WebSocket;
    if (!WS) throw new ExchangeError('UNAVAILABLE', 'No WebSocket implementation in this runtime.');
    const products = await this.productMap();
    return openPrivateStream(
      this.cfg,
      creds,
      {
        channels: [{ name: 'v2/user_trades', symbols: ['all'] }],
        onMessage: (msg) => {
          const fill = parseUserTrade(msg);
          if (fill) handlers.onEvent({ ...fill, ...productMeta(products.get(fill.symbol)) });
        },
        onError: handlers.onError,
      },
      WS,
      this.deps.now,
    );
  }

  async streamAccount(creds: ApiCredentials, handlers: StreamHandlers<AccountEvent>): Promise<StreamHandle> {
    const WS = this.deps.WebSocket ?? (globalThis as unknown as { WebSocket?: WsCtor }).WebSocket;
    if (!WS) throw new ExchangeError('UNAVAILABLE', 'No WebSocket implementation in this runtime.');
    return openPrivateStream(
      this.cfg,
      creds,
      {
        channels: [{ name: 'orders', symbols: ['all'] }, { name: 'positions', symbols: ['all'] }],
        onMessage: (msg) => {
          for (const ev of parseAccountMessage(msg)) handlers.onEvent(ev);
        },
        onError: handlers.onError,
      },
      WS,
      this.deps.now,
    );
  }
}
