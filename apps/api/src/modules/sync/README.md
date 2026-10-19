# Trade sync

Trading data is read from Postgres, not the MT5 bridge. The bridge is only used
to *pull new deals* into the `execution` table.

## Flow
- **Sync** (`sync.service.ts`) — leases the account row (`syncLockedUntil`, one
  sync per account across all API instances), fetches deals from
  `lastDealAt − SYNC_OVERLAP_DAYS` (whole history the first time), inserts them
  with `skipDuplicates`, bumps `dataVersion` only when something new arrived.
  Failures set `lastSyncError` + `syncRetryAt` (15 min, or 24 h for a rejected
  password → `status = ERROR`) and never touch stored data.
- **Queue** (`sync.queue.ts`) — in-process, one entry per account, user-facing
  (`high`) ahead of background (`low`), `SYNC_CONCURRENCY` at a time.
- **Reads** (`account-data.ts`) — `interactive` (pages: first load waits for the
  backfill, later loads answer from the DB and refresh in the background once
  older than `SYNC_STALE_MIN`), `background`, `readonly`. Rebuilt trades/stats
  are memoised per `(account, dataVersion)`.
- **Triggers** — account connect / password update (high), "Sync now"
  (`POST /api/accounts/:id/sync`, clears back-off), stale page reads, and the
  scheduler: every 5 min it queues up to `SYNC_BATCH` accounts older than
  `SYNC_BACKGROUND_MIN` (in-process scheduler or the worker's `trade-sync` cron →
  `POST /internal/sync/run`).

## Deploying
1. Apply migration `20261019180000_trade_sync`.
2. Deploy API + worker.
3. Pre-import history off-peak: `pnpm --filter api exec tsx scripts/backfill-trade-sync.ts`.

## Tests
`src/modules/sync/__tests__` — mapping parity with live reconstruction, queue
ordering, and a DB integration suite (set `PARTNERS_TEST_DB`). Postman folder
"06 Trade sync" covers the HTTP behaviour with the bridge offline.
