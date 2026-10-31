# Delta Exchange India API: research for copy trading (B0.4)

Researched 2026-10-31. This is documentation research only. No keys were used and no orders were placed. A few public unauthenticated GETs went to the testnet REST API to confirm response shapes.

**Primary sources**
- API docs (India, single page): https://docs.delta.exchange (the section anchors are cited below as `docs#section`)
- Official python client: https://github.com/delta-exchange/python-rest-client (file `delta_rest_client/delta_rest_client.py`, `README.md`, `changelog.md`)
- Changelog: https://docs.delta.exchange/#changelog

"Live check" means I confirmed the shape against `https://cdn-ind.testnet.deltaex.org` on 2026-10-31. "Unconfirmed" means I found no official source for it.

> **Time-critical.** On 14.10.26 Delta gave final notice that two things are **fully removed on 31 Oct 2026 (today)**: the legacy WS channels `l1_orderbook`, `l2_orderbook` and `l2_updates`, and the old WS `{"type":"auth"}` method. Use `ob_l1`, `ob_l2` and `ob_updates` on the **public** socket, and use `key-auth` (docs#changelog, 14.10.26).

---

## 1. Base URLs

| Env | REST | WS private (and legacy) | WS public (new channels) |
|---|---|---|---|
| India prod | `https://api.india.delta.exchange` | `wss://socket.india.delta.exchange` | `wss://public-socket.india.delta.exchange` |
| India testnet ("Demo account") | `https://cdn-ind.testnet.deltaex.org` ✅ | `wss://socket-ind.testnet.deltaex.org` ✅ | `wss://socket-ind-pub.testnet.deltaex.org` |
| Global (do NOT use) | `https://api.delta.exchange` | | |
| Global testnet (do NOT use) | `https://testnet-api.delta.exchange` | | |

Sources: docs#authentication (Common Errors / Verify the Correct Environment), docs#websocket-feed, python client docstring (lines 29-34).

- Our current URLs are **correct**. One thing to add: the new public channels (`ticker`, `ob_l1`, `ob_l2`, `ob_updates`, `trades`, `mark_price`, `candlesticks`, `spot_price`, `funding_rate`, `system_status`) live on the separate **public** socket. Private channels (`orders`, `positions`, `margins`, `user_trades`, `v2/user_trades`) stay on `socket-ind...`.
- Live check: both testnet WS hosts answer the upgrade probe with HTTP 426, so they are up.
- REST paths are prefixed with `/v2` (for example `/v2/orders`). The docs list paths without the prefix, but every sample and the client use `/v2/...`.
- The testnet REST host sits behind CloudFront (live check headers). Delta's data centres are in AWS Tokyo (docs#data-centers).
- Signup sites: testnet India is `https://testnet.delta.exchange/` and prod India is `https://india.delta.exchange/` (client README). A third-party MCP package mentions `demo.delta.exchange`. **Unconfirmed** which of the two is the current testnet UI.

## 2. Authentication (REST)

Source: docs#authentication, docs#signing-a-message, docs#creating-a-request, client `request()`.

| Item | Value |
|---|---|
| Prehash | `method + timestamp + requestPath + queryString + body` |
| method | Uppercase: `GET`, `POST`, `PUT` or `DELETE` |
| timestamp | Unix epoch **seconds**, as a string. It must equal the `timestamp` header. |
| requestPath | Includes `/v2`, for example `/v2/orders` |
| queryString | Includes the leading `?`, for example `?product_id=1&state=open`. Use an empty string if there is none. The client builds it with `quote_plus` in insertion order, and it must match the URL you send exactly. |
| body | The exact JSON string sent. The client uses compact `json.dumps(body, separators=(',',':'))`. Use an empty string for GET and for no body. |
| Algorithm | HMAC-SHA256 with the api secret, hex digest |
| Headers | `api-key`, `signature`, `timestamp`, **`User-Agent` (mandatory, otherwise 4XX or CDN 403)**, `Content-Type: application/json` |
| Tolerance | The signature must reach Delta within **5 s** of the timestamp. Otherwise you get `SignatureExpired`. |

Worked example (docs): `GET1542110948/v2/orders?product_id=1&state=open`

**Key permissions** (docs#api-key-permissions):
- **Read Data** covers market and account reads.
- **Trading** covers place/cancel orders, close positions, and margin and leverage changes. The docs also say "Orders, Positions, Wallets: requires Trading permission".
- **IP whitelisting is mandatory for Trading keys.** You can list several IPs, comma separated. IPv4 and IPv6 both work, and you must whitelist the one your egress actually uses.
- Key creation is blocked for 30 minutes after 5 wrong OTP/MFA attempts.
- Prod keys and Demo/testnet keys are **not interchangeable**.

**Auth error shapes** (docs#common-errors):

| Case | Body |
|---|---|
| Bad, deleted or wrong-env key | `{"success":false,"error":{"code":"invalid_api_key"}}` |
| Timestamp more than 5 s old | `{"error":"SignatureExpired","message":"your signature has expired"}` (includes server time and request time) |
| Missing permission | `{"error":"UnauthorizedApiAccess","message":"Api Key not authorised to access this endpoint"}` |
| IP not whitelisted | `{"success":false,"error":{"code":"ip_not_whitelisted_for_api_key"}}` (the response includes the caller IP) |
| CDN block (no User-Agent, hidden IP) | HTTP 403 `{"error":"Forbidden","message":"Request blocked by CDN"}` |
| Bad signature | `{"success":false,"error":{"code":"Signature Mismatch"}}` |

The envelopes are inconsistent: some use `error.code` and some use top-level `error` plus `message`. The parser must handle both.

Other notes:
- Generic success shape: `{success:true, result, meta}`. Generic error shape: `{success:false, error:{code, context}}` (docs#response-formats).
- HTTP status codes: 400, 401 (bad key or signature), 403 (CDN), 404, 405, 406, 429, 500, 503 (maintenance) (docs#errors).
- Changelog 19.08.26: `GET /v2/profile` no longer accepts API keys.

## 3. Products / instruments

Source: docs#get-list-of-products, docs#product (schema). Shapes confirmed by live check.

`GET /v2/products` (public, weight 3)

Params:
- `contract_types` (CSV: `perpetual_futures`, `futures`, `call_options`, `put_options`, `move_options`, `spot`)
- `states` (`upcoming`, `live`, `expired`, `settled`)
- `expiry` (`YYYY-MM-DD`)
- `after`, `before`, `page_size` (default 100)

`GET /v2/products/{symbol}` returns a single product.

| Field | Meaning / testnet example (BTCUSD, id **84** on testnet; prod docs use id 27) |
|---|---|
| `id`, `symbol` | 84, `BTCUSD`. **Product IDs differ between testnet and prod. Never hardcode them.** |
| `contract_type` | `perpetual_futures`, `futures`, `call_options`, `put_options`, `move_options`, `spot` |
| `contract_value` | `"0.001"`: underlying per contract (BTCUSD 0.001 BTC, ETHUSD 0.01 ETH, SOLUSD 1, XRPUSD 1, DOGEUSD 100) |
| `contract_unit_currency` | `BTC` (the underlying for vanilla contracts) |
| `tick_size` | `"0.1"` (string) |
| `notional_type` | `vanilla` (quote-settled) or `inverse` |
| `settling_asset.symbol` | `USD` for every India perp seen on testnet. The asset network shown is `INR_BANKING`. |
| `initial_margin`, `maintenance_margin` | Percent, for example BTCUSD `"0.5"`, giving a max leverage of 200x. Ticker `leverage` showed 200. The formula max leverage = 100 / initial_margin is **inferred, unconfirmed**. |
| `default_leverage` | `"10"` |
| `max_leverage_notional` | Maximum notional at the highest leverage |
| `position_size_limit` | Integer contracts. Documented as the "maximum size for a single contract order". BTCUSD testnet = 5000. |
| `position_notional_limit` | Maximum notional position, for example `"300000"` |
| `trading_status` | `operational`, `disrupted_cancel_only` or `disrupted_post_only` |
| `state` | `live`, `expired` or `upcoming` |
| `maker_commission_rate`, `taker_commission_rate` | Strings |
| `strike_price`, `settlement_time` | Options and futures only |
| `price_band`, `product_specs`, `spot_index`, `underlying_asset`, `quoting_asset`, `ui_config` | Nested objects |

**Lot size.** `size` is always an **integer number of contracts** ("Integer numbers (like contract size…) are unquoted", docs#numbers). Prices are strings.

**USD notional to contracts** (vanilla, USD-settled):
`contracts = floor(notional_usd / (contract_value × price))`

For example, $500 of BTCUSD at $77,384 works out to 500 / (0.001 × 77384) = 6.46, so 6 contracts, about $464. The fill schema confirms `notional = price × size × contract_value`. Leverage only changes the margin, not the contract count.

A minimum order size field was not found in the product schema. The error `less_than_order_min_size` exists, so the minimum is effectively 1 contract. A per-product minimum above 1 is **unconfirmed**.

Live check: `meta` contains `after`, `before`, `limit` and `total_count`. Testnet had 672 products: about 17 perpetuals and hundreds of BTC/ETH options.

## 4. Orders

Source: docs#place-order, #edit-order, #cancel-order, #place-bracket-order, #edit-bracket-order, #cancel-all-open-orders, #create-batch-orders, #get-order-by-id, #get-order-by-client-oid, #createorderrequest.

| Action | Method and path | Notes |
|---|---|---|
| Place | `POST /v2/orders` | Weight 5 |
| Cancel | `DELETE /v2/orders` body `{id, client_order_id, product_id}` | Cancel by `id` or by `client_order_id` |
| Edit | `PUT /v2/orders` body `{id, product_id or product_symbol, size (total after edit), limit_price, stop_price, trail_amount, post_only, mmp}` | Re-runs risk checks |
| Active orders | `GET /v2/orders?product_ids=&states=open,pending&contract_types=&order_types=&start_time=&end_time=&after=&before=&page_size=` | `product_ids` max 10 |
| By id | `GET /v2/orders/{order_id}` | |
| By client id | `GET /v2/orders/client_order_id/{client_oid}` | |
| Cancel all | `DELETE /v2/orders/all` body `{product_id or contract_types, cancel_limit_orders, cancel_stop_orders, cancel_reduce_only_orders}` | `product_id` takes precedence over `contract_types` |
| Batch create | `POST /v2/orders/batch` `{product_id or product_symbol, orders:[…]}` | Max 50, same product only, **limit orders only, no stop orders, everything treated as GTC (no IOC)**. Weight 25. |
| Batch edit | `PUT /v2/orders/batch` `{product_id, orders:[{id, size, limit_price, post_only, mmp}]}` | |
| Batch cancel | `DELETE /v2/orders/batch` `{product_id, orders:[{id or client_order_id}]}` | |
| Bracket on a position | `POST /v2/orders/bracket` `{product_id, stop_loss_order:{order_type, stop_price, trail_amount, limit_price}, take_profit_order:{order_type, stop_price, limit_price}, bracket_stop_trigger_method}` | No size: it closes the **entire** position. Only **one** bracket per open position, but several per open order. |
| Edit bracket | `PUT /v2/orders/bracket` `{id, product_id, bracket_stop_loss_price, bracket_stop_loss_limit_price, bracket_take_profit_price, bracket_take_profit_limit_price, bracket_trail_amount, bracket_stop_trigger_method}` | `id` is the order id that carries the bracket |
| History | `GET /v2/orders/history` | See section 6 |

**CreateOrderRequest fields**

| Field | Values / notes |
|---|---|
| `product_id` or `product_symbol` | Send one of them |
| `size` | Integer contracts (required) |
| `side` | `buy` or `sell` |
| `order_type` | `limit_order` or `market_order` |
| `limit_price` | String. Since 15.04.26 any value ≤0 is rejected, so omit it or send null when not needed. |
| `stop_order_type` | `stop_loss_order` or `take_profit_order`. `liquidation_order` is system-only. |
| `stop_price` | String trigger |
| `trail_amount` | String. Trailing stop, required if `stop_price` is empty. |
| `stop_trigger_method` | `mark_price`, `last_traded_price` or `spot_price` |
| `bracket_stop_loss_price`, `bracket_stop_loss_limit_price`, `bracket_take_profit_price`, `bracket_take_profit_limit_price`, `bracket_trail_amount`, `bracket_stop_trigger_method` | Attach SL/TP at entry |
| `time_in_force` | `gtc` or `ioc`. **FOK was removed** (01.05.2024). |
| `post_only`, `reduce_only` | Booleans (the schema says string, the samples use bool) |
| `client_order_id` | **Max 32 chars, unique across the user's open orders** (08.10.25, 31.08.26) |
| `mmp` | `disabled` or `mmp1` to `mmp5` |
| `cancel_orders_accepted` | If true, may cancel existing orders on the product to free margin |

**How each order kind is expressed**

| Kind | How |
|---|---|
| Market | `order_type: market_order` |
| Limit | `limit_order` plus `limit_price` |
| Stop-market | `market_order` plus `stop_order_type: stop_loss_order` plus `stop_price` |
| Stop-limit | `limit_order` plus `stop_order_type: stop_loss_order` plus `stop_price` plus `limit_price` |
| Take-profit (market or limit) | Same shapes with `stop_order_type: take_profit_order` |
| Trailing stop | `stop_order_type: stop_loss_order` plus `trail_amount` (no `stop_price`) |

Trailing stop sign: the python client sends `trail_amount` positive for `buy` and **negative for `sell`** (client `place_stop_order`). The docs don't state this rule.

The orders WS exposes `trigger_price_max_or_min` for trailing stops.

**Order response fields:** `id, user_id, size, unfilled_size, side, order_type, limit_price, stop_order_type, stop_price, trail_amount, average_fill_price, bracket_order, bracket_*, cancellation_reason, state (open|pending|closed|cancelled), time_in_force, reduce_only, client_order_id, paid_commission, commission, created_at/updated_at (µs strings), product_id, product_symbol`

There is **no `rejected` state**. A reject comes back as an HTTP 400 `{success:false, error:{code, context}}` and no order is created.

**Place-order error codes worth handling** (docs#place-order-errors; the edit errors mirror these plus `open_order_not_found`):
- `insufficient_margin` (context `additional_margin_required`)
- `less_than_order_min_size`, `order_max_size_exceeded`
- `no_position_for_reduce_only`, `no_position_left_for_reduce_only`
- `immediate_execution_post_only`
- `no_liquidity_for_market_order`, `order_size_exceed_available` (IOC)
- `max_leverage_exceeded`, `leverage_limit_exceeded`, `risk_limits_breached`
- `position_bracket_exist_or_invalid_data`
- `reduce_only_orders_allowed`, `trading_blocked`, `kyc_pending`
- `max_orders_count_exceeded`, `stale_order`, `invalid_contract`, `overlapping_buy_sell_orders` (self-trade)
- `offset_by_reduce_only`

## 5. Positions, leverage, margin

Source: docs#positions, #change-order-leverage, #auto-topup, #add-remove-position-margin, #close-all-positions, #change-margin-mode, changelog 16.10.26, V2 notes.

| Action | Method and path | Body / params |
|---|---|---|
| Real-time position | `GET /v2/positions?product_id=` or `?underlying_asset_symbol=BTC` | Returns `{size, entry_price}` only. This is the fast path. |
| Margined positions | `GET /v2/positions/margined?product_ids=&contract_types=` | Full fields. **Can lag by up to about 10 s after a fill.** |
| Set leverage | `POST /v2/products/{product_id}/orders/leverage` `{"leverage": "10"}` | Returns `{leverage, order_margin, product_id}` |
| Get leverage | `GET /v2/products/{product_id}/orders/leverage` | |
| Add or remove margin | `POST /v2/positions/change_margin` `{product_id, delta_margin:"+/-x"}` | Weight 5 |
| Auto top-up | `PUT /v2/positions/auto_topup` `{product_id, auto_topup: bool}` | Positions inherit the account flag |
| Close all | `POST /v2/positions/close_all` `{close_all_portfolio, close_all_isolated, user_id}` | Since 16.10.26 it **does not cancel open orders**. It skips halted or auction products and lists them in `result.skipped_products[{product_id, product_symbol, reason}]`. The client also sends `close_all_cross`, `product_ids` and `portfolio_index_symbols` (undocumented). |
| Margin mode | `PUT /v2/users/margin_mode` | isolated or portfolio |

- **Close a single position:** there is no dedicated endpoint. Send an opposite-side `market_order` with `reduce_only: true` and `size = abs(position.size)`. This is an inference from the docs and is **unconfirmed** as the official recommendation.
- **Position fields:** `size` (signed: positive is long, negative is short), `entry_price, margin, liquidation_price, bankruptcy_price, adl_level, commission, realized_pnl, realized_funding, realized_cashflow, unrealized_pnl, mark_price, margin_mode, auto_topup, product_id, product_symbol, created_at, updated_at`.

## 6. Wallet, fills, history, transactions

Source: docs#get-wallet-balances, #get-user-fills-by-filters, #get-order-history-cancelled-and-closed, #get-wallet-transactions, #pagination, changelog 13.01.26.

| Endpoint | Params | Weight |
|---|---|---|
| `GET /v2/wallet/balances` | none | 3 |
| `GET /v2/fills` | `product_ids` (≤10), `contract_types`, `start_time`, `end_time` (µs), `after`, `before`, `page_size` | 10 |
| `GET /v2/fills/history/download/csv` | (CSV export) | |
| `GET /v2/orders/history` | `product_ids` (≤10), `contract_types`, `order_types` (`market`, `limit`, `stop_market`, `stop_limit`, `all_stop`), `start_time`, `end_time`, `after`, `before`, `page_size` | 10 |
| `GET /v2/wallet/transactions` | `asset_ids`, `start_time`, `end_time`, `transaction_types` (`funding`, `commission`, `cashflow`, `settlement`, `liquidation_fee`, `deposit`, …), `after`, `before`, `page_size` | 10 |

**Wallet fields:**
- `asset_id, asset_symbol, balance, available_balance, blocked_margin`
- `order_margin, position_margin, commission, portfolio_margin`
- `cross_*`, `trading_fee_credit`, `user_id`
- `meta.net_equity`, `meta.robo_trading_equity`

**Fill fields:**
- `id` (UUID string), `size` (**string** here, but an integer in the WS feed), `price`, `notional`
- `side`, `role` (`maker` or `taker`), `commission` (negative means a rebate)
- `fill_type` (`normal`, `adl`, `liquidation`, `settlement`, `otc`)
- `order_id` (an integer as a string, or a UUID for settlement fills)
- `product_id, product_symbol, settling_asset_symbol, created_at`
- `meta_data` (`order_size`, `order_unfilled_size`, `mark`, `spot`, `source`, and `new_position{size, entry_price, realized_pnl, …}`)

The fill schema has **no `client_order_id`**. Join on `order_id` instead. The WS fill events do carry `c`.

**Pagination:**
- Cursor based. Response `meta.after` and `meta.before` are opaque strings. Pass `after=` for the next page; it becomes null at the end.
- Since 13.01.26, `/orders/history` and `/fills` no longer return `total`, and `page_size` is capped at **50** (planned for 28 Jan 2026; current enforcement is **unconfirmed**).
- Passing more than 10 `product_ids` returns a 4xx.

## 7. WebSocket

Source: docs#websocket-feed, #authenticating, #detecting-connection-drops, #private-channels, #public-channels, changelog 17.04.26 and 14.10.26.

**Connection rules**
- At most 150 connections per IP per 5 minutes. Beyond that you get HTTP 429; back off 5 to 10 minutes.
- **The server disconnects you if there is no activity within 60 s of connecting.**

**Auth** (private socket):
```json
{"type":"key-auth","payload":{"api-key":"KEY","timestamp":1730000000,"signature":"<hex>"}}
```
- `signature = HMAC_SHA256(secret, "GET" + str(timestamp) + "/live")`.
- `timestamp` is epoch seconds as a **number** and must be within 5 s.
- Success reply: `{"type":"key-auth","success":true,"status_code":200,"status":"authenticated"}`.
- Failure statuses: `incomplete_payload` (400), `request_expired` (408), `api_key_not_found` (404), `invalid_signature` (401), `ip_not_whitelisted` (401, message includes the caller IP), `internal_server_error` (500).
- Log out with `{"type":"unauth","payload":{}}`.
- The old `"type":"auth"` method is dead from **31 Oct 2026**.

**Subscribe and unsubscribe**
- Subscribe with `{"type":"subscribe","payload":{"channels":[{"name":"orders","symbols":["all"]}]}}`. The server replies `{"type":"subscriptions","channels":[...]}`, with a per-channel `error` on failure, for example an unauthorized private channel.
- Subscriptions are additive.
- **Snapshots are only sent for explicit symbols, not for `"all"`.**
- Most channels send nothing if `symbols` is omitted.
- `unsubscribe` uses the same shape; omitting `symbols` removes every symbol on that channel.

**Public channels** (public socket):

| Channel | Notes |
|---|---|
| `ticker` (replaces `v2/ticker`) | Every 5 s. Compact keys: `i` product_id, `m` mark, `q` quotes, `g` greeks, `qiv`, `oi`, `ohlc`, `s`, `ts`. Accepts `"BTC-310326"` for a whole option chain. |
| `ob_l1` (replaces `l1_orderbook`) | 100 ms; at least every 5 s. Keys `ap`, `as`, `bp`, `bs`, `sy`, `ts`. |
| `ob_l2` (replaces `l2_orderbook`) | Top 15 levels, 500 ms, at most 100 symbols per connection |
| `ob_updates` (replaces `l2_updates`) | Full-depth incremental |
| `trades` (replaces `all_trades`) | `{p, r, s, sy, t, ts}` |
| `mark_price` | Symbol `MARK:BTCUSD`, every 2 s, `{p, sy, ts}` |
| `candlestick_{1m,3m,5m,15m,30m,1h,2h,4h,6h,12h,1d,1w}` | `{o, h, l, c, v, res, sy, ts}`. `MARK:` prefix gives mark-price candles. |
| `spot_price`, `funding_rate`, `product_updates`, `system_status` | `system_status` covers maintenance and degraded mode |

The legacy channel names are being removed. I did not see an official statement on whether `v2/ticker` still works today (**unconfirmed**), so use `ticker`.

**Private channels**

| Channel | Payload highlights |
|---|---|
| `orders` | `action` (`create`, `update`, `delete`, `snapshot`), `reason` (`fill`, `stop_update`, `stop_trigger`, `stop_cancel`, `liquidation`, `self_trade`), `order_id`, `client_order_id`, `size`, `unfilled_size`, `average_fill_price`, `state`, `cancellation_reason`, `seq_no` (per symbol), `trigger_price_max_or_min`, `bracket_*` |
| `positions` | `action` (`create`, `update`, `delete`, `snapshot`), `reason` (null or `auto_topup`), `size` (signed), `entry_price`, `margin`, `liquidation_price`, `bankruptcy_price` |
| `margins` | Wallet object per asset on every change |
| `user_trades` | Legacy fills feed; includes commission |
| `v2/user_trades` | **Use this one.** It is faster but has no commission. |
| `PortfolioMargins`, `mmp_trigger` | Not needed for now |

**Fill event (`v2/user_trades`)**, the exact documented shape:
```json
{"type":"v2/user_trades","sy":"BTCUSD","f":"1234-abcd-qwer-3456","R":"normal","u":1998,
 "o":3283999,"S":"buy","s":190,"p":"17289.2","po":5,"r":"taker","c":"GA123",
 "t":1685794274866438,"se":4}
```

| Key | Meaning |
|---|---|
| `f` | fill_id |
| `R` | reason: `normal`, `adl` or `liquidation` |
| `o` | order_id |
| `S` | side |
| `s` | contracts |
| `p` | price |
| `po` | position after the fill (contracts) |
| `r` | role |
| `c` | client_order_id |
| `t` | µs timestamp |
| `se` | per-symbol sequence number. It **resets to 1 after a system restart or maintenance**. |

Legacy `user_trades` keys are `fill_id, reason, order_id, side, size, price, role, client_order_id, seq_no, product_id, symbol`.

**Liveness**
- Recommended: send `{"type":"enable_heartbeat"}`. The server then sends `{"type":"heartbeat"}` every 30 s. Reconnect if none arrives within 35 s.
- Alternative: send `{"type":"ping"}` (or a ping frame) about every 30 s and expect `pong` within 5 s.

**Resubscribe**
- The docs say nothing explicit about reconnect. Assume no server-side session persists.
- After every reconnect: `key-auth`, then re-subscribe, then reconcile over REST, because there is no replay.
- Use the `orders` snapshot (`meta.seq_no`) and the `positions` snapshot. Both require explicit symbols to get a snapshot.
- Gap-detect on `se` / `seq_no`.

## 8. Rate limits

Source: docs#rate-limits, docs#get-current-rate-limit-quota.

**REST quota**
- Default quota is **20,000 weight per fixed 5-minute window**, and it resets fully.
- Unauthenticated requests are throttled **per IP**; authenticated requests are throttled **per user ID** (not per key).

| Weight | Endpoints |
|---|---|
| 3 | products, orderbook, tickers, open orders, open positions, balances, candles |
| 5 | place, edit or delete order; add position margin |
| 10 | order history, fills, transaction logs |
| 25 | batch order APIs |
| 1 | everything else |

**Matching-engine limit:** 500 operations per second **per product**. A batch counts as N operations. Breaching this also returns 429, even if the REST quota has room.

**What a 429 looks like:** HTTP `429 Too Many Requests` with the header **`X-RATE-LIMIT-RESET`**, which gives the milliseconds until reset. I did not find a documented body shape (**unconfirmed**).

**Quota check:** `GET /v2/rate_limits/quota` returns `{current_quota, remaining_time_in_milliseconds}`. It needs no auth. Live check: `{"current_quota":18,"remaining_time_in_milliseconds":136753}`. Whether `current_quota` means used or remaining is **unconfirmed**; it looks like used.

The WS connection limit is in section 7. Limit increases are by email request.

## 9. Testnet vs production

Sources: docs#authentication, client README, live checks.

- **Separate accounts and separate keys.** A Demo/testnet key on prod (or the reverse) returns `invalid_api_key`.
- Trading keys on testnet also need IP whitelisting. This is implied, since the docs apply the rule to every Trading key; testnet-specific enforcement is **unconfirmed**.
- Product IDs differ (BTCUSD is 84 on testnet and 27 in the prod docs). Testnet also lists synthetic and tokenised perps (`SILVERUSD`, `NVDAXUSD`, `SPYXUSD`, …) and its own leverage and size limits.
- **Faucet and test funds:** not documented. How a demo account gets its USD balance is **unconfirmed** (likely preloaded or a UI button).
- **Missing endpoints on testnet:** none are documented. Every public endpoint tried worked.
- Testnet REST appears to be cached: `cache-control: public,max-age=60` on `/v2/products`. Do not rely on it for live state.

## 10. Options (later)

Source: docs#get-option-chain, docs#ticker, docs#greeks.

- **Option chain:** `GET /v2/tickers?contract_types=call_options,put_options&underlying_asset_symbols=BTC&expiry_date=DD-MM-YYYY`. Note the date format is DD-MM-YYYY here but YYYY-MM-DD for `/products?expiry=`.
- **Ticker fields:** `greeks{delta, gamma, rho, theta, vega}` (null for perps), `quotes{best_bid, best_ask, bid_size, ask_size, bid_iv, ask_iv, mark_iv}`, `strike_price`, `mark_price`, `oi`, `spot_price`.
- **Symbology:** `C-BTC-90000-310125` / `P-...`, that is type, underlying, strike, ddMMYY. Testnet contract_value is 0.001 BTC; the tick size observed was 0.5.
- **WS:** `ticker` and `mark_price` accept `BTC-DDMMYY` for a whole chain. The `l1ob_c` chain feed is Brotli plus base64.
- **Expired products:** `GET /v2/products?states=expired`. Settlement prices are also available.
- MMP endpoints are `PUT /v2/users/update_mmp` and `/reset_mmp`.

## 11. Gotchas for a copy-trading engine

1. **Integer contracts.** Scale the leader's size into the follower's notional, convert with `contract_value × price`, then `floor`. If the result is 0, skip and log it (`less_than_order_min_size`). Cap the size at `position_size_limit` and check it against `position_notional_limit`.
2. **Price rounding.** Round to `tick_size` (the client has `round_by_tick_size`). Send prices as strings, and **never send `limit_price` ≤ 0 or `""`**. Omit the field for market orders.
3. **Reduce-only closes.** Mirror a leader close as `reduce_only: true` with an opposite-side market order. Expect `no_position_for_reduce_only` or `no_position_left_for_reduce_only` if the follower is already flat (for example after its own SL fired). Treat those as benign. `close_all` does not cancel resting orders, so call `DELETE /v2/orders/all` as well.
4. **Partial fills.**
   - An order stays `open` with `unfilled_size > 0`.
   - IOC leftovers are cancelled.
   - A market order with thin liquidity can be rejected (`no_liquidity_for_market_order`) rather than partially filled. Behaviour on partial book depth is **unconfirmed**.
   - Drive state from `v2/user_trades` (`po` gives the position after the fill) and reconcile with `GET /v2/positions` (real time), not `/positions/margined` (up to 10 s lag).
5. **Rejects are synchronous.** Expect HTTP 400 with `error.code` and `error.context`, and no order is created. Persist the code, map it to user-facing reasons, and do not retry margin or risk rejects blindly.
6. **client_order_id.**
   - Max 32 chars, unique only among **open** orders. After an order closes or is cancelled, the id can apparently be reused, so it is **not** an idempotency key for filled market orders.
   - Use a deterministic id (for example `tl-{followerShort}-{signalShort}`) and, on timeout, query `GET /v2/orders/client_order_id/{id}` before retrying.
   - The error code for a duplicate open `client_order_id` is **unconfirmed**.
7. **Brackets.** Only one bracket per open position. Placing a second returns `position_bracket_exist_or_invalid_data`, so use `PUT /v2/orders/bracket` to move the SL/TP. A position bracket always covers the full size.
8. **Batch limits.** Limit orders only: no market, no stop, no IOC. Max 50 orders, all on the same product. Not useful for fan-out across followers, because each follower has its own key.
9. **Clock.** The 5 s window is tight. Run NTP on the server, compute the timestamp immediately before sending, and never reuse a signature.
10. **Static egress IP.** Every follower's Trading key must whitelist our server IP. Railway's egress IP may not be static, so this needs a static-IP proxy or NAT. Watch IPv4/IPv6 mismatch.
11. **Rate limits are per user.** Each follower has its own quota (good for fan-out), but the matching engine caps at 500 operations per second per product across everyone. Stagger large fan-outs.
12. **WS hygiene.**
    - Respect the 60 s idle disconnect: enable the heartbeat right after connecting.
    - Respect the 150 connections per IP per 5 minutes cap. One socket per follower key from one IP limits fast reconnect storms.
    - On `se` gaps or resets, resync over REST.
13. **Halted products.** `trading_status` values `disrupted_cancel_only` and `disrupted_post_only` mean entries fail. Subscribe to `system_status` and `product_updates`.
14. **Decimal and number types.** `size` is an integer in orders and WS but a **string** in REST `/fills`. Timestamps are µs, either as ISO strings or as integers depending on the endpoint.

## Open questions

1. How do testnet demo accounts get funds (preloaded balance, faucet or UI reset)? Is the current testnet UI `testnet.delta.exchange` or `demo.delta.exchange`?
2. Is IP whitelisting enforced on testnet Trading keys? Can a whitelist use a CIDR range or only single IPs?
3. What error code is returned for a duplicate `client_order_id` among open orders? Is a `client_order_id` from a filled or closed order reusable immediately?
4. Is there a per-product minimum order size other than 1 contract? Is `position_size_limit` a per-order cap or a position cap? The schema text and the field name disagree.
5. What is the exact 429 body, and does `/rate_limits/quota.current_quota` mean used or remaining?
6. Does a market order on a thin book partially fill and cancel the rest, or reject outright?
7. Do legacy `v2/ticker`, `l2_orderbook` and `all_trades` still work on the private socket after 31 Oct 2026? (Plan: assume no.)
8. Is the `page_size` cap of 50 on `/fills` and `/orders/history` live now?
9. Does the trailing-stop sign convention (negative `trail_amount` for sell) come from docs or only from the client?
10. Does `POST /positions/close_all` accept `product_ids` to close a subset? The python client sends it but the docs don't list it.
11. Is the max leverage per product exactly 100 / `initial_margin`, or is there an explicit field (the ticker shows `leverage`)?
