# MirrorPip-X → TRADElogs port notes (B0.1, B0.2, B0.3, B0.11)

Written 31 Oct 2026 from a line-by-line read of `~/Desktop/mirrorpip-x` (commit `cbc0840`).
Companion reports: `exchange-api-delta.md`, `exchange-api-global.md`, `exchange-api-india.md`.

## 1. What MirrorPip-X (MPX) is made of

| Piece | Files | Lines | Port? |
|---|---|---|---|
| Exchange interface | `packages/exchange/src/types.ts` | 174 | Yes, extended (below) |
| Delta India adapter | `packages/exchange/src/delta.ts` | 505 | Yes, with fixes |
| Secret vault | `packages/exchange/src/crypto.ts` | 61 | **No.** Use our `apps/api/src/lib/secrets.ts` (`enc:v1:`, hex key). MPX uses a different format and a base64 key. |
| Exchange registry | `packages/exchange/src/registry.ts` | 23 | Yes (display name, availability, required fields) |
| Engine loop | `apps/engine/src/main.ts` | 66 | Yes |
| Leader watchers | `watchers.ts` | 129 | Yes, with fixes |
| Fan-out | `fanout.ts` | 349 | Yes, with fixes |
| Sizing (pure) | `sizing.ts` + test | 63 | Yes, with fixes |
| Position math (pure) | `position.ts` + test | 77 | Yes as is (well tested) |
| Stats (pure) | `stats.ts` + test | 42 | Yes |
| Reconcile | `reconcile.ts` | 191 | Yes, rewritten for scale |
| Kill switch | `killswitch.ts` | 14 | Yes (we already have `SystemSetting`) |
| Web API + service | `apps/web/src/app/api/**`, `lib/services/copy.ts` | ~1,400 | Re-implemented as Express routes (section 5) |

## 2. The Delta adapter (`delta.ts`), as built

- **REST signing:** `HMAC_SHA256(secret, METHOD + timestamp_seconds + path + query + body)` as hex, sent in `api-key`, `signature`, `timestamp` headers plus a `User-Agent` (Delta rejects requests without one).
- **Endpoints used:**

  | Purpose | Call |
  |---|---|
  | Balances, account id | `GET /v2/wallet/balances` (`user_id` on each row is the stable account id) |
  | Positions | `GET /v2/positions/margined` |
  | Recent fills (backfill) | `GET /v2/fills?page_size=50` |
  | Order | `POST /v2/orders` with `market_order`, `time_in_force: ioc`, `reduce_only`, `client_order_id` |
  | Products | `GET /v2/products` (cached 10 min, symbol → id, `contract_value`, `contract_unit_currency`) |
  | Mark price | `GET /v2/tickers/{symbol}` |

- **WebSocket:** connect → send `{type:'auth', payload:{api-key, signature, timestamp}}`, where the signature covers `GET + ts + '/live'`. **Subscribe only after** the `Authenticated` success message (subscribing earlier silently delivers nothing). Channel `user_trades` (verbose; `v2/user_trades` uses one-letter keys). `enable_heartbeat`, app-level `ping` every 25 s, idle watchdog 40 s → reconnect. Delta closes idle private sockets about every 10 minutes.
- **Verified fill payload** (testnet): `{type:"user_trades", action:"fill", symbol:"BTCUSD", side:"buy", size:1, price:"75560", fill_id:"…", timestamp:<microseconds>}`.
- **Sizes are integer contracts.** BTCUSD is 0.001 BTC per contract. MPX rounds to the nearest contract (it used to floor, which dropped closes like 0.997 → 0).
- **Endpoints come from env at call time** (`DELTA_REST_URL`, `DELTA_WS_URL`), not module load. ESM import hoisting otherwise pins production before dotenv runs. Keep this.

Checked live today against testnet (public GETs only): `/v2/products?contract_types=perpetual_futures` returns 17 live perps; `BTCUSD` is product 84; tickers work.

## 3. The copy engine, as built

