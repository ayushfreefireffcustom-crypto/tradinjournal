# Elefin Partner API — runbook

Partners (IBs at Elefin) paste their Elefin **Partner API key** into TRADElogs. With it we:

1. read their **book** (`/clients`) every 20 minutes for the partner overview — clients,
   funded, deposits, lots, clients gone quiet, new referrals per week; and
2. **verify referred traders**: Elefin's API has no email and no MT5 login field, so the only
   way to tie a TRADElogs trader to a partner's Elefin client is Elefin's lookup —
   `GET /clients/lookup?email=` with the trader's own (confirmed) TRADElogs email.
   `affiliated: true` and status `active` → the trader is **VERIFIED** for that partner,
   which unlocks the partner's packages through the normal access rules.

No new tables and no migration. Code: `apps/api/src/modules/partners/ib/elefin/` (config,
client, schema, probe, store, sync, verify, service, controller); web:
`apps/web/src/components/v6/account/elefin-connect.tsx`, admin page `/admin/partners/elefin`.

## 1. The API (Elefin integration guide, document v2)

| | |
|---|---|
| Base URL | `https://partnersapi.elefin.com/api/v1` (env `ELEFIN_PARTNER_API_URL`) |
| Auth | `Authorization: Bearer {key}.{secret}` — one key per partner, bound server-side |
| Envelope | `{ success, message, data }`; lists: `data.data` rows + `data.meta {current_page, per_page, last_page, total}` |
| Endpoints | `GET /me` (no ability) · `GET /clients` · `GET /clients/lookup?email=` · `GET /clients/{id}` (all `clients.read`) |
| Client object | 13 fields: `client_id, name, country, status (active/suspended/inactive), registered_at, referred_at, referral_code, funding{currency, deposits, first_deposit_at, is_funded}, trading{lots, last_trade_at}` |
| Paging | `per_page` 1–200 (we use 200), `page` from 1, past `last_page` → empty list |
| Incremental | `/clients?updated_from=<ISO>`: clients whose record or activity changed since then |
| Limits | 60 requests/min per key, `X-RateLimit-Limit/Remaining`; 429 + `Retry-After` (s) |
| Errors | 401 bad/expired/deactivated key · 403 no ability or partner gone · 404 not in your book. Only 429 and 5xx are retried. |

## 2. How a partner gets a key

Keys are **not self-service**: the partner asks their Elefin contact for a *Partner API key
for TRADElogs* with the **`clients.read`** permission. Elefin shows it once as
`key.secret`. IP access: "Any", or our outbound IPs (`ELEFIN_OUTBOUND_IPS` on the API so the
dialog lists them). The partner pastes it in TRADElogs → Partner → home or Brokers →
**Connect Elefin** → *Test connection* → *Save and sync*.

## 3. What happens

| Step | Where |
|---|---|
| Probe: `/me` (partner id + name, abilities, expiry, client total, `trades_from`), then `/clients?per_page=1`. Counts and field names only. Nothing is saved unless `clients.read` works. | `probe.ts` |
| Save: key encrypted (`enc:v1:`) in `PartnerBroker.apiKey`; `apiConfig` (`provider: "elefin"`, `v: 2`) holds the `/me` facts, sync state, the cached book and the snapshot. First sync starts (waits ≤ 8 s, then runs on). | `service.ts connect` |
| Sync 1: `/me` — key still works and still has `clients.read`. | `sync.ts` |
| Sync 2: the book — full read once a day (or on connect / admin sync), otherwise `updated_from` = previous run's start − 1 min. Per client we keep only `[deposits, lots, last trade, funded, status, attributed]` keyed by `client_id` — **no names, countries, codes or emails**. Above 20,000 clients only aggregates are kept. Rows not in the documented shape are skipped and counted; mostly-unreadable pages fail the sync and keep the last numbers. | `sync.ts readBook`, `store.ts` |
| Sync 3: traders already matched to a client follow the book — suspended / inactive → held, active again → verified — without another lookup. A matched client missing from a full read is looked up again. | `verify.ts applyRoster` |
| Sync 4: lookups for referred traders, most useful first: never asked → email changed → gone from the book → not found (again after 12 h for traders referred in the last 14 days, weekly after) → verified (weekly re-check). Max 40 per run, 1.1 s apart; a 429 ends the lookups, not the sync. | `verify.ts lookupCandidates` |
| Snapshot: totals, active/suspended/inactive, funded, deposits (summed in cents), lots, quiet (funded + active + no trade in 30 d), never traded, new 7 d / 30 d, referrals per week (8 weeks). | `store.ts snapshotOf` |
| Schedule: `scheduler.ts` every 5 min and `runIbCycle`; each partner due every `ELEFIN_SYNC_MINUTES` (20); ≤ 25 partners per tick, one at a time. | `syncDueElefin` |

Lookups also run outside the sync (`lookupTrader`, at most once per trader per 10 min):
when a referred trader's email is confirmed (`afterEmailVerification`), at signup when the
email is already confirmed (Google), when a trader joins a partner with a code later, and
when they press *retry* on an account.

