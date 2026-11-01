# Trading engine: deploy notes

The copy-trading engine (`apps/engine`) is a separate Railway service. It keeps a
private WebSocket open per leader account and places copies on followers' exchange
accounts. Nothing here is live until you set `TRADING_ENABLED=true`.

## Railway service

| Setting | Value |
|---|---|
| Root / build | Same monorepo as the API |
| Start command | `pnpm --filter @tradinjournal/engine start` (runs under `tsx`, like the API) |
| Instances | 1. A second instance waits on a Postgres advisory lock and takes over only if the first stops. |
| Static outbound IPs | **On** (Settings → Networking). These are the IPs users whitelist on their exchange API keys. |
| Region | Keep the same region as the database. The static IPs belong to the region, so moving regions changes them. |

## Environment variables (names only)

| Variable | Service | Notes |
|---|---|---|
| `DATABASE_URL` | engine | Same database as the API |
| `CREDENTIAL_ENCRYPTION_KEY` | engine, API | **Must equal the API's value.** Never rotate it: stored exchange keys would become unreadable. |
| `TRADING_ENABLED` | engine, API | `true` turns on `/api/exchanges` and the engine. Default off. |
| `EXCHANGE_LIVE_ENABLED` | engine, API | `true` allows real-money (LIVE) connections. Leave off for testnet only. |
| `EXCHANGE_EGRESS_IPS` | API | Comma list of the engine's static outbound IPs, shown on the Connect screen. The API also calls the exchange (verify, equity), so give the API service static IPs too, or list both services' IPs. |
| `EXCHANGE_MAX_CONNECTIONS` | API | Optional, default 8 |

## Database

Seven additive migrations, applied with `prisma migrate deploy` after `migrate status` and your OK:
- `20261031071652_trading_platform`: new tables only
- `20261031072510_exchange_order_realized_pnl`: one nullable column and an index on `exchange_order`
- `20261031120000_copy_follow_risk_and_profit_cap`: three nullable columns on `copy_follow`
- `20261031130000_copy_follow_copy_open`: one nullable column on `copy_follow`
- `20261101090000_notification_inbox_and_groups`: a nullable `archivedAt` on `notification` and a `groups` JSON column (default `{}`) on `notification_preference`. Not trading-only: the inbox and per-type settings need it whether or not trading is on
- `20261101100000_leader_stat_top3_share`: two nullable columns on `leader_stat`. The engine fills them on its next stats pass (every 5 minutes)
- `20261101110000_telegram_link`: two new tables, `telegram_link` and `telegram_link_code`, both cascading on user delete

## Telegram alerts (optional)

1. Create a bot with @BotFather and note its token and username.
2. On the API service set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` (no @) and `TELEGRAM_WEBHOOK_SECRET` (random, 16+ characters). With any of them missing, Telegram is simply not offered.
3. Point the bot at the API once, from any terminal:
   `curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" -d url=https://api.tradelogs.com/api/telegram/webhook -d secret_token=$TELEGRAM_WEBHOOK_SECRET -d allowed_updates='["message"]'`
4. Users connect from Settings › Notifications › Telegram. Alerts go out every 30 seconds from the API's scheduler; each notification is sent once, and only those created after the chat was linked.

## Operations

- **Kill switch:** the `system_setting` row `copy.killSwitch` = `{"enabled": true}` stops every copy within about 2 seconds. Fills that arrive while it's on are recorded as skipped and never executed later.
- **Kill switch from the app:** Admin › Copy trading (`/admin/copy`) turns it on (a reason is required) and off; both are audited.
- **Leaders:** new applications wait in the review queue on `/admin/copy`. Approve, reject, pause, resume and remove from there; the people affected are notified.
- **Health:** the engine writes a heartbeat to the `system_setting` row `copy.engineHeartbeat` every minute. The Engine tab on `/admin/copy` shows it as down after 3 minutes without one, with 24 h copy counts, delays, slippage and the top reasons copies didn't go through.
- **Live updates:** `GET /api/follows/stream` (server-sent events). Each API instance runs one 2 s change check for all open streams. If a proxy buffers responses, pages still refresh every 60 s.
- **Push and email:** with `TRADING_ENABLED`, the API's in-process scheduler (`IN_PROCESS_SCHEDULER`) sends trading notifications by push and email every 30 s to users who turned those on.
- **Logs:** a heartbeat every minute reports the number of live leader streams.
