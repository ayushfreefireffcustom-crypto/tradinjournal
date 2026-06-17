# tradinjournal

A Forex / MT5 trading journal — connect your broker (read-only), auto-sync your trades, and get
analytics, journaling, and AI coaching.

> **Status:** project scaffolding. Structure and tooling are in place; feature code is built in phases.

## Monorepo layout

```
tradinjournal/
├─ apps/
│  ├─ api/          Express + TypeScript HTTP backend (the main app)
│  ├─ worker/       BullMQ background workers (ingestion, reconstruction, metrics)
│  ├─ mt5-bridge/   Python + FastAPI service wrapping the MetaTrader5 library (read-only)
│  └─ web/          Frontend (left empty for now)
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