### Verification model

One **trader-level** `ClientVerification` row per referred trader (no account attached):
`broker "elefin"`, `method "elefin_api"`, status `VERIFIED` / `NOT_FOUND`, `signal`
`elefin-active | elefin-suspended | elefin-inactive | elefin-none`, `ibAccountId
"elefin-client:<client_id>"`, `brokerEmail` = the email asked about, `checkedAt`.

- Package access already counts any `VERIFIED` row of the partner, so a trader verified by
  Elefin qualifies even before connecting an account.
- `verifyAccount` marks the trader's Elefin accounts `VERIFIED` (`method "elefin_email"`)
  from that row, and explains a suspension on them.
- Other sources are never revoked by "Elefin says no": IbAccount list / postback matches
  are recomputed from the list on every check (and win), admin decisions (`method
  "manual"`) always stick, and the lookup never edits a row an admin decided.
- Suspended / inactive at Elefin → not verified (no perks; current perks go into the normal
  grace period), the trader and partner see why.

Safety rails: 401/403 three times in a row → connection **paused** (partner sees "Add your
key again"; numbers and verifications stay). 429 waits Retry-After (≤ 65 s, 3 tries) and is
not an auth failure; 5xx back off 1/2/4 s. Our own budget is `ELEFIN_REQ_PER_MIN` (50) per
key, shared by sync, lookups and tests. "Sync now" once per 2 min per partner; test/connect
6 per 5 min. Base URL must be the configured default, `https://partnersapi.elefin.com`, or
an admin-approved host. Redirects are refused. Disconnect deletes the key and the cached
book; traders verified through Elefin stay verified until a key is connected again.

Secrets and PII: the key is never returned (only `••••` + last 4), never in errors, events
or logs (registered with the logger's redaction). Looked-up emails go only in the query
string to Elefin and are never logged or put in an error; client names never leave the
HTTP response.

Endpoints (all under `/api`):

- Partner: `GET /partner/brokers/elefin`, `POST /partner/brokers/elefin/test {key?, baseUrl?}`,
  `POST /partner/brokers/elefin/connect {key, baseUrl?}`, `POST /partner/brokers/elefin/sync`,
  `DELETE /partner/brokers/elefin`.
- Admin: `GET /admin/partner-program/elefin`, `GET /admin/partners/:id/elefin`,
  `POST /admin/partners/:id/elefin/sync` (full read; also tries a paused connection once).

Env (API): `ELEFIN_PARTNER_API_URL` (default `https://partnersapi.elefin.com/api/v1`),
`ELEFIN_OUTBOUND_IPS`, `ELEFIN_SYNC_MINUTES` (20), `ELEFIN_REQ_PER_MIN` (50). The partner
programme must be on (`PARTNER_PROGRAM_ENABLED`, web `NEXT_PUBLIC_PARTNER_PROGRAM`).

## 4. Live test once a key is provided

Never paste the key in chat, a ticket or a command-line argument. From a shell on a
machine allowed by the key's IP setting:

```sh
read -rs ELEFIN_PROBE_KEY && export ELEFIN_PROBE_KEY            # paste, Enter
pnpm --filter api exec tsx scripts/elefin-probe.ts               # /me + one /clients row
pnpm --filter api exec tsx scripts/elefin-probe.ts --full        # also pages the whole book
pnpm --filter api exec tsx scripts/elefin-probe.ts --lookup you@example.com   # affiliated: true/false only
unset ELEFIN_PROBE_KEY
```

`ELEFIN_PROBE_URL=https://…/api/v1` tries another base URL; `--fake` runs against the
bundled fake server. Output: partner id, abilities, rate limit, expiry, `trades_from`,
client counts and field **names** — never the key, names, emails or other values.

Read the result:

- `OK` → connect it in the partner portal; on `/admin/partners/elefin` check clients > 0,
  then that a referred trader who signed up with the email they use at Elefin shows
  **Verified**.
- `invalid_key` → wrong / expired / deactivated key or IP not allowed (all 401).
- `missing_permission` → ask Elefin for `clients.read` (or the key's partner is gone).
- `Note: Elefin left out … documented fields` → the response differs from the guide; the
  sync skips rows it can't read, so check `schema.ts` against a real row.

## 5. Not settled until a real key is tried

- Whether `/clients/lookup` matches email case-insensitively ("matched exactly"). We send
  the trader's email trimmed and lower-cased.
- How fast `updated_from` reflects new deposits / trades (we also re-read in full daily).
- Field types on real data (numbers as strings, timestamps without `Z`): parsing coerces
  numbers and accepts any `Date.parse`-able timestamp; unreadable rows are counted in the
  sync event (`skippedRows`).

Tests: `pnpm --filter api test src/modules/partners` (fake server: `elefin/__tests__/fake-elefin.ts`
implements the guide), plus `PARTNERS_TEST_DB=…` for the DB integration test.
