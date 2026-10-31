# Exchange API research: Binance USDⓈ-M, Bybit v5 linear, OKX v5 SWAP (TODO B0.5–B0.7)

Researched 2026-10-31. This is documentation research only: no keys were created and no orders were placed.

**Legend**
- **[doc]**: confirmed on the official docs page cited in that section.
- **[verify]**: from general knowledge, third-party sources, or a docs page that only partly rendered. Check it on the live docs before writing code against it.

**Official doc roots**
- Binance USDⓈ-M: https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info
- Bybit v5: https://bybit-exchange.github.io/docs/v5/guide
- OKX v5: https://www.okx.com/docs-v5/en/ (one ~400 KB page; the fetcher truncated the trade and WebSocket-channel sections, so several OKX items below are marked [verify])

---

## 1. Binance USDⓈ-M Futures (B0.5)

### 1.1 Endpoints
| Item | Production | Testnet |
|---|---|---|
| REST | `https://fapi.binance.com` [doc] | `https://demo-fapi.binance.com` [doc, general-info]. The legacy `https://testnet.binancefuture.com` is still listed on the User Data Streams page [doc]. |
| Market WS | `wss://fstream.binance.com/public/ws/<stream>`, `/public/stream?streams=` [doc] | `wss://stream.binancefuture.com` (market-streams page) and `wss://demo-fstream.binance.com` (general-info) [doc]. The two pages disagree: test both. |
| User-data WS | `wss://fstream.binance.com/private/ws/<listenKey>` [doc] | `wss://demo-fstream.binance.com/private/ws/<listenKey>` [verify] |
| WS API (order entry) | `wss://ws-fapi.binance.com/ws-fapi/v1` [verify] | `wss://testnet.binancefuture.com/ws-fapi/v1` [verify] |

Sources:
- https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams
- https://developers.binance.com/en/docs/products/derivatives-trading-usds-futures/user-data-streams

