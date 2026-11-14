# TRADElogs (tradinjournal)

**TRADElogs is an AI-powered trading journal for MetaTrader 5.** Connect a broker
account with the read-only investor password and every trade syncs and is
journaled automatically. On top of the journal:

- **AI coach** that answers from your own trades, grades and journal notes.
- **Ask your journal** — plain-language questions answered with a chart from your fills.
- **Process grades (A–F)** on every closed trade, from fixed, documented rules
  (after two losses, within 15 min of a loss, oversized, losing hour, past −1.25R).
- **Leaks ranked by $** — the habits and segments that cost the most, with what-ifs.
- **Trade review and trade log** — each trade on the candles, similar trades, notes.
- **AI news ranking**, **SignalX / Trader Master levels** on any chart, and the
  **macro regime** (growth × inflation) with the drivers behind it.

Live at [www.tradelogs.com](https://www.tradelogs.com). Numbers are only shown
when they can be computed from the account's real trades.

## Monorepo layout

```
tradinjournal/
├─ apps/
│  ├─ api/          Express + TypeScript HTTP backend (the main app)
│  ├─ worker/       BullMQ background workers (ingestion, reconstruction, metrics)
│  ├─ mt5-bridge/   Python + FastAPI service wrapping the MetaTrader5 library (read-only)
│  └─ web/          Next.js app (landing page + the journal)
└─ packages/
   ├─ core/         Pure domain logic — trade reconstruction & metrics (no I/O, unit-tested)
   ├─ db/           Prisma schema, client, migrations
   ├─ contracts/    Zod request/response schemas shared by api & worker
   ├─ types/        Shared enums / DTOs / domain types
   ├─ config/       Env loading + validation (zod)
   ├─ logger/       winston logger factory
   └─ queue/        BullMQ queue + connection factory
```

## Tech stack

- **Monorepo:** pnpm workspaces + Turborepo
- **Backend:** Node.js 22 + Express + TypeScript (strict)
- **Database:** PostgreSQL + TimescaleDB + pgvector (via Prisma)
- **Auth:** better-auth
- **Queue:** BullMQ on Redis
- **Validation:** Zod
- **Logging:** winston + morgan
- **Broker connector:** Python + FastAPI using the official `MetaTrader5` library

## Getting started

```bash
# install all workspace dependencies
pnpm install

# start infrastructure (Postgres + Redis)
docker compose up -d

# run the API in dev mode
pnpm --filter @tradinjournal/api dev
```

See `.env.example` for required environment variables.

### Preview without a backend

```bash
NEXT_PUBLIC_USE_MOCKS=true NEXT_DIST_DIR=.next-mock pnpm --filter web dev
```

Mock mode serves `apps/web/src/app/data/**` instead of the API. The insights pages
(dashboard, analytics, trade log, trade review) run the API's own pure compute
(`apps/api/src/modules/insights`) over a seeded synthetic trade book, so the
preview matches what the live pages compute. Those routes return 404 outside mock mode.

### Checks

```bash
pnpm lint                          # eslint in every package (web adds React hooks + Next rules)
pnpm -r typecheck
pnpm --filter @tradinjournal/web test
```
