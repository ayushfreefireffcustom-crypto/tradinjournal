# Deploying TRADElogs

How a release goes out: what runs where, what to check before pushing, the order
to do things in, every environment variable by name, how to check it worked and
how to back out. Values never go in this file or in the repo; they live in each
Railway service's Variables tab.

Production: web at `www.tradelogs.com`, API at `api.tradelogs.com`, database on
Neon. Railway deploys `main` on every push, but it **does not run database
migrations**: those are applied by hand, first (see step 1).

Engine-specific detail (static IPs, the kill switch, leader review, health) is in
[docs/trading-engine-deploy.md](docs/trading-engine-deploy.md).

## What runs where

| Service | Code | Start command (Railway service settings) | Health |
|---|---|---|---|
| web | `apps/web` | `pnpm --filter web build`, then `pnpm --filter web start` | the site loads |
| api | `apps/api` | `pnpm --filter api start` (runs `src/main.ts` under `tsx`; the shared packages ship as TypeScript) | `GET /health` → `{"data":{"status":"ok"}}` |
| worker | `apps/worker` | as set in Railway today (cron jobs: sync, calendar, news, alerts, weekly review) | its logs show the crons ticking |
| engine (new) | `apps/engine` | `pnpm --filter @tradinjournal/engine start` (also `tsx`) | heartbeat on Admin › Copy trading › Engine |
| MT5 bridge | separate host | unchanged | `MT5_BRIDGE_URL` answers |

The engine is new on this branch: it is a fourth Railway service from the same
repo, one instance, with static outbound IPs on. It isn't needed for anything
until `TRADING_ENABLED=true`.

## Before you push

