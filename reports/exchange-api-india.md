# Exchange API research: Indian venues and KuCoin (TODO B0.8)

Researched 2026-10-31. This is documentation research only: no keys were created, no orders were placed and no sign-ups were made.
"Unconfirmed" means the item was not found in official docs, or rests on secondary or older sources.

## Headline findings

- **Shark Exchange and Pi42 are the same company and run the same API.** Both footers say "operated by Lightning nodes Technologies Private Limited, FIU REID VA00045558". docs.sharkexchange.in is a copy of docs.pi42.com with different hosts, so **one adapter can serve both venues** if we make the base URL a setting.
- **CoinSwitch PRO's "HFT" futures surface uses Bybit v5's shape**: `/v5/order/...`, `orderLinkId`, the `retCode/retMsg/result` envelope, and execution fields `execId/execPrice/execQty`. It is open to every PRO user with API keys. This lets us reuse much of the Bybit adapter. Their regular Futures v2 API has **no private WebSocket**.
- **Mudrex** has a REST-only futures API. It offers no private WebSocket and **no testnet** (its own terms say so). Auth is the raw secret sent in a header.
- **None of the five Indian venues offers a testnet.** KuCoin's legacy futures sandbox may still exist (unconfirmed). Every integration will need small-size live tests.

---

## 1. CoinDCX (futures and spot)

Docs: https://docs.coindcx.com/ (one long Slate page)

