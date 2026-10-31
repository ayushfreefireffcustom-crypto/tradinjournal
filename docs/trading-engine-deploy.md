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

Two additive migrations, applied with `prisma migrate deploy` after `migrate status` and your OK:
- `20261031071652_trading_platform`: new tables only
- `20261031072510_exchange_order_realized_pnl`: one nullable column and an index on `exchange_order`

## Operations

- **Kill switch:** the `system_setting` row `copy.killSwitch` = `{"enabled": true}` stops every copy within about 2 seconds. Fills that arrive while it's on are recorded as skipped and never executed later.
- **Logs:** a heartbeat every minute reports the number of live leader streams.