Run these locally against the test database (never the `.env` one: that's production):

```bash
export DATABASE_URL=postgresql://tj@localhost:5444/tradinjournal_test DIRECT_URL=postgresql://tj@localhost:5444/tradinjournal_test TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test
pnpm -r typecheck
pnpm --filter @tradinjournal/api test
pnpm --filter @tradinjournal/engine test
pnpm --filter @tradinjournal/core test
pnpm --filter @tradinjournal/web test
```

With the local test API running (launch config `api-trading-test`):

```bash
apps/api/postman/run-trading.sh
```

The API suite includes the security checks that should never be skipped: the
access matrix (every route, anonymous / other user / non-admin), rate limits on
exchange routes, the trading audit trail and secrets-in-logs.

## Release order

1. **Migrations on Neon.** Additive only (new tables and nullable or defaulted
   columns), so the code that's live now keeps working on the new schema.
   `prisma migrate status` against Neon, read the SQL of each pending migration,
   then `prisma migrate deploy`, then check row counts of the big tables are
   unchanged. The pending list and what each one adds are in
   [docs/trading-engine-deploy.md › Database](docs/trading-engine-deploy.md#database).
   The account-security migration must be on Neon **before** the API deploys:
   the two-factor plugin reads `user.twoFactorEnabled` on every sign-in.
2. **Environment variables.** Set any new ones below on each service before the
   code that reads them deploys. Flags stay off for now.
3. **Push `main`.** Railway rebuilds web, api and worker.
4. **Engine service.** Create it once (settings in the engine notes), then it
   redeploys with every push like the others.
5. **Check it worked** (below).
6. **Turn things on**, one at a time, checking after each: `TRADING_ENABLED` on
   the API and engine; Telegram (set the three variables, then `setWebhook`);
   `PLANS_ENABLED` only when plans are meant to apply. `EXCHANGE_LIVE_ENABLED`
   is Ayush's call alone and stays off until he flips it.

## Neon migration checklist

Do these by hand, in order, and stop at the first surprise. Nothing here runs
without someone choosing to run it.

1. Take a Neon branch (or a point-in-time restore marker) first, so there is a
   way back that doesn't depend on the migrations.
2. Point a shell at Neon **for this step only**, using the direct (non-pooled)
   URL for both variables:
   ```bash
   cd packages/db
   export DATABASE_URL='<neon direct url>' DIRECT_URL='<neon direct url>'
   npx prisma migrate status
   ```
   Expect exactly the pending list in the engine notes (10 as of 2 Nov 2026:
   trading_webhooks, exchange_history_import, api_keys, indicator_alerts,
   saved_screens, strategies, strategy_deployments, account_security,
   marketplace, watchlist_lists). Anything else pending, or a "drift" warning: stop.
3. Read each pending `prisma/migrations/<name>/migration.sql`. As of 2 Nov they
   hold 19 `CREATE TABLE`s and 7 `ADD COLUMN`s, every added column nullable or
   with a default, and no `DROP`, `TRUNCATE`, `DELETE`, `RENAME` or
   `SET NOT NULL`. Re-check with:
   ```bash
   grep -ciE '\bDROP\b|TRUNCATE|DELETE FROM|ALTER COLUMN|RENAME|SET NOT NULL' prisma/migrations/2026110{1,2}*/migration.sql
   ```
4. Row counts before:
   ```bash
   psql "$DIRECT_URL" -c 'select (select count(*) from "user") users, (select count(*) from trade) trades, (select count(*) from execution) executions, (select count(*) from broker_account) accounts, (select count(*) from exchange_connection) exchanges, (select count(*) from exchange_order) orders;'
   ```
5. `npx prisma migrate deploy`
6. `npx prisma migrate status` says up to date; the row counts from step 4 are
   unchanged; `select count(*) from "user" where "twoFactorEnabled" is null`
   is 0.
7. `unset DATABASE_URL DIRECT_URL` and close the shell, so nothing else in it
   points at production.

Never `prisma migrate dev`, `db push` or `migrate reset` against Neon, and never
`prisma format` (it rewrites the whole schema file).

## Environment variables (names only)

`new` marks variables added on the trading-platform branch.

### API (`apps/api`)

| Area | Variables |
|---|---|
| Core | `NODE_ENV`, `API_HOST`, `API_PORT`, `APP_URL`, `CORS_ORIGIN`, `AUTH_URL`, `AUTH_SECRET`, `LOG_LEVEL` |
| Database and cache | `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL` |
| Sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` |
| Admins | `ADMIN_EMAILS`, `MACRO_ADMIN_EMAILS` |
| Internal calls (worker → API) | `INTERNAL_API_TOKEN`, `API_INTERNAL_URL`, `IN_PROCESS_SCHEDULER` |
| Encryption | `CREDENTIAL_ENCRYPTION_KEY` (64 hex characters; must equal the engine's; **never rotate**: stored exchange keys and broker passwords would become unreadable) |
| MT5 | `MT5_BRIDGE_URL`, `MT5_BRIDGE_SHARED_SECRET`, `SYNC_BATCH`, `SYNC_CONCURRENCY`, `SYNC_STALE_MIN`, `SYNC_BACKGROUND_MIN`, `SYNC_OVERLAP_DAYS`, `SYNC_FIRST_WAIT_MS`, `TRADE_SYNC_CRON` |
| Access gate | `PLATFORM_ACCESS_ENABLED` (true = Elefin clients only), `ELEFIN_VERIFY_MODE` (`broker` default: an MT5 account on an Elefin server), `ACCESS_REQUIRE_ACTIVITY` (new, default false), `ACCESS_MIN_TRADES_7D`, `ACCESS_ACTIVITY_WINDOW_DAYS`, `ELEFIN_API_URL`, `ELEFIN_API_KEY` |
| Trading | `TRADING_ENABLED`, `EXCHANGE_LIVE_ENABLED`, `EXCHANGE_EGRESS_IPS` (new), `EXCHANGE_MAX_CONNECTIONS` (new), `TRADINGVIEW_IP_ALLOWLIST` (new) |
| Plans | `PLANS_ENABLED`, `PLAN_ASSIGNMENTS` (new) |
| Telegram | `TELEGRAM_BOT_TOKEN` (new), `TELEGRAM_BOT_USERNAME` (new), `TELEGRAM_WEBHOOK_SECRET` (new) |
| Partner programme | `PARTNER_PROGRAM_ENABLED`, `PARTNER_SELF_SIGNUP`, `PARTNER_COOKIE_DAYS`, `PARTNER_CLICK_LIMIT`, `PARTNER_MAX_CODES`, `PARTNER_MAX_CHANNELS`, `PARTNER_STATS_STALE_MIN` |
| AI | `AI_PROVIDER`, `AI_MODEL`, `AI_FAST_MODEL`, `AI_BASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `SEARCH_PROVIDER`, `SEARCH_FALLBACK_MODEL`, `TAVILY_API_KEY` |
| Weekly review | `WEEKLY_REVIEW_CRON`, `WEEKLY_REVIEW_CONCURRENCY`, `WEEKLY_REVIEW_PER_MINUTE` |
| Push | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| Market data | `BINANCE_REST_URL`, `BINANCE_FUTURES_REST_URL`, `BINANCE_WS_URL`, `DERIBIT_REST_URL`, `TWELVEDATA_API_KEY`, `MARKET_CANDLE_CACHE_TTL`, `MARKET_WARM_SYMBOLS`, `MARKET_WARM_CRON`, `PRICE_ALERT_CRON` |
| Calendar and news | `CALENDAR_PROVIDER_PRIORITY`, `CALENDAR_INGEST_CRON`, `FOREXFACTORY_FEED_URL`, `TRADINGVIEW_CALENDAR_ENABLED`, `FINNHUB_API_KEY`, `FMP_API_KEY`, `NEWS_RSS_FEEDS`, `NEWS_INGEST_CRON`, `NEWS_ENRICH_CRON`, `NEWS_ENRICH_MAX_PER_TICK`, `MARKETAUX_API_KEY`, `CRYPTOPANIC_API_KEY`, `NOTIFICATIONS_DIGEST_CRON` |
| Macro and Trader Master | `FRED_API_KEY`, `MACRO_INGEST_CRON`, `MACRO_STATE_CACHE_TTL`, `TRADER_ML_URL`, `TRADER_GRADE_CRON`, `TRADER_GRADE_BATCH`, `TRADER_PAPER_CRON`, `TRADER_META_TRAIN_CRON`, `TRADER_LGBM_TRAIN_CRON`, `BENZINGA_API_KEY`, `SANTIMENT_API_KEY`, `UNUSUAL_WHALES_API_KEY` |

### Engine (`apps/engine`, new service)

`DATABASE_URL`, `DIRECT_URL`, `CREDENTIAL_ENCRYPTION_KEY` (same value as the
API; the engine refuses to start without a valid one), `TRADING_ENABLED`,
`EXCHANGE_LIVE_ENABLED`, `LOG_LEVEL`, `NODE_ENV=production` (JSON logs). Nothing
else is read by the engine.

Delta's hosts are fixed per environment in `packages/exchange` (testnet or
live, chosen per connection); there is nothing to set for them.

### Worker (`apps/worker`)

The shared config plus `REDIS_URL`, `INTERNAL_API_TOKEN`, `API_INTERNAL_URL` and
the `*_CRON` schedules above. Nothing new on this branch.

### Web (`apps/web`)

`NEXT_PUBLIC_API_URL`, `API_ORIGIN`, `NEXT_PUBLIC_TRADING` (shows the trading
pages; pair it with the API's `TRADING_ENABLED`), `NEXT_PUBLIC_PARTNER_PROGRAM`,
`NEXT_PUBLIC_SUPPORT_WHATSAPP` (new, optional). `NEXT_PUBLIC_USE_MOCKS` and
`NEXT_DIST_DIR` are for local work only and stay unset in production.

## Check it worked

- `curl -fsS https://api.tradelogs.com/health` answers `ok`.
- Sign in on `www.tradelogs.com` (with and without two-factor), open Settings ›
  Security and Settings › Activity: the sign-in shows with this device.
- `GET /api/me/plan` answers (everyone on Free while `PLANS_ENABLED` is off).
- Engine: Admin › Copy trading › Engine shows a heartbeat under a minute old.
- TradingView: send one test alert and check the IP in the webhook log is
  TradingView's, not Railway's (the API trusts the last `X-Forwarded-For` hop).
- Logs: spot-check a few error lines; secrets appear as `[redacted]`, never in full.

## Backing out

- Redeploy the previous deployment from Railway's Deployments tab. The
  migrations are additive, so the older code runs on the newer schema; don't
  roll migrations back.
- `TRADING_ENABLED=false` removes the exchange, copy-trading, desk, webhook,
  API-key (`/api/v1`) and option-order routes at once (they answer 404).
- The copy kill switch (Admin › Copy trading, or the `copy.killSwitch` system
  setting) stops all copying within about 2 seconds without a redeploy.

## Secrets

- Exchange keys and broker passwords are stored encrypted (`enc:v1:`) and only
  ever decrypted in the API's and engine's memory. Every decrypted value is
  registered with the logger and masked by value in all output, on top of
  masking by field name and shape.
- Never paste a `.env` file or a variable's value into a chat, ticket or commit.
  `.env` in the repo root points at production.