### 1.2 Auth
| Item | Detail |
|---|---|
| Signing | HMAC-SHA256 of the query string or body, using the secret key. RSA (PKCS#8, RSASSA-PKCS1-v1_5 SHA-256, base64 then URL-encoded) is also supported. The `signature` param goes last [doc]. Ed25519 keys are supported on the Binance account side [verify for fapi]. |
| Headers | `X-MBX-APIKEY` [doc] |
| Timestamp | `timestamp` in ms is required. The request is accepted only if `timestamp < serverTime + 1000` and `serverTime - timestamp <= recvWindow`. `recvWindow` defaults to 5000; userTrades documents a max of 60000 [doc]. |
| Permissions | `enableReading`, `enableFutures`, `enableWithdrawals`, `enableInternalTransfer`, `ipRestrict`, and others. `enableFutures` is false if the key was created before the Futures account was opened [doc]. Source: https://developers.binance.com/docs/wallet/endpoints/api-key-permission |
| IP whitelist | IP restriction is required to enable withdrawals [doc]. Third-party sources say unrestricted keys with trading permission lose trading rights or are removed after 90 days, but they disagree on which [verify on Binance API-management UI or FAQ]. A user report says whitelists take single IPs, with no CIDR [verify]. |
| Key expiry | Covered by the 90-day IP rule above [verify]. IP-restricted keys do not expire [verify]. |

### 1.3 Instrument metadata: `GET /fapi/v1/exchangeInfo`
| Concept | Field |
|---|---|
| Tick size | `filters[PRICE_FILTER].tickSize` [doc] |
| Lot step / min qty | `filters[LOT_SIZE].stepSize`, `.minQty`, `.maxQty`. Market orders use `MARKET_LOT_SIZE` [verify; the page was truncated]. |
| Min notional | `filters[MIN_NOTIONAL].notional`. The example shows 5.0 [doc example; filter name per legacy docs]. |
| Precision | `pricePrecision` and `quantityPrecision`. The docs say not to use them as tick or step size [doc]. |
| Contract multiplier | None. Qty is in base coin (BTC for BTCUSDT) [doc: userTrades `qty`, `quoteQty`]. |
| Other | `contractType` (PERPETUAL), `marginAsset`, `triggerProtect`, `orderTypes`, `timeInForce`. The `rateLimits` array includes REQUEST_WEIGHT 2400 per minute [doc]. |

Source: https://developers.binance.com/docs/derivatives/usds-margined-futures/market-data/rest-api/Exchange-Information

### 1.4 Orders
| Feature | Endpoint / param |
|---|---|
| New order | `POST /fapi/v1/order`. Types: LIMIT, MARKET, plus the conditional types below. TIF: GTC, IOC, FOK, GTX (post-only), GTD, RPI. Other params: `priceMatch`, `selfTradePreventionMode`. `newOrderRespType` is ACK (default) or RESULT [doc]. |
| **Conditional orders (breaking change)** | Since **2025-12-09**, STOP, STOP_MARKET, TAKE_PROFIT, TAKE_PROFIT_MARKET and TRAILING_STOP_MARKET are placed through the Algo Service: `POST /fapi/v1/algoOrder`, `DELETE /fapi/v1/algoOrder`, `DELETE /fapi/v1/algoOpenOrders`, plus query endpoints [doc changelog 2025-11-18]. The old `/fapi/v1/order` returns `-4120` for these types (Nautilus issue #3287). The WS stream gains an `ALGO_UPDATE` event, and `CONDITIONAL_ORDER_TRIGGER_REJECT` is deprecated from 2025-12-15. The algo client id field is `clientAlgoId` [verify]. |
| Trigger params | `workingType` is MARK_PRICE or CONTRACT_PRICE (default CONTRACT_PRICE). Also `priceProtect` [doc, algo order]. |
| TP/SL on position | `closePosition=true` with STOP_MARKET or TAKE_PROFIT_MARKET. It cannot be combined with `quantity` or `reduceOnly` [doc]. Binance has no position-level TP/SL field: TP/SL are separate algo orders. |
| Trailing stop | TRAILING_STOP_MARKET with `callbackRate` 0.1–20 (%) and `activatePrice` [doc] |
| Reduce-only | `reduceOnly=true`. It cannot be sent in Hedge mode, where `positionSide` implies the intent [doc]. |
| Client order id | `newClientOrderId`, regex `^[\.A-Z\:/a-z0-9_-]{1,36}$`, unique among **open** orders [doc]. Liquidations use the prefix `autoclose-` and ADL uses `adl_autoclose` [doc]. |
| Cancel | `DELETE /fapi/v1/order` (orderId or origClientOrderId), `DELETE /fapi/v1/allOpenOrders`, `DELETE /fapi/v1/batchOrders` [verify] |
| Amend | `PUT /fapi/v1/order`: LIMIT orders only, price and quantity. The WS stream reports execution type `AMENDMENT` [AMENDMENT doc, rest verify]. |
| Batch | `POST /fapi/v1/batchOrders`, max 5 orders [verify] |

Sources:
- https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api
- https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/New-Algo-Order
- https://developers.binance.com/legacy-docs/derivatives/change-log
- https://github.com/nautechsystems/nautilus_trader/issues/3287

### 1.5 Positions
| Item | Detail |
|---|---|
| Mode | One-way (`positionSide=BOTH`) or Hedge (`LONG`/`SHORT`). Switch with `POST /fapi/v1/positionSide/dual` (`dualSidePosition`). This is account-wide across all symbols and needs no open positions or orders [mode doc, endpoint verify]. |
| Leverage | `POST /fapi/v1/leverage` (`symbol`, `leverage`), per symbol [verify] |
| Margin mode | `POST /fapi/v1/marginType` (`ISOLATED` or `CROSSED`), per symbol [verify]. Multi-Assets mode is separate. |
| Close position | No dedicated endpoint. Send an opposite MARKET order with `reduceOnly=true` (one-way) or matching `positionSide` (hedge). `closePosition=true` applies only to conditional orders. |
| Read | `GET /fapi/v3/positionRisk`, `GET /fapi/v3/account` [verify] |

### 1.6 Fills / history
| Endpoint | Rules |
|---|---|
| `GET /fapi/v1/userTrades` (weight 5) | `symbol` is **required**. `limit` defaults to 500, max 1000. With no times, it returns the last 7 days. The `startTime`–`endTime` span is ≤ 7 days. `fromId` cannot be combined with times. Only the **past 3 months** can be queried [doc]. |
| Fields | `id, orderId, symbol, side, positionSide, price, qty, quoteQty, realizedPnl, commission, commissionAsset, maker, buyer, time` [doc] |
| Older data | `GET /fapi/v1/income` and async download endpoints [verify] |

Implication: backfill must loop per symbol in 7-day windows, and nothing older than 90 days is reachable through this endpoint.

Source: https://developers.binance.com/docs/derivatives/usds-margined-futures/trade/rest-api/Account-Trade-List

### 1.7 Private WebSocket
| Item | Detail |
|---|---|
| listenKey | `POST /fapi/v1/listenKey` creates one, or returns the existing one and extends it. `PUT` keeps it alive (+60 min). `DELETE` closes it. The key lasts 60 minutes without a keepalive. On error `-1125`, recreate it with POST [doc]. |
| Lifetime | Connections drop at **24 h** [doc] |
| Ping/pong | The server pings every 3 min and disconnects if no pong arrives within 10 min [verify] |
| Events | `ORDER_TRADE_UPDATE`, `TRADE_LITE` (faster, TRADE only, fewer fields), `ACCOUNT_UPDATE` (balances and positions), `ALGO_UPDATE`, `ACCOUNT_CONFIG_UPDATE` (leverage), `MARGIN_CALL`, `listenKeyExpired`, `STRATEGY_UPDATE`, `CONDITIONAL_ORDER_TRIGGER_REJECT` (deprecated) [doc]. Order events by `E` [doc]. |
| Exec types / status | `x`: NEW, CANCELED, CALCULATED, EXPIRED, TRADE, AMENDMENT. `X`: NEW, PARTIALLY_FILLED, FILLED, CANCELED, EXPIRED, EXPIRED_IN_MATCH [doc] |

**Fill event fields: `ORDER_TRADE_UPDATE.o`.** The enum values above are [doc]. The field keys are [verify]; the payload table did not render:

| Key | Meaning |
|---|---|
| `s` | symbol |
| `c` | clientOrderId |
| `S` | side |
| `o` | order type |
| `f` | TIF |
| `q` | orig qty |
| `p` | price |
| `ap` | avg price |
| `sp` | stop price |
| `x` | exec type |
| `X` | status |
| `i` | orderId |
| `l` | **last filled qty** |
| `z` | cumulative filled qty |
| `L` | **last filled price** |
| `N` | commission asset |
| `n` | commission |
| `T` | trade time |
| `t` | **tradeId** |
| `m` | is maker |
| `R` | reduceOnly |
| `ps` | positionSide |
| `cp` | closePosition |
| `rp` | realized PnL |
| `wt` | workingType |
| `ot` | original type |
| `pm` | priceMatch |
| `V` | STP mode |

Top-level keys: `e`, `E`, `T`.

### 1.8 Rate limits
| Item | Detail |
|---|---|
| IP weight | 2400 per minute (from `exchangeInfo.rateLimits`). Headers: `X-MBX-USED-WEIGHT-1M`. Limits apply per IP, not per key [doc]. |
| Orders | Per account: header `X-MBX-ORDER-COUNT-10S` / `-1M`. Defaults are 300 per 10 s and 1200 per min [verify in `rateLimits`]. New order costs 0 IP weight [doc]. |
| 429 | Rate or order limit breached: back off [doc] |
| 418 | IP auto-ban after continued 429s, from 2 min up to 3 days [doc] |
| Others | 403 means a WAF limit. 503 "Unknown error" means execution status is unknown: query before retrying. `-1008` is system throttling; reduce-only and closePosition orders are exempt [doc]. |

### 1.9 India
- Binance registered with FIU-IND as a reporting entity in Aug 2024 and paid a fine of about INR 18.82 crore. It said its site and app are available to Indian users. Sources:
  - https://www.medianama.com/2024/08/223-binance-registers-with-the-finacial-intelligence-unit-to-end-hiatus-from-the-indian-crypto-market/
  - https://www.fintechfutures.com/regulatory-actions/binance-to-pay-2-25m-fine-to-india-s-fiu-over-aml-deficiencies
- **Unconfirmed:** whether USDⓈ-M futures are offered to India-KYC accounts after the relaunch. No official Binance statement was found. Check binance.com/en/support/announcement and the FIU-IND registered-entities list at https://fiuindia.gov.in.

---

## 2. Bybit v5, linear perpetuals (B0.6)

### 2.1 Endpoints
| Item | Mainnet | Testnet | Demo trading |
|---|---|---|---|
| REST | `https://api.bybit.com` (alt `api.bytick.com`). Regional hosts: `.tr`, `.kz`, `.ge`, `.ae`, `.eu`, `.id`, `api.manepa.jp`, `api.spark-fintech.com` (HK) [doc] | `https://api-testnet.bybit.com` [doc] | `https://api-demo.bybit.com` [doc] |
| Public WS | `wss://stream.bybit.com/v5/public/linear` | `wss://stream-testnet.bybit.com/v5/public/linear` | None. Use mainnet public [doc]. |
| Private WS | `wss://stream.bybit.com/v5/private` | `wss://stream-testnet.bybit.com/v5/private` | `wss://stream-demo.bybit.com/v5/private` [doc host; path verify] |
| Trade WS | `wss://stream.bybit.com/v5/trade` | `wss://stream-testnet.bybit.com/v5/trade` | Not supported [doc] |

Notes:
- Demo trading is a separate sub-UID under the mainnet account, with its own keys. Its rate limits are fixed at the defaults. The docs say to create demo keys from mainnet demo trading, not from the testnet site [doc].
- US and Mainland-China IPs get 403 [doc].

Sources:
- https://bybit-exchange.github.io/docs/v5/guide
- https://bybit-exchange.github.io/docs/v5/demo
- https://bybit-exchange.github.io/docs/v5/ws/connect

### 2.2 Auth
| Item | Detail |
|---|---|
| Headers | `X-BAPI-API-KEY`, `X-BAPI-TIMESTAMP` (ms), `X-BAPI-SIGN`, `X-BAPI-RECV-WINDOW` (default 5000). Broker users also send `X-Referer`. Optional `cdn-request-id` [doc]. |
| Prehash | GET: `timestamp + apiKey + recvWindow + queryString`. POST: `timestamp + apiKey + recvWindow + rawJsonBody` [doc] |
| Algorithms | HMAC_SHA256 gives lowercase hex. RSA_SHA256 gives base64; you upload only the public key [doc]. |
| Tolerance | `serverTime - recvWindow <= timestamp < serverTime + 1000` [doc] |
| Permissions | Read-only or read-write. Groups: `ContractTrade: [Order, Position]`, `Spot`, `Wallet`, `Options`, `Derivatives`, `Exchange`, `Earn`, and others. `CopyTrading` is deprecated [doc]. Check with `GET /v5/user/query-api`. |
| IP / expiry | `ips` field. `expiredAt` and `deadlineDay` apply **only to keys with no IP bound, or after a password change** [doc]. Unbound keys expire after 3 months per the Bybit help center [verify]. IP binding is optional for trading [verify]. |

Source: https://bybit-exchange.github.io/docs/v5/user/apikey-info

### 2.3 Instrument metadata: `GET /v5/market/instruments-info?category=linear`
| Concept | Field |
|---|---|
| Tick | `priceFilter.tickSize`, `minPrice`, `maxPrice`; `priceScale` [doc] |
| Lot | `lotSizeFilter.qtyStep`, `minOrderQty`, `maxOrderQty` (limit), `maxMktOrderQty` (market). Max values are adjusted bi-monthly [doc]. |
| Min notional | `lotSizeFilter.minNotionalValue` [doc] |
| Leverage | `leverageFilter.minLeverage`, `maxLeverage`, `leverageStep` [doc] |
| Qty unit | Docs say "contracts". For USDT linear, 1 contract = 1 base coin, so qty is effectively coin and there is no multiplier field [the doc doesn't state contract size: verify]. |
| Pagination | `limit` up to 1000 (default 500). Use `cursor` / `nextPageCursor`. There are more than 500 linear symbols, so paginate [doc]. |

### 2.4 Orders
| Feature | Endpoint / param |
|---|---|
| Create | `POST /v5/order/create` with `category=linear`. `orderType` is Market or Limit; Market is converted to IOC limit. TIF: GTC, IOC, FOK, PostOnly, RPI. `slippageToleranceType` (TickSize or Percent) applies to market orders [doc]. |
| Stop/trigger | Same endpoint with `triggerPrice`, `triggerDirection` (1 = rise, 2 = fall), `triggerBy` (LastPrice, IndexPrice or MarkPrice). It does not reserve margin [doc]. |
| Attached TP/SL | `takeProfit`, `stopLoss`, `tpTriggerBy`, `slTriggerBy`, `tpslMode` (Full = whole position, market only; Partial = filled qty, limit allowed), `tpLimitPrice`, `slLimitPrice`. Not allowed with `reduceOnly` [doc]. |
| Position TP/SL / trailing | `POST /v5/position/trading-stop`: `takeProfit`, `stopLoss`, `trailingStop` (**price distance**, not %), `activePrice`, `tpSize`/`slSize` (Partial), `positionIdx`. Setting a value to `0` cancels it [doc]. There is no trailing stop on create-order [doc]. |
| Reduce-only | `reduceOnly=true`. `closeOnTrigger` guarantees the reduce even without margin, possibly cancelling other orders [doc]. |
| Client order id | `orderLinkId`: ≤36 chars, `[A-Za-z0-9_-]`, must be unique [doc]. Uniqueness is open-orders only [verify]. |
| Cancel / amend | `POST /v5/order/cancel`, `/v5/order/cancel-all`, `/v5/order/amend` (qty, price, TP/SL, triggerPrice) [verify params] |
| Batch | `/v5/order/create-batch`, `/amend-batch`, `/cancel-batch`. The rate-limit page says 1–10 orders per request, and quota is consumed per order [doc]. Linear may allow 20 [verify]. |
| Limits | 500 active orders and 10 conditional orders per symbol (linear) [doc] |

Sources:
- https://bybit-exchange.github.io/docs/v5/order/create-order
- https://bybit-exchange.github.io/docs/v5/position/trading-stop

### 2.5 Positions
| Item | Detail |
|---|---|
| Mode | `POST /v5/position/switch-mode`, `mode` 0 = one-way (Merged Single), 3 = hedge (Both Sides). Set by `symbol` or `coin`; symbol beats coin beats default (one-way). A coin-level switch skips symbols with positions or orders [doc]. |
| positionIdx | 0 = one-way, 1 = hedge long, 2 = hedge short. Required in hedge mode on every order [doc]. |
| Leverage | `POST /v5/position/set-leverage` (`buyLeverage`, `sellLeverage`) [verify] |
| Margin mode | Unified Trading Account: account-level `POST /v5/account/set-margin-mode` (`ISOLATED_MARGIN`, `REGULAR_MARGIN` = cross, `PORTFOLIO_MARGIN`) [verify] |
| Close | Opposite Market order with `reduceOnly=true` (optionally with `closeOnTrigger`). Bybit documents `qty="0"` plus reduceOnly as close-all [verify]. |
| Read | `GET /v5/position/list` [verify] |

Source: https://bybit-exchange.github.io/docs/v5/position/position-mode

### 2.6 Fills / history
| Endpoint | Rules |
|---|---|
| `GET /v5/execution/list` | `category` is required. Optional: `symbol`, `orderId`, `orderLinkId`, `baseCoin`, `settleCoin`, `execType`, `startTime`, `endTime`. The window is ≤ 7 days, defaulting to the last 7 days. `limit` is 1–100 (default 50). Paginate with `cursor` / `nextPageCursor`. Sorted by `execTime` descending [doc]. |
| Retention | The nav title says "(2 years)" [verify] |
| Closed PnL | `GET /v5/position/closed-pnl` [verify] |

`symbol` is not required, so one call per 7-day window covers every symbol. That makes Bybit cheaper to backfill than Binance.

Source: https://bybit-exchange.github.io/docs/v5/order/execution

### 2.7 Private WebSocket
| Item | Detail |
|---|---|
| Auth | `{"op":"auth","args":[apiKey, expires, signature]}`. `signature = HMAC_SHA256(secret, "GET/realtime" + expires)`, and `expires` is a future ms timestamp [doc]. |
| Heartbeat | Send `{"op":"ping"}` every **20 s** [doc]. `max_active_time` query param ranges 30 s–600 s. The default cut-off is 10 min without traffic [doc]. |
| Topics | `order`, `execution` (or `execution.linear`; you can't combine all-in-one and categorised topics), `execution.fast`, `position`, `wallet` [doc] |
| Connection limits | ≤500 new connections per 5 min per domain. Market-data connections are capped at 1000 per IP [doc]. |

**Fill event fields (`execution`) [doc]:**

| Group | Fields |
|---|---|
| Fill | `execId`, `execPrice`, `execQty`, `execValue`, `execType` (Trade, Funding, AdlTrade, BustTrade, ...), `execTime`, `isMaker`, `execPnl`, `closedSize` |
| Fee | `execFee`, `feeRate`, `feeCurrency`, `extraFees` |
| Order | `orderId`, `orderLinkId`, `side`, `orderPrice`, `orderQty`, `leavesQty`, `orderType`, `stopOrderType`, `createType` |
| Instrument | `category`, `symbol` |
| Sequence | `seq` |

- Envelope: `id`, `topic`, `creationTime`.
- `seq` + `symbol` is unique [doc].

Source: https://bybit-exchange.github.io/docs/v5/websocket/private/execution

### 2.8 Rate limits
| Item | Detail |
|---|---|
| IP | 600 requests per 5 s per IP. Exceeding it returns **HTTP 403 "access too frequent"**: stop and wait at least **10 min**; the ban lifts automatically [doc]. |
| Per UID | Rolling per-second limits. `retCode 10006` "Too many visits!". Headers: `X-Bapi-Limit`, `X-Bapi-Limit-Status`, `X-Bapi-Limit-Reset-Timestamp` [doc]. |
| Order endpoints | Linear create about 10–20/s, amend 10/s, cancel 20/s per UID. The table rendered ambiguously [verify]. VIP and PRO tiers have higher limits. |
| Batch | Over-limit orders in a batch fail individually while the rest succeed [doc] |
| Daily | Order counts are aggregated across main and sub accounts per UTC day, under risk control [doc] |

Source: https://bybit-exchange.github.io/docs/v5/rate-limit

### 2.9 India
| Date | Event |
|---|---|
| Jan 2025 | Bybit restricted Indian users. Derivatives positions went close-only from 12 Jan 2025. |
| 31 Jan 2025 | FIU-IND fined Bybit INR 9.27 crore (~$1.06M) under PMLA. |
| Early 2025 | Bybit registered with FIU-IND as a reporting entity and restored services from Feb 2025. |
| Sep 2025 | Bybit press release: full app access resumed for Indian users, covering spot, derivatives, options and copy trading. |

Sources:
- https://cointelegraph.com/news/bybit-registers-indian-authorities-restores-services
- https://www.intelligentcio.com/apac/2025/09/10/uae-based-bybit-resumes-full-access-for-indian-users-reinforces-commitment-to-compliance-and-crypto-inclusion/ (republished company press release)

The 2026 status is unconfirmed.

---

## 3. OKX v5, SWAP (B0.7)

### 3.1 Endpoints
| Item | Production | Demo trading |
|---|---|---|
| REST | `https://openapi.okx.com` per the current docs, which say it does not work for US/AU (`us.okx.com`) or EEA (`eea.okx.com`) users [doc]. The legacy host is `https://www.okx.com` [verify still accepted]. | Same host plus header **`x-simulated-trading: 1`** [doc] |
| Public WS | `wss://ws.okx.com/ws/v5/public` | `wss://wspap.okx.com/ws/v5/public` |
| Private WS | `wss://ws.okx.com/ws/v5/private` | `wss://wspap.okx.com/ws/v5/private` |
| Business WS (algo orders, candles) | `wss://ws.okx.com/ws/v5/business` | `wss://wspap.okx.com/ws/v5/business` |

Port 8443 is being retired in favour of 443 [doc]. Demo keys are created inside demo trading and never expire [doc].

Source: https://www.okx.com/docs-v5/en/ (Overview and Authentication sections)

### 3.2 Auth
| Item | Detail |
|---|---|
| Headers | `OK-ACCESS-KEY`, `OK-ACCESS-SIGN`, `OK-ACCESS-TIMESTAMP` (ISO-8601 ms UTC, e.g. `2020-12-08T09:08:57.715Z`), `OK-ACCESS-PASSPHRASE` [doc] |
| Prehash | `timestamp + METHOD + requestPath(+?query) + body`, then HMAC-SHA256 and Base64 [doc] |
| Tolerance | ±30 s of server time, else error `50102`. Optional `expTime` header (ms) on place and amend [doc]. |
| **Passphrase** | A third secret per key, user-set. The adapter must store it encrypted alongside the key and secret. |
| Permissions | `Read`, `Trade`, `Withdraw` [doc] |
| IP | Up to 20 IPs or CIDR ranges per key [doc]. Optional for trading. |
| Expiry | Keys **without IP binding** that have `trade` or `withdraw` permission expire after **14 days of inactivity**. On WS, only `login` counts as use [doc]. |

### 3.3 Instrument metadata: `GET /api/v5/public/instruments?instType=SWAP`
| Concept | Field |
|---|---|
| Symbol | `instId` = `BTC-USDT-SWAP`, plus `instFamily` `BTC-USDT` |
| Contract value | **`ctVal`** (e.g. 0.01 BTC per contract), `ctValCcy`, `ctMult`, `ctType` (linear or inverse) [ctVal/ctType doc; others verify] |
| Lot | `lotSz` (step, in contracts), `minSz` [verify] |
| Tick | `tickSz` [verify] |
| Max | `maxLmtSz`, `maxMktSz` [verify] |
| Qty unit | `sz` = **number of contracts** for SWAP [doc]. Base qty = `sz × ctVal × ctMult`. |
| Min notional | No explicit field. It follows from `minSz × ctVal × price` [verify]. |

Rate limit: 20 requests per 2 s [doc].

### 3.4 Orders
| Feature | Endpoint / param |
|---|---|
| Place | `POST /api/v5/trade/order`, 60 per 2 s per UID + instId [doc] |
| Required params | `instId`, `tdMode` (`cross` or `isolated` for SWAP), `side` (buy or sell), `ordType`, `sz` (contracts) |
| Other params | `px`; `posSide` (`net`, `long`, `short`: required in long/short mode, else error 51000); `reduceOnly` (**net mode only**: rejected if sz > position); `stpMode` [doc] |
| `ordType` | `market`, `limit`, `post_only`, `fok`, `ioc`, `optimal_limit_ioc`, `rpi`. `elp` is accepted until 2026-10-31 [doc]. |
| Margin mode per order | Set by `tdMode` on each order; there is no separate per-symbol margin setting [doc] |
| Attached TP/SL | `attachAlgoOrds[]`: `attachAlgoClOrdId`, `tpTriggerPx` or `tpTriggerRatio`, `tpOrdPx` (`-1` = market), `tpOrdKind`, `slTriggerPx` or `slTriggerRatio`, `slOrdPx`, `tp/slTriggerPxType` (last, index, mark), `sz` (split TP), `amendPxOnTriggerType`. These activate only after the parent fills [doc]. |
| Stop / trigger / OCO / trailing | `POST /api/v5/trade/order-algo`. `ordType`: `conditional` (single TP/SL), `oco`, `trigger`, `move_order_stop` (trailing: `callbackRatio` **or** `callbackSpread`, optional `activePx`), `twap`, `chase` [trailing params doc; endpoint and other types verify]. Algo ids are `algoId` and `algoClOrdId`. Updates arrive on the business WS channel `orders-algo` [verify]. |
| Client order id | `clOrdId`: up to 32 case-sensitive **alphanumerics only** (no `-` or `_`), unique among **pending** orders [doc]. There is also a `tag` of ≤16 chars. |
| Cancel / amend | `POST /api/v5/trade/cancel-order`; `/amend-order` (`newSz`, `newPx`, `cxlOnFail`, `reqId`) [verify]. At most 3 in-flight amends per order (error 51513) [doc]. |
| Batch | `/batch-orders`: ≤20 per request, 300 orders per 2 s [doc]. `/cancel-batch-orders` and `/amend-batch-orders` also take ≤20 [verify]. |

### 3.5 Positions
| Item | Detail |
|---|---|
| Mode | `POST /api/v5/account/set-position-mode`: `long_short_mode` or `net_mode`. Account-wide; portfolio margin supports net only; 5 per 2 s [doc]. Read it with `GET /api/v5/account/config` (`posMode`, `acctLv`) [doc]. |
| Account mode | Spot, Futures, Multi-currency margin, or Portfolio margin. SWAP needs Futures mode or higher, set on the web or app (`acctLv`) [doc]. |
| Leverage | `POST /api/v5/account/set-leverage` (`instId`, `lever`, `mgnMode`; `posSide` only for isolated in long/short mode), 20 per 2 s [doc] |
| Close | `POST /api/v5/trade/close-position` (`instId`, `mgnMode`, `posSide`, `autoCxl`): market-closes the whole position [verify] |
| Read | `GET /api/v5/account/positions`: `pos` is in contracts, 10 per 2 s [doc] |

### 3.6 Fills / history
| Endpoint | Rules |
|---|---|
| `GET /api/v5/trade/fills` | Last **3 days**. Paginate with `after` / `before` (billId) and `begin` / `end` (ms). `limit` ≤100. 60 per 2 s [window per 3rd-party mirrors; params verify]. |
| `GET /api/v5/trade/fills-history` | Last **3 months**. Same pagination. `instType` required. 10 per 2 s [verify] |
| Older data | Bills archive (`/account/bills-archive`) and a bills-history download request [verify] |

Sources for the 3-day / 3-month windows:
- https://rdrr.io/cran/okxr/man/get_trade_fills_history.html (third-party mirror)

### 3.7 Private WebSocket
| Item | Detail |
|---|---|
| Login | `{"op":"login","args":[{"apiKey","passphrase","timestamp"(unix **seconds**),"sign"}]}`. `sign = Base64(HMAC_SHA256(secret, timestamp+"GET"+"/users/self/verify"))`. Expires 30 s after the timestamp [doc]. |
| Heartbeat | The connection drops after 30 s without data. Send the literal text `ping` (expect `pong`) when idle for N < 30 s [doc]. |
| Limits | 3 connection requests per second per IP. 480 subscribe, unsubscribe or login ops per hour per connection. 30 connections per private channel per sub-account (`channel-conn-count-error`). Subscribe args ≤64 KB [doc]. |
| Channels | `orders` (instType SWAP), `positions` (`updateInterval` 0, 2000–4000 ms, default ~5 s; only pos≠0 pushed), `balance_and_position` (eventType snapshot, filled, funding_fee, liquidation, adl), `orders-algo` (business WS) [positions/b&p doc]. A dedicated `fills` channel exists, VIP-restricted [verify]. |
| WS order entry | `op: order`, `batch-orders`, `cancel-order`, `amend-order` on the private WS. Limits are shared with REST [doc]. |

**Fill fields in the `orders` push [verify; this section did not render]:**

| Key | Meaning |
|---|---|
| `fillSz` | last fill qty, in contracts |
| `fillPx` | last fill price |
| `tradeId` | trade id |
| `fillTime` | fill time |
| `fillFee`, `fillFeeCcy` | fee for this fill (negative = charged) |
| `fillPnl` | PnL from this fill |
| `execType` | T = taker, M = maker |
| `accFillSz` | cumulative filled qty |
| `avgPx` | average price |
| `state` | live, partially_filled, filled, canceled, mmp_canceled |
| `ordId`, `clOrdId` | order ids |
| `posSide`, `side`, `tdMode`, `reduceOnly` | position and order context |
| `cTime`, `uTime` | created and updated time |

A fill is a push where `tradeId` is non-empty.

Sources: third-party mirrors https://docs.rs/rust-okx/latest/src/rust_okx/ws/model/trade.rs.html and https://nautilustrader.io/docs/core-latest/nautilus_okx/websocket/messages/struct.OKXOrderMsg.html

### 3.8 Rate limits
| Item | Detail |
|---|---|
| Scope | Public REST is limited per IP. Private REST and WS order ops are limited per **User ID**, and each sub-account has its own [doc]. |
| Trade limits | Shared between REST and WS. Place, amend and cancel have independent limits, per instId [doc]. |
| Sub-account cap | 1000 new or amend orders per 2 s, counted per order; error `50061` [doc] |
| VIP5+ | Fill-ratio-based limit from 1,000 to 10,000 per 2 s; check with `GET /api/v5/trade/account-rate-limit` [doc] |
| Breach | Error code `50011`. HTTP status 429 [verify] |

### 3.9 India
- In March 2024 OKX told Indian users to close positions and withdraw by **30 Apr 2024**, citing local rules for offshore exchanges. Account functions were restricted from then on, while withdrawals stayed allowed and Web3/DeFi wallet services remained available. Sources:
  - https://entrackr.com/2024/03/crypto-exchange-okx-shuts-ops-in-india-citing-regulatory-hurdles
  - https://www.medianama.com/2024/03/223-crypto-exchange-okx-shuts-down-services-in-india/
- No FIU-IND registration was found, and no 2025–2026 return was found [unconfirmed]. **Treat OKX as unavailable for India-KYC accounts.** TRADElogs users with non-Indian OKX accounts are outside this scope; a compliance decision is needed.

---

## 4. Common adapter interface implications

### 4.1 Concept mapping
Every Delta Exchange India cell is **[to-verify]**; it comes from general knowledge, not the docs.

| Concept | Delta India | Binance USDⓈ-M | Bybit v5 linear | OKX v5 SWAP |
|---|---|---|---|---|
| REST host | `api.india.delta.exchange`; testnet `cdn-ind.testnet.deltaex.org` | `fapi.binance.com` / `demo-fapi.binance.com` | `api.bybit.com` / `api-testnet` / `api-demo` | `openapi.okx.com` + `x-simulated-trading: 1` |
| Auth | Headers `api-key`, `signature`, `timestamp` (unix **s**). Signature is HMAC-SHA256 hex of `method+timestamp+path+query+body`, with a tight tolerance (~5 s) | `X-MBX-APIKEY`, HMAC of query, ms timestamp, recvWindow 5 s | `X-BAPI-*`, HMAC hex of `ts+key+recv+payload`, ms | `OK-ACCESS-*`, Base64 HMAC, ISO timestamp, **passphrase**, ±30 s |
| Symbol | `BTCUSD` (USD-settled perp) + integer `product_id` | `BTCUSDT` | `BTCUSDT` | `BTC-USDT-SWAP` |
| Qty unit | Integer **contracts** × `contract_value` (e.g. 0.001 BTC) | **Base coin** (BTC) | "Contracts" = 1 coin (effectively **coin**) | **Contracts** × `ctVal` (e.g. 0.01 BTC) |
| Lot / tick fields | `contract_value`, `tick_size`, `min size = 1 contract` | `LOT_SIZE.stepSize`, `minQty`, `PRICE_FILTER.tickSize`, `MIN_NOTIONAL` | `qtyStep`, `minOrderQty`, `tickSize`, `minNotionalValue` | `lotSz`, `minSz`, `tickSz`, `ctVal`, `ctMult` |
| Client order id | `client_order_id` ≤32 chars | `newClientOrderId` ≤36, `[.A-Za-z0-9:/_-]`, unique among open orders | `orderLinkId` ≤36, `[A-Za-z0-9_-]`, unique | `clOrdId` ≤32, **alphanumeric only**, unique among pending orders |
| Reduce-only | `reduce_only` | `reduceOnly` (one-way only; hedge uses positionSide) | `reduceOnly` (+ `closeOnTrigger`) | `reduceOnly` (net mode only) |
| Position mode | One-way only (no hedge) | One-way or Hedge, **account-wide** (`positionSide` BOTH, LONG, SHORT) | One-way or hedge, **per symbol or coin** (`positionIdx` 0, 1, 2) | net or long_short, **account-wide** (`posSide` net, long, short) |
| Margin mode | Isolated per product (cross via portfolio settings) | Per symbol (`marginType`) | Account-level (UTA) | **Per order** (`tdMode`) |
| Leverage | `POST /v2/products/{id}/orders/leverage` | Per symbol | Per symbol, buy and sell sides | Per instId (+ posSide when isolated in hedge) |
| Stop / TP / SL | `stop_order_type`, `stop_price`, bracket orders | **Separate Algo API** (`/fapi/v1/algoOrder`) since 2025-12-09 | Same create endpoint (`triggerPrice`) + position `trading-stop` | `attachAlgoOrds` or a separate `order-algo` |
| Trailing | `trail_amount` (price distance) | `callbackRate` **%** 0.1–20 | `trailingStop` **price distance** (position-level only) | `callbackRatio` (%) or `callbackSpread` (price) |
| Close position | Opposite reduce_only market order, or close-all endpoint | Opposite reduceOnly market order (no endpoint) | Opposite reduceOnly market (qty 0 trick [verify]) | `POST /trade/close-position` |
| Fill history | `GET /v2/fills`, cursor pagination | `userTrades`: per **symbol**, 7-day windows, 3-month max | `execution/list`: all symbols, 7-day windows, cursor | `fills` (3 d) + `fills-history` (3 mo), billId cursor |
| Private WS auth | `{"type":"auth"...}` with api-key, signature, timestamp | **listenKey** via REST, keepalive every <60 min, 24 h reconnect | `op:auth` with `GET/realtime`+expires | `op:login` with `/users/self/verify` |
| Heartbeat | Client ping or heartbeat enable | Server ping every 3 min [verify] | Client `{"op":"ping"}` every 20 s | Client text `ping` every <30 s |
| Fill event | Channel `v2/fills` or `orders` | `ORDER_TRADE_UPDATE` with `x=TRADE`: `t`, `l`, `L`, `n`, `N`, `m`, `rp` | Topic `execution`: `execId`, `execQty`, `execPrice`, `execFee`, `isMaker`, `execPnl` | Channel `orders` with `tradeId≠""`: `fillSz` (contracts), `fillPx`, `fillFee` (negative), `execType` |
| Fee sign | Positive = paid | `n` positive = paid | `execFee` positive = paid | `fillFee` **negative = paid** |
| Rate-limit breach | HTTP 429 + `X-RATE-LIMIT-RESET` | 429, then **418 IP ban** (2 min–3 days) | **HTTP 403** IP ban ≥10 min; retCode 10006 per UID | Code 50011 (429), 50061 sub-account cap |
| Key secrets | key + secret; IP whitelist required for trading keys | key + secret (or RSA/Ed25519) | key + secret (or RSA) | key + secret + **passphrase** |
| Key expiry without IP | n/a (IP mandatory) | ~90 days [verify] | ~3 months (`expiredAt`) [verify] | 14 days of inactivity [doc] |
| India | Licensed Indian entity, FIU-IND registered | FIU-IND registered Aug 2024; futures access unconfirmed | FIU-IND registered 2025; services restored | Exited India Apr 2024 |

### 4.2 Differences the abstraction must handle
1. **Quantity normalisation.** Keep an internal `qtyBase` (coin) and convert per venue:
   - Binance: coin.
   - Bybit: coin.
   - OKX: `contracts = base / (ctVal × ctMult)`.
   - Delta: integer contracts = `base / contract_value`.

   Round to `stepSize` / `qtyStep` / `lotSz`. Reject below the min qty or min notional *before* sending; this is critical for copy-trading size scaling. Store both the venue-native qty and `qtyBase` on every fill.
2. **Client order id generator.** Use the lowest common denominator: **≤32 chars, `[A-Za-z0-9]` only**, which satisfies OKX and Delta. Encode `{prefix}{copyJobId}{seq}` in base36 and avoid `-` and `_`. Uniqueness is only guaranteed among open orders on Binance and OKX, so keep our own idempotency table and never reuse ids.
3. **Position mode.** Model `positionMode = ONE_WAY | HEDGE` per account and symbol, and translate the side intent:
   - Binance: `positionSide` + `reduceOnly` (not both in hedge).
   - Bybit: `positionIdx`.
   - OKX: `posSide`; reduceOnly is only valid in net mode.
   - Delta: one-way only [verify].

   Read the current mode at connect time. Bybit's mode can differ per symbol; Binance and OKX are account-wide. Recommend forcing **one-way** for copy-trading followers.
4. **Margin mode location.** Binance sets it per symbol, Bybit per account (UTA), OKX per order (`tdMode`), Delta per product. The adapter needs `ensureMarginMode(symbol, mode)` and `ensureLeverage(symbol, lev)` hooks that are no-ops where they don't apply. OKX passes `tdMode` on every order.
5. **Conditional orders are different objects.**
   - Binance: separate Algo API with its own ids and `ALGO_UPDATE` events.
   - OKX: `order-algo` with `algoId`, plus an `orders-algo` channel on the business WS.
   - Bybit: the same order object, with `stopOrderType`.

   Model TP/SL/trailing as `ProtectiveOrder` with a venue-specific id namespace. Trailing units differ: % on Binance, price distance on Bybit, either on OKX. Store both and convert using the mark price.
6. **Close position.** Only OKX has an endpoint. Elsewhere, synthesize it as reduce-only market for `abs(position)`.
7. **Fill ingestion.** Use one `FillEvent {venue, venueTradeId, venueOrderId, clientOrderId, symbol, side, qtyNative, qtyBase, price, fee, feeAsset, isMaker, realizedPnl, ts}`.
   - Dedupe on `(venue, venueTradeId)`. For Bybit use `execId`, or `seq`+`symbol`.
   - Normalize the OKX fee sign.
   - Filter Bybit `execType` to Trade, plus Funding and ADL as separate types.
8. **Backfill strategies differ.**
   - Binance: per symbol, 7-day windows, 90-day hard limit. You must know the symbol list, e.g. from `income` or positions.
   - Bybit: all symbols, 7-day windows, cursor.
   - OKX: 3 days on the fast endpoint, 3 months on the history endpoint, billId cursor.
   - Delta: cursor [verify].

   Run an initial import job and reconcile on WS reconnect.
9. **WS lifecycle.**
   - Binance: REST listenKey + PUT keepalive (<60 min) + forced 24 h reconnect.
   - Bybit: JSON ping every 20 s.
   - OKX: text `ping` every <30 s, re-login on reconnect, 480 ops/hour cap.

   Build one supervisor with per-venue `heartbeat()` and `authenticate()`, and do a REST reconcile after every reconnect.
10. **Auth material and clock.** Store key + secret + optional passphrase (OKX), all encrypted. Timestamp formats differ: ms (Binance and Bybit), ISO string (OKX REST), seconds (OKX WS, Delta). Tolerance runs from ~1 s ahead (Binance/Bybit) to 30 s (OKX), so sync to venue server time.
11. **Rate limits and bans.** Binance's 418 and Bybit's 403 IP bans affect **all users behind our egress IP**: one shared server IP for many users' keys is a real risk. Plan per-venue token buckets keyed by IP (Binance weight, Bybit 600 per 5 s) **and** by UID or instrument (OKX, Bybit). Honor `X-MBX-*` and `X-Bapi-Limit-*` headers.
12. **IP whitelisting.** Expiry rules push users to bind our egress IPs: Binance and Bybit expiry, and OKX's 14-day inactivity rule. Delta India requires IPs for trading keys [verify]. Provide static egress IPs (e.g. a fixed NAT) and show them in the connect-key UI. Binance may not accept CIDR [verify].
13. **Error mapping.** Normalize into `RATE_LIMITED`, `INSUFFICIENT_MARGIN`, `REDUCE_ONLY_REJECT`, `INVALID_QTY`, `UNKNOWN_STATUS` (Binance 503: query before retry), `AUTH_EXPIRED`, `IP_NOT_WHITELISTED`, and `CONDITIONAL_VIA_ALGO_REQUIRED` (Binance -4120).
14. **Regional / regulatory gating.** OKX is not offered in India. Bybit routes some regions to separate hosts (EU, TR, and others). OKX US/AU/EEA users need other hosts. The adapter config must carry the per-user host, not just the venue.

### 4.3 Items to verify before implementation
| Venue | Items |
|---|---|
| Binance | ORDER_TRADE_UPDATE key list; batchOrders max; ping cadence; 90-day IP rule; testnet WS host (two pages disagree) |
| Bybit | batch size for linear; per-endpoint UID limits; close-all `qty=0`; key 3-month expiry |
| OKX | `orders` channel fill fields; fills params and limits; close-position params; `fills` channel tier; `www.okx.com` still accepted |
| Delta India | Everything in its column |