1. **Engine loop:** every 5 s, sync the watcher set: one WebSocket per VERIFIED leader with at least one ACTIVE follow. Every 30 s, reconcile.
2. **On a leader fill:**
   1. Upsert `LeaderFill`, unique on `(leaderId, externalId)`; a duplicate frame (P2002) is recovered.
   2. Kill switch or leader-not-verified → write a `SKIPPED` copy order per follow, so the fill is never executed late.
   3. Leader equity comes from the latest equity point (≤ 90 s old), else a live read.
   4. Per follow, isolated with `allSettled`:
      1. Copy-from-now guard: skip fills older than the follow's `startedAt`.
      2. INR guard.
      3. Idempotency on `clientOrderId = mpx:{exchange}:{followId}:{fillId}`.
      4. Resolve the instrument across venues (base asset match, perp only).
      5. Daily loss guard.
      6. Read follower equity.
      7. `computeSize`.
      8. Re-check leader status.
      9. Claim a `PENDING` CopyOrder.
      10. Place a market IOC order.
      11. Update the order with status, fill and slippage in bps.
      12. `applyFill` to the CopyPosition.
3. **Reconnect backfill:** replay the 50 most recent fills through the same idempotent fan-out.
4. **Reconcile (every 30 s):**
   - Mark open copy positions with public mark prices.
   - Snapshot leader equity.
   - Recompute leader stats for the 7d/30d/all windows.
   - Retry fills from the last 24 h that have an ACTIVE follow but no CopyOrder.
5. **Auth failure:** the credential goes INVALID, its follows PAUSE, and the user gets a notification. This all happens in one transaction.

Sizing modes:

| Mode | Base units |
|---|---|
| `PROPORTIONAL` | `leaderQty × leaderMult × (followerEquity / leaderEquity) × value` |
| `MULTIPLIER` | `leaderQty × leaderMult × value` |
| `FIXED_MARGIN` | `value / price` |

All three are clamped by `maxPositionUsd / price`, then divided by the follower's contract multiplier.

## 4. Gaps and bugs to fix while porting

Severity: **H** = can lose money or mis-size orders; **M** = wrong data or degrades over time; **L** = polish.