| Item | Finding |
|---|---|
| Public API | Yes, spot and futures. Futures paths are under `https://api.coindcx.com/exchange/v1/derivatives/futures/...`. Keys are self-serve from the API dashboard (email and SMS OTP). No application process is described. |
| Auth | POST with a JSON body that includes `timestamp`. Headers: `X-AUTH-APIKEY` and `X-AUTH-SIGNATURE`, where the signature is hex HMAC-SHA256(secret, JSON body). |
| IP whitelist | Optional ("Bind IP Address to API key"). A bound key works only from that IP, so for copy trading we must give users our static egress IP. |
| Order types (futures) | `market_order`, `limit_order`, `stop_limit`, `stop_market`, `take_profit_limit`, `take_profit_market`. TIF values: `good_till_cancel`, `immediate_or_cancel`, `fill_or_kill`. `leverage` can be sent per order. `margin_currency_short_name` is USDT or INR. `position_margin_type` can be set. |
| TP/SL | `POST .../positions/create_tpsl` takes nested `take_profit` and `stop_loss` objects, each with a `stop_price`. |
| Reduce-only, client id | Futures create has **no documented `reduce_only` or `client_order_id`** (spot does have `client_order_id`). To close, use `POST .../positions/exit`. Unconfirmed whether hidden fields exist. |
| Positions and leverage | `POST .../positions`, `.../positions/update_leverage`, `.../positions/exit`. Margin-type change and cross-margin details are also available. Trades: `POST .../futures/trades`. |
| Private WS | Socket.IO at `wss://stream.coindcx.com`. **Requires socket.io-client v2 (2.4.0).** Emit `join` with `{channelName:"coindcx", authSignature: HMAC(secret, '{"channel":"coindcx"}'), apiKey}`. Events: `df-order-update`, `df-position-update`, `balance-update`. |
| Fill fields | The `df-order-update` payload carries `id, pair, side, status, order_type, price, stop_price, avg_price, total_quantity, remaining_quantity, cancelled_quantity, fee_amount, leverage, trades[], created_at, updated_at, margin_currency_short_name`. REST futures trades return `price, quantity, is_maker, fee_amount, pair, side, timestamp, order_id`. There is no dedicated futures fill event, so fills come from `trades[]` and `avg_price` on order updates. |
| Testnet | None documented. |
| Rate limits | FAQ: 16 requests/s, 960/min. Spot order endpoints: 2000 per 60 s. The futures-specific table was not found. |
| FIU-IND | Registered as a reporting entity (announced March 2023, [Business Standard](https://www.business-standard.com/article/markets/crypto-under-pmla-coindcx-registers-itself-as-reporting-entity-with-fiu-123031700747_1.html)). Not checked against the FIU-IND list itself. |

## 2. KuCoin Futures

Docs: https://www.kucoin.com/docs-new (the old docs.kucoin.com/futures redirects here)

| Item | Finding |
|---|---|
| Public API | Yes. Futures base URL: `https://api-futures.kucoin.com`. Keys are self-serve. There is a separate Broker program (https://www.kucoin.com/docs-new/rest/broker/instructions) that may be needed for rebates or attribution (unconfirmed for our use case). |
| Auth | Headers `KC-API-KEY`, `KC-API-SIGN` (base64 HMAC-SHA256 of timestamp+METHOD+endpoint+body), `KC-API-TIMESTAMP`, `KC-API-PASSPHRASE` (HMAC-signed with the secret), and `KC-API-KEY-VERSION: 2`. V1 keys are no longer supported ([auth](https://www.kucoin.com/docs-new/authentication)). This scheme is close to OKX's (it also uses a passphrase). |
| IP whitelist | Optional per key. Unconfirmed whether it is mandatory for trade permission. |
| Orders | `POST /api/v1/orders` takes `clientOid`, `side`, `symbol`, `leverage`, `type` (market/limit), `marginMode`, `positionSide`, `timeInForce` and `reduceOnly` (weight 2, futures pool, per [add-order](https://www.kucoin.com/docs-new/rest/futures-trading/orders/add-order)). Stop orders use `stop` (up/down), `stopPriceType` (TP/MP/IP) and `stopPrice`. A separate "Add Take Profit And Stop Loss Order" endpoint exists. A `POST /api/v1/orders/test` endpoint validates an order without matching it ([page](https://kucoin.com/docs-new/rest/futures-trading/orders/add-order-test)). Lookup by `clientOid`: `/api/v1/orders/byClientOid`. |
| Positions and leverage | Position endpoints exist. Leverage is per order for isolated margin, and a cross-leverage endpoint exists. Exact paths not confirmed in this pass. |
| Private WS | Get a token from `POST /api/v1/bullet-private`, then subscribe to `/contractMarket/tradeOrders` (all symbols, or `:{symbol}`) with `privateChannel:true` ([page](https://kucoin.com/docs-new/3470090w0)). A position topic also exists (`/contract/position:{symbol}`, path unconfirmed). |
| Fill fields | In `tradeOrders` messages with `type:"match"`: `orderId, symbol, side, orderType, matchPrice, matchSize, remainSize, filledSize, tradeId, clientOid, liquidity, status, ts` (`ts` is in ns). The doc samples are inconsistent, so verify against live messages. |
| Testnet | Legacy sandbox `api-sandbox-futures.kucoin.com` is referenced in older SDKs and [sandbox-docs](https://sandbox-docs.kucoin.com/). Current availability is **unconfirmed**. The `orders/test` endpoint is the safe fallback. |
| Rate limits | Classic account, VIP0: futures pool 2000 per 30 s ([rule](https://www.kucoin.com/docs-new/rate-limit-rule-classic)). UTA: 300/s. HTTP 429 returns code 429000. |
| FIU-IND | KuCoin announced its FIU registration in March 2024 ([KuCoin blog](https://kucoin.com/blog/kucoin-pioneers-fiu-compliance-in-india-among-global-crypto-exchanges)). Whether Indian KYC users can access futures is unconfirmed. |

## 3. Pi42

Docs: https://docs.pi42.com/

| Item | Finding |
|---|---|
| Public API | Yes, futures only (INR and USDT perpetuals; the venue also lists options). Authenticated base URL: `https://fapi.pi42.com/`. Public base URL: `https://api.pi42.com/`. The docs say "Users can create an API key", so keys are self-serve with no application step. |
| Auth | Headers `api-key` and `signature`. The signature is hex HMAC-SHA256 of the query string (GET) or JSON body (POST/PUT/DELETE), including a ms `timestamp`. This is Binance-like. |
| IP whitelist | Supported per key via `/v1/retail/add-allowed-ips` and `remove-allowed-ips`. Not stated as mandatory. Key permissions can be updated via API. |
| Orders | `POST /v1/order/place-order` supports `MARKET`, `LIMIT`, `STOP_MARKET` and `STOP_LIMIT`, plus `reduceOnly`, `clientOrderId`, `takeProfitPrice`/`stopLossPrice` attached to the order, and `placeType: POSITION` with `positionId`. Multi-target TP/SL: `/v2/order/split-tp-sl`. Lookup and edit by `clientOrderId` are supported. |
| Positions and leverage | `GET /v1/positions/{OPEN\|CLOSED\|LIQUIDATED}`. Leverage: `POST /v1/exchange/update/leverage` with `{leverage, contractName}`. It is blocked while a position or open orders exist (errors 2305/2306). |
| Private WS | Socket.IO at `https://fawss-uds.pi42.com/auth-stream/{listenKey}`. Manage the listen key with POST/PUT/DELETE on `/v1/retail/listen-key` and refresh it at least hourly. Events: `newOrder, updateOrder, orderFilled, orderPartiallyFilled, orderCancelled, orderFailed, newPosition, updatePosition, closePosition, balanceUpdate, newTrade, sessionExpired`. |
| Fill fields | `orderPartiallyFilled` uses `filledAmount` (not `cumQty`). `eventTime` is a string in ns. The `newTrade` payload is not fully documented. REST trade history (`/v1/user-data/trade-history`) returns `id, time, symbol, type, side, price, quantity, role, fee, realizedProfit, clientOrderId, marginAsset`. |
| Testnet | None documented. |
| Rate limits | place-order: 20/s. delete-order: 30/min. **All other endpoints: 60/min**, which is tight for polling many users. |
| FIU-IND | Site footer: "FIU-IND Registered VASP, REID: VA00045558" (https://pi42.com/). |

## 4. Shark Exchange

Docs: https://docs.sharkexchange.in/

| Item | Finding |
|---|---|
| Relationship to Pi42 | Same operator (Lightning nodes Technologies Pvt Ltd), same FIU REID, Pi42 assets on the site, and the docs are a copy of Pi42's (https://sharkexchange.in/). The App Store seller is TN42 Technologies Pte Ltd. |
| API | Identical to Pi42: the same endpoints (`/v1/order/place-order`, `/v2/order/split-tp-sl`, listen key and so on), headers (`api-key`, `signature`), HMAC-SHA256 signing, and rate limits (20/s place, 30/min cancel, 60/min other). Hosts: `https://api.sharkexchange.in/` for both public and authenticated calls, and WS `https://fawss-uds.sharkexchange.in/auth-stream/{listenKey}`. Same WS event list. |
| IP whitelist | The add-allowed-ips endpoint was not found in Shark's docs (unconfirmed). |
| Testnet | None documented. |
| FIU-IND | Footer: "FIU-IND Registered VASP, REID: VA00045558", the same entity as Pi42. |

## 5. Mudrex (futures)

Docs: https://docs.trade.mudrex.com/docs/overview

| Item | Finding |
|---|---|
| Public API | Yes, futures only, at `https://trade.mudrex.com/fapi/v1`. Requires completed KYC (PAN and Aadhaar) and TOTP 2FA ([terms](https://docs.trade.mudrex.com/docs/api-terms-conditions) §2.1). Third-party software integration is allowed at the user's discretion (§8.1). |
| Auth | **`X-Authentication: <API secret>` with no request signing** ([auth](https://docs.trade.mudrex.com/docs/authentication-rate-limits)). The secret travels on every call, so we must treat it as a bearer token. |
| IP whitelist | Not documented. |
| Orders | `POST /futures/{asset_id}/order` (or by symbol with `?is_symbol`) takes `leverage, quantity, order_price, order_type, trigger_type (MARKET/LIMIT), is_takeprofit, is_stoploss, takeprofit_price, stoploss_price, reduce_only` ([quickstart](https://docs.trade.mudrex.com/docs/quickstart)). Exact `reduce_only` behaviour is unconfirmed. **No client order id documented.** Amend uses PATCH, cancel uses DELETE `/futures/orders/{id}`. |
| Positions and leverage | `GET /futures/positions` and `/positions/history`. Position actions: `/positions/{id}/close`, `close/partial`, `reverse`, `add-margin`, and `riskorder` (TP/SL, POST/PATCH). Leverage: GET/POST `/futures/{asset_id}/leverage` (isolated only). Endpoint list cross-checked via [ccxt](https://docs.ccxt.com/docs/exchanges/mudrex/implicit-api). |
| Private WS | **None.** Only public market data (kline, mark-kline, ticker) is streamed. Fills must be polled. |
| Testnet | **None** ("Mudrex does not provide any sandbox, simulation, or testnet environment", terms §6.3). |
| Rate limits | Trading: 10/s, 500/min and 30,000/h per key. Wallet: 2/s. Market REST: 300/min per IP. HTTP 429 includes `Retry-After`. |
| FIU-IND | Mudrex says it is FIU-registered on its own site ([Mudrex Learn](https://mudrex.com/learn/is-mudrex-legal-in-india/)). Not checked against the FIU-IND list. |

## 6. CoinSwitch PRO (spot, futures and HFT)

Docs: https://api-trading.coinswitch.co/

| Item | Finding |
|---|---|
| Public API | Yes, as separate surfaces ([API surfaces](https://api-trading.coinswitch.co/get-started/api-surfaces)). **Spot v2**: `https://coinswitch.co/trade/api/v2`. **Futures v2**: `.../trade/api/v2/futures` (USDT perpetuals, exchange id `EXCHANGE_2`). **HFT**: `https://dma.coinswitch.co/v5` and `/dma/api/v1`, "available to all CoinSwitch PRO users with API keys — no application or whitelist". Options are a private beta that needs an email request. Keys are generated under Profile, then API Trading, and **only one key pair can be active per user**, which matters if the user also runs other bots. |
| Auth | **Ed25519**, not HMAC. Headers: `X-AUTH-APIKEY` (public key hex), `X-AUTH-SIGNATURE` (hex signature of `METHOD + path_with_query + epoch`; **the body is not signed**) and `X-AUTH-EPOCH` (ms; mandatory on HFT). Clock drift should stay within ±5 s, and drift over 60 s is rejected ([auth](https://api-trading.coinswitch.co/get-started/authentication)). |
| IP whitelist | Not documented. |
| Orders (Futures v2) | `POST /trade/api/v2/futures/order` supports `MARKET`, `LIMIT`, `TAKE_PROFIT_MARKET` and `STOP_MARKET`. It takes `trigger_price`, `reduce_only` (mandatory for TP/SL), `time_in_force` (GTC/IOC/FOK) and `client_order_id` (deduplicated). TP/SL is position-level with `quantity=0` ([place-order](https://api-trading.coinswitch.co/futures/reference/place-order)). |
| Orders (HFT) | Bybit-v5-style `/v5/order/...`, `/v5/position/...` and `/v5/execution/...`, with `orderLinkId`, set-leverage and switch-position-mode endpoints ([HFT overview](https://api-trading.coinswitch.co/hft/concepts/overview)). |
| Positions and leverage | Futures v2: `GET /futures/positions` returns `position_id, position_side, leverage, position_size, avg_entry_price, mark_price, unrealised_pnl, liquidation_price, margin_type`. `POST /futures/leverage` is blocked while a position or open orders exist. |
| Private WS | **Futures v2: none** ("User-data sockets (Order updates, Position updates) aren't available on Futures today", per [connection](https://api-trading.coinswitch.co/futures/websockets/connection)). Spot has order-updates and balance-updates sockets. **HFT: yes, over NATS WebSocket.** Get a signature from `GET /dma/api/v1/socket/signature`, send `{"op":"auth","args":[api_key,expires,signature]}`, then subscribe to `v1.f.ex1.private.subAccountId.<id>.order` and `.trade` ([private](https://api-trading.coinswitch.co/hft/sockets/private)). |
| Fill fields (HFT trade event) | `event_type:"execution.linear"`, then `o[]` with `symbol, orderId, orderLinkId, side, orderPrice, orderQty, leavesQty, orderType, execId, execPrice, execQty, execType, execValue, execFee, feeRate, execTime, isMaker, closedSize, seq`. `execId` is the dedupe key. These are the same names as Bybit v5. |
| Testnet | None documented. |
| Rate limits | Per key ([limits](https://api-trading.coinswitch.co/resources/errors-and-rate-limits)). Futures v2: place 20/60 s, cancel 10/60 s, positions 20/60 s, leverage 10/60 s. These are **very low for copy trading at scale**. HFT limits are not published ("contact api@coinswitch.co"). Spot: create order 100/10 s. |
| FIU-IND | Widely described as FIU-registered (operator: Bitkuber Investments Pvt Ltd). Only secondary or sponsored sources were found, so this is **unconfirmed**. |

---

## Recommendation (after Delta India, Binance, Bybit and OKX)

| Rank | Venue | Usable futures API | Testnet | Effort | Notes |
|---|---|---|---|---|---|
| 1 | CoinSwitch PRO (HFT surface) | Yes | No | M | Bybit-v5 shape, so the Bybit adapter's mapping can be reused. New pieces are Ed25519 signing and NATS private streams. Skip Futures v2: it has no private WS and 20 orders/min. One key per user is a UX caveat. |
| 2 | Pi42 + Shark (one adapter) | Yes | No | M | Binance-like HMAC, listen-key Socket.IO stream, reduceOnly, clientOrderId and TP/SL. Configuring the base URL gives us two venues. The 60/min limit on non-order endpoints means we should use WS, not polling. |
| 3 | CoinDCX futures | Partial | No | M | Full order types and a private socket. However, futures has no documented reduce-only or client order id, socket.io v2 is pinned, and fills arrive inside order updates. Large Indian user base. |
| 4 | KuCoin futures | Yes | Unconfirmed (legacy sandbox, plus `orders/test`) | M | Mature, Bybit/OKX-class features, and the auth is close to OKX's (passphrase). Lower India priority because futures availability for Indian KYC users is unconfirmed. |
| 5 | Mudrex | Partial | No | M | REST only: fills must be polled (10/s per key is fine). No client order id, and the secret is used as a bearer token. Do it last. |

Effort key: S is under 3 days, M is about 1 week, L is 2 weeks or more, each for one adapter covering orders, positions, a fill stream and reconciliation. None of these venues has a testnet, so budget small-size live tests on a staff account for each one.
