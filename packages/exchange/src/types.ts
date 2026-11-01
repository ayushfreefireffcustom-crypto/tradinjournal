// Exchange-agnostic domain types and the adapter interface. Ported from
// MirrorPip-X (`packages/exchange/src/types.ts`) and extended with order
// management. The engine and API only ever see these shapes; venue details
// stay inside each adapter.

export type Side = 'BUY' | 'SELL';

/** Venues with an adapter. Add a value only when its adapter lands. */
export type ExchangeId = 'DELTA_INDIA';

/** Which side of a venue we talk to. Never inferred: callers must say. */
export type ExchangeEnv = 'testnet' | 'live';

export interface ApiCredentials {
  apiKey: string;
  apiSecret: string;
  /** Some venues (OKX) sign with a third secret. */
  passphrase?: string;
}

export interface AccountInfo {
  /** Account equity in USD (stablecoins counted 1:1). */
  equityUsd: number;
  /** Equity free for new positions, in USD. Null when the venue doesn't say. */
  availableUsd: number | null;
  /** Settlement currency the equity is reported in (e.g. "USD"). */
  baseCurrency: string;
  /**
   * Stable per-venue account id, the same across every API key of one account.
   * Used to stop one exchange account being connected twice. Best-effort.
   */
  accountRef?: string;
}

export interface VerifyResult extends AccountInfo {
  ok: true;
  /** True only when the venue confirmed the key may trade. */
  canTrade: boolean;
}

export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_MARKET' | 'STOP_LIMIT' | 'TAKE_PROFIT_MARKET' | 'TAKE_PROFIT_LIMIT';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK';

export interface PlaceOrderRequest {
  symbol: string;
  side: Side;
  /** Quantity in venue-native units (Delta: whole contracts). */
  qty: number;
  type: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  /**
   * Trailing stop: the trigger follows the price at this distance (in price
   * units, always positive) instead of sitting at a fixed stopPrice.
   */
  trailAmount?: number;
  tif?: TimeInForce;
  reduceOnly?: boolean;
  postOnly?: boolean;
  /**
   * Our idempotency key. Adapters map it to the venue's allowed length and
   * characters deterministically, so a retry with the same key is a duplicate.
   */
  clientOrderId: string;
}

export type OrderStatus = 'OPEN' | 'PARTIAL' | 'FILLED' | 'CANCELLED' | 'REJECTED' | 'PENDING';

export interface OrderInfo {
  exchangeOrderId: string;
  /** The venue-side client id we sent (already mapped). */
  clientOrderId: string | null;
  symbol: string;
  side: Side;
  type: OrderType;
  status: OrderStatus;
  qty: number;
  filledQty: number;
  avgFillPrice: number | null;
  limitPrice: number | null;
  stopPrice: number | null;
  /** Distance a trailing stop follows the price at (positive); null for other orders. */
  trailAmount?: number | null;
  reduceOnly: boolean;
  createdAt: Date | null;
  raw?: unknown;
}

export interface PositionInfo {
  symbol: string;
  /** Signed size in venue units: positive long, negative short. */
  size: number;
  avgEntry: number;
  markPrice: number | null;
  unrealizedPnl: number;
  liquidationPrice: number | null;
  leverage: number | null;
}

/** One execution on an account, from the private stream or fill history. */
export interface FillEvent {
  externalId: string;
  symbol: string;
  side: Side;
  /** Quantity in venue-native units. */
  qty: number;
  price: number;
  reduceOnly: boolean;
  timestamp: Date;
  exchangeOrderId?: string;
  clientOrderId?: string;
  fee?: number;
  /** Signed position size on this symbol right after the fill, when the venue says. */
  positionAfter?: number;
  /** Canonical base asset ("BTC") for cross-venue copy. */
  baseAsset?: string;
  /** Canonical quote asset ("USD", "USDT"). */
  quoteAsset?: string;
  /** Base units per venue qty unit (Delta BTCUSD: 0.001). */
  contractMultiplier?: number;
}

export interface InstrumentInfo {
  symbol: string;
  /** Venue product id, where the venue has one. */
  productId?: number;
  kind: 'PERPETUAL' | 'FUTURE' | 'CALL' | 'PUT' | 'SPOT';
  baseAsset: string;
  quoteAsset: string;
  settleAsset: string;
  /** Base units per venue qty unit. */
  contractMultiplier: number;
  minQty: number;
  qtyStep: number;
  tickSize: number;
  maxLeverage: number | null;
  live: boolean;
}

export interface StreamHandle {
  close(): void;
}

/** A change to the account's own orders or positions, from the private stream. */
export type AccountEvent =
  | { kind: 'order'; action: AccountEventAction; order: OrderInfo }
  /** A closed position arrives with `size` 0. */
  | { kind: 'position'; action: AccountEventAction; position: PositionInfo };
export type AccountEventAction = 'snapshot' | 'create' | 'update' | 'delete';

export interface StreamHandlers<T> {
  onEvent: (event: T) => void;
  /** Transport failure. The caller decides whether and when to reconnect. */
  onError?: (err: Error) => void;
}

export interface FillQuery {
  limit?: number;
  /** Only fills at or after this time. Adapters page until they reach it. */
  since?: Date;
}

/** Contract every venue adapter fulfils. */
export interface Exchange {
  readonly id: ExchangeId;
  readonly env: ExchangeEnv;

  /** Lightweight authenticated read that also proves the key can trade. */
  verify(creds: ApiCredentials): Promise<VerifyResult>;
  getAccount(creds: ApiCredentials): Promise<AccountInfo>;
  getPositions(creds: ApiCredentials): Promise<PositionInfo[]>;
  /** Fills, newest first. */
  getFills(creds: ApiCredentials, query?: FillQuery): Promise<FillEvent[]>;

  listInstruments(): Promise<InstrumentInfo[]>;
  getInstrument(symbol: string): Promise<InstrumentInfo | null>;
  /** The live perpetual matching a fill's canonical base/quote (cross-venue copy). */
  resolveInstrument(fill: Pick<FillEvent, 'symbol' | 'baseAsset' | 'quoteAsset'>): Promise<InstrumentInfo | null>;
  /** Public mark price, no auth. */
  getMarkPrice(symbol: string): Promise<number | null>;

  placeOrder(creds: ApiCredentials, order: PlaceOrderRequest): Promise<OrderInfo>;
  cancelOrder(creds: ApiCredentials, ref: { symbol: string; exchangeOrderId: string }): Promise<OrderInfo>;
  getOrder(creds: ApiCredentials, ref: { exchangeOrderId?: string; clientOrderId?: string }): Promise<OrderInfo | null>;
  getOpenOrders(creds: ApiCredentials, symbol?: string): Promise<OrderInfo[]>;
  setLeverage(creds: ApiCredentials, symbol: string, leverage: number): Promise<number>;
  /** The leverage the account uses for a symbol now, where the venue reports it. */
  getLeverage?(creds: ApiCredentials, symbol: string): Promise<number | null>;
  /** Market-close the whole position (reduce-only). Null when already flat. */
  closePosition(creds: ApiCredentials, symbol: string, clientOrderId: string): Promise<OrderInfo | null>;

  /** Authenticated stream of the account's own fills. */
  streamFills(creds: ApiCredentials, handlers: StreamHandlers<FillEvent>): Promise<StreamHandle>;
  /** Authenticated stream of order and position changes, starting with a snapshot where the venue sends one. */
  streamAccount?(creds: ApiCredentials, handlers: StreamHandlers<AccountEvent>): Promise<StreamHandle>;
}