| # | Sev | Where | Problem | Fix in our port |
|---|---|---|---|---|
| G1 | H | `fanout.ts` daily-loss guard | It sums **all-time** realized P&L of the follow, not today's. Once lifetime losses pass the limit, the follow is skipped forever. Unrealized loss is ignored. | Sum realized P&L for fills since 00:00 in the user's timezone (or UTC), plus current unrealized. Pause the follow and notify, instead of silently skipping. |
| G2 | H | `placeMarketOrder` | IOC market orders can **partially fill**. The rest is dropped and the follower stays under-sized. `SUBMITTED` is never resolved. | After placing, poll `GET /v2/orders/{id}` until terminal (or listen on the private `orders` channel). Store the remainder; optionally top up once. |
| G3 | H | sizing + rounding | Each fill is rounded to whole contracts independently. A leader building a position in 5 small fills can make every scaled copy round to 0 (all skipped), or round 1.5 → 2 (+33%). Closes can then not match opens. | Carry a per-(follow, symbol) **residual** of unrounded size so the totals track the leader. For reduce-only closes, size from the follower's actual open qty in proportion to the share of the leader's position being closed. |
| G4 | H | positions | The follower position is derived only from our own copy fills. Manual closes, liquidations, or a user trading the same account cause **drift**. A later copy close can then over-close or flip. | Reconcile CopyPosition against `GET /v2/positions/margined` every cycle. Always send closes as `reduce_only` capped at the real exchange size. Flag drift to the user. |
| G5 | M | `getAccount` | Equity sums `balance` across **all assets**, mixing units (USD + INR + BTC rows). | Use Delta's equity / available-margin figure for the settling asset, converting other assets to USD. |
| G6 | M | `maxPositionUsd` | Clamps each **order**, not the resulting position. Ten fills can build 10× the cap. | Clamp `existing notional + new` against the cap. |
| G7 | M | `reconcile.ts` | Writes a `LeaderEquityPoint` every 30 s per leader **forever** (~2,900 rows/day each). Stats reload all points and all copy orders every 30 s. | Store at most 1 point per 5 min (and roll up to hourly after 7 days). Compute stats incrementally, or every 5 min from aggregates. |
| G8 | M | `verify()` | It always returns `canTrade: true`. A read-only key passes and then fails on the first order. | Detect trade permission explicitly (see the Delta report). Fail verify with a clear message. |
| G9 | M | backfill | Only the last 50 fills. A long outage (or a busy leader) loses fills. | Page `/v2/fills` with a cursor back to the last ingested `exchTs`, capped at 24 h. |
| G10 | M | auth errors | Detected with a regex; `ip_not_whitelisted_for_api_key` is treated as a generic failure. | Map Delta error codes to typed errors: `AUTH`, `IP_NOT_WHITELISTED`, `INSUFFICIENT_MARGIN`, `RATE_LIMIT`, `SIZE_TOO_SMALL`. Show actionable messages. |
| G11 | M | leverage | Follower leverage and margin mode are never set. Copies use the account default, so risk differs from the leader's. | On follow, set leverage per product (`/v2/products/{id}/orders/leverage`) to the follow's chosen value. Expose it in the follow settings. |
| G12 | M | fees | The `commission`/`fees` columns are never filled. P&L excludes fees. | Read fees from the follower's own fills (private `user_trades`, or `/v2/fills` by order id). |
| G13 | L | `recordSkip` | The `exchange` default is hard-coded to `DELTA_INDIA`. | Pass the follower's exchange (already done in callers; drop the default). |
| G14 | L | notifications | Only "credential invalid" notifies. Rejected orders, skipped fills and the loss limit are silent. | Notify every trading event (TODO C6). |
| G15 | L | engine | Watchers live in memory in one process. Two instances double-subscribe; the unique `clientOrderId` makes this safe but wasteful. | Take a Postgres advisory lock per leader (or a single-leader lock for the engine) so only one instance owns a leader. |
| G16 | L | kill switch | Global only. | Add per-user and per-follow pause (exists as follow status) plus a per-exchange switch. |

## 5. Mapping onto TRADElogs

**Where code goes**
- `packages/exchange` (new workspace package `@tradinjournal/exchange`): types, Delta adapter, registry, error types. No crypto inside; callers pass decrypted creds.
- `apps/engine` (new app): long-lived WebSocket watchers + fan-out + reconcile. It **needs a DB connection**, unlike `apps/worker`, which only calls `/internal` routes, because the hot path can't afford an HTTP hop per fill. Runs under `tsx` like the API (see the memory note on multi-file packages).
- `apps/api/src/modules/exchanges/` (connections), later `modules/copy/` (leaders, follows), `modules/admin` additions.
- Encryption: `apps/api/src/lib/secrets.ts`. The engine needs the same helper, so move `encryptSecret`/`decryptSecret` into a shared package (`packages/config` or a small `packages/secrets`) during B2, keeping the `enc:v1:` format and the same `CREDENTIAL_ENCRYPTION_KEY` (never rotate).

**Naming** (we already have `Trade`, `Execution`, `BrokerAccount`, `Notification`, `SystemSetting`):

| MPX model | TRADElogs model | Notes |
|---|---|---|
| `ExchangeCredential` | `ExchangeConnection` | `userId`, `exchange`, `label`, `apiKeyEnc`, `apiSecretEnc` (`enc:v1:`), `keyLast4`, `keyFingerprint` (HMAC), `accountRef`, `environment` (`TESTNET`/`LIVE`), `canTrade`, `status`, `lastError`, `lastVerifiedAt` |
| `Leader` | `CopyLeader` | |
| `Follow` | `CopyFollow` | Adds `leverage`, `dailyLossLimitUsd` (fixed per G1), `residual` per symbol (G3), `timezone` for day boundaries |
| `LeaderFill` | `LeaderFill` | |
| `CopyOrder` | `CopyOrder` | Add `remainingQty`, `fees`, `errorCode` |
| `CopyPosition` | `CopyPosition` | Add `exchangeQty`, `driftDetectedAt` |
| `LeaderStat`, `LeaderEquityPoint` | same | Downsampled (G7) |
| `Notification`, `SystemSetting` | **reuse ours** | Kill switch key: `copy.killSwitch` |

