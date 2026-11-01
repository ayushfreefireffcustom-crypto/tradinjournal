# Options research (G1), 2 Nov 2026

Checked from this Mac (India) against the public APIs; no keys needed for market data.

## Delta Exchange India (our venue)

- **What's listed:** European options on BTC (504 contracts), ETH (274) and XAUT (66). Expiries for BTC: dailies (next 3 days), Friday weeklies, last-Friday monthlies and the next quarterly (e.g. 021126, 031126, 041126, 061126, 131126, 201126, 271126, 251226, 290127). Symbols are `C-BTC-99000-271126` / `P-…` (strike, DDMMYY). Settlement is in USD at 16:00 UTC (`settlement_time` on the product).
- **Contract:** `contract_value` 0.001 BTC (0.01 ETH), price quoted in USD per 1 unit of the underlying, `tick_size` 0.1 (BTC). Premium per contract = price × 0.001.
- **Chain in one call:** `GET /v2/tickers?contract_types=call_options,put_options&underlying_asset_symbols=BTC` returns every contract with `mark_price`, `quotes` (best bid/ask with sizes, `bid_iv`, `ask_iv`, `mark_iv`), `greeks` (delta, gamma, theta per day, vega per 1 vol point, rho), `oi_contracts`, `oi_value_usd`, `volume`, `turnover_usd`, `mark_change_24h` (%), `oi_change_usd_6h`, `spot_price`, `strike_price`, `product_id`. Greeks are per 1 unit of the underlying.
- **Order book:** `GET /v2/l2orderbook/{symbol}?depth=N` (`buy`/`sell` with price, size in contracts).
- **Candles:** `GET /v2/history/candles?symbol=…&resolution=…&start=&end=`. Prefixes work: `MARK:` (mark price), `OI:` (open interest). There is **no IV history** (`IV:` is empty), so IV charts are derived from mark candles and the index (`.DEXBTUSD`, the `spot_index` on the product) with Black-Scholes.
- **Fees (product):** taker/maker `0.0001` of notional, capped by `premium_commission_rate` 0.035 (3.5 % of premium). Short options margin from `initial_margin` (1 %) / `maintenance_margin` (0.5 %) plus the scaling in `product_specs`.
- **Testnet** (`cdn-ind.testnet.deltaex.org`) lists the same expiries (BTC 331, ETH 216, XAUT 120 contracts) with its own product ids, so multi-leg orders can be tested there.
- **Orders:** the existing adapter already maps `call_options`/`put_options` to CALL/PUT and places orders by symbol. Delta's batch endpoint only takes orders for one product, so a multi-leg basket is placed leg by leg, with the result of each leg reported and no automatic unwinding without the user saying so.

## Other venues

| Venue | Public options data from India | Notes |
|---|---|---|
| Deribit | Reachable (`/api/v2/public/get_book_summary_by_currency?kind=option`) | Deepest BTC/ETH book; inverse (coin-settled) contracts |
| Bybit | Reachable (`/v5/market/tickers?category=option`) | USDC options on BTC/ETH/SOL |
| Binance (eapi) | Timed out | Blocked from here, like Binance futures |
| OKX | Timed out | Blocked from here |

Decision: build on Delta India only (same venue as perps and the connected accounts). Deribit/Bybit could feed a later "compare IV across venues" view; not needed for G2–G11.

## How the parts map

- G2–G5: chain, columns, contract panel and overview all come from the one tickers call (cached ~10 s) plus the order book on demand.
- G6–G8: legs, payoff and analysis are computed in `@tradinjournal/core/options` (Black-Scholes with each leg's mark IV), so the numbers match between the builder, replay and anything server-side.
- G9: price, mark and OI candles from Delta; IV, rolling ATM straddle and strangle premium are computed from mark candles.
- G10: replay reprices the legs along the recorded underlying path with time decay to expiry.
- G11: orders through the connected Delta account (testnet first), behind `TRADING_ENABLED`; live money still needs `EXCHANGE_LIVE_ENABLED`.