**Route map** (MPX Next route → our Express route)

| MPX | TRADElogs | Phase |
|---|---|---|
| `GET /api/exchanges` | `GET /api/exchanges/catalog` | B3 |
| `POST/GET /api/credentials`, `DELETE /api/credentials/[id]` | `POST/GET /api/exchanges/connections`, `DELETE /api/exchanges/connections/:id`, plus `POST /:id/verify` | B3 |
| `GET /api/leaders`, `GET /api/leaders/[id]` | `GET /api/copy/leaders`, `GET /api/copy/leaders/:id` | C3 |
| `POST /api/leaders/apply` | `POST /api/copy/leaders/apply` | C3 |
| `GET/POST /api/follows`, `PATCH/DELETE /api/follows/[id]` | `GET/POST /api/copy/follows`, `PATCH/DELETE /api/copy/follows/:id` | C3 |
| `GET /api/follows/stream`, `/[id]/stream` (SSE) | `GET /api/copy/follows/stream` (SSE via the existing Redis pub/sub in `lib/pubsub.ts`) | C4 |
| `admin/leaders`, `admin/kill-switch`, `admin/users/[id]/stop-copying` | `/api/admin/copy/leaders`, `/api/admin/copy/kill-switch`, `/api/admin/users/:id/stop-copying` | C5 |
| `notifications`, `account/*`, `auth`, `usage`, `geo`, `demo/otp` | already exist in TRADElogs | none |

Every new route uses `requireAuth` + `requirePlatformAccess`, `validateBody` with schemas in `@tradinjournal/contracts`, and `perUserRateLimit` on anything that calls an exchange (Z2).

## 6. B0.11: reusable market code in TRADElogs

- `packages/core/src/trader/indicators.ts` has `sma`, `ema`, `rsi`, swing points, level clustering and trend classification, with tests. It is the seed for the E1 indicator engine, but each function returns only the **last** value. E1 needs series versions (`number[]` in, `(number|null)[]` out).
- `apps/api/src/lib/market/providers/binance.ts`: REST klines plus a reconnecting kline WebSocket, normalized to `NormalizedCandle` (epoch ms). Reusable for the analytics engine's crypto candles.
- `apps/api/src/lib/market/stream.ts`: ref-counted live feeds (`acquireLive`/`releaseLive`) fanned out through Redis. This is the right place to add a Delta candle provider later (Delta has `candlesticks` on its public WebSocket and `/v2/history/candles`).
- `apps/api/src/lib/market/flow/deribit-options.ts`: existing options data fetches, useful for Phase 5 (options).

## 7. Testnet keys

MPX keeps Delta keys only encrypted in its database, not in `.env`. The key in `mirrorpip-x/.env` does **not** decrypt either the local DB rows (Test Leader `…I1qG`, Test Follower `…Ae5p`) or the hosted rows (Leo `…I1qG`, Fay `…xk9G`). The hosted DB's key is set in Railway (MPX project), and the Railway CLI is logged out on this machine.

To unblock live testnet tests, do **one** of these:
1. Put the MPX Railway `CREDENTIAL_ENCRYPTION_KEY` into `mirrorpip-x/.env`, and the copy script decrypts Leo and Fay into `tradinjournal/.env.delta-testnet.local` (git-ignored, mode 600).
2. Create two new API keys on testnet.delta.exchange (read + trade, **no withdrawals**) and put them in `.env.delta-testnet.local` as `DELTA_LEADER_KEY/SECRET` and `DELTA_FOLLOWER_KEY/SECRET`.

Either way, the keys must whitelist this machine's current public IP (**104.28.198.17** on 31 Oct; it changes) or have no IP restriction. MPX's production keys whitelist its Railway static IPs `208.77.246.240–242`.
