# Elefin Partner API — runbook

Partners (IBs at Elefin) paste their Elefin **Partner API key** into TRADElogs. We then read
their clients and MT5 accounts every 20 minutes, keep the partner's Elefin list (`IbAccount`)
in step, and the existing verification turns referred traders whose connected Elefin MT5
login is on that list into **VERIFIED** — which unlocks the partner's packages through the
normal access rules. No new tables: the connection lives on `PartnerBroker` (broker
`elefin`, method `API`, key encrypted in `apiKey`, everything else in `apiConfig` with
`provider: "elefin"`).

Code: `apps/api/src/modules/partners/ib/elefin/` (config, client, fields, probe, sync,
service, controller), web: `apps/web/src/components/v6/account/elefin-connect.tsx`,
admin page `/admin/partners/elefin`.

## 1. How a partner gets a key

1. Elefin partner area → **API keys**. If there is no such page, the partner asks their
   Elefin account manager for a *Partner API key for TRADElogs* (Elefin admins create keys
   under Developer → API keys).
2. Key settings at Elefin:
   - **Type**: a partner key (scoped to that partner — "reads any account" must stay off).
   - **Abilities** (minimum): read **clients** and read **client trading accounts**.
     Profile/"me" is optional (labels the connection with the partner id).
   - **Field permissions**: the MT5 **login** field on trading accounts is required.
     Email is optional (PII, off by default at Elefin) — we verify by login; email only
     adds a review signal. Deposits / volume / last trade are optional activity.
   - **Rate limit**: default 60/min is fine — we stay under 30/min per key.
   - **IP access**: "Any", or allow-list our outbound IPs (set `ELEFIN_OUTBOUND_IPS` on the
     API service so the connect dialog shows them).
   - **Expiry**: anything; an expired key pauses syncing after 3 refusals and the partner
     is asked to add a new one.
3. Copy the token (shown once) as `key.secret` and paste it in TRADElogs → Partner → home or
   Brokers → **Connect Elefin** → *Test connection* → *Save and sync*.

## 2. What happens

| Step | Where |
|---|---|
| Probe: first page of clients + accounts (+ profile), abilities, field names, totals. Nothing is saved unless MT5 logins are readable. | `probe.ts` |
| Save: key encrypted (`enc:v1:`), config + paths that answered stored, first sync started (waits ≤ 8 s, then runs on). | `service.ts connect` |
| Sync: page clients + accounts (page/per_page, cursor, `links.next`; Laravel `{success,data:{data,meta}}`), merge by login, join emails by client id, `applyRows(replace)`, activity columns, `BrokerEvent kind=elefin_sync`. | `sync.ts` |
| Verify: first sync → `recheckPartner(partner,'elefin')` + `recomputePartner`; later syncs → `recheckLogin` per added/removed/changed login + `recomputeUser`. | existing `ib.service` / `access.service` |
| Schedule: `scheduler.ts` every 5 min (leader only) and `runIbCycle`; each partner is due every `ELEFIN_SYNC_MINUTES` (20); ≤ 25 partners per tick, one at a time. | `syncDueElefin` |

Safety rails: 401/403 three times in a row → connection **paused** (partner sees "Add your
key again", list kept, clients keep their status). A sync that would remove more than half
of ≥ 5 accounts is held until a second sync agrees. 429 waits Retry-After (≤ 65 s, 3 tries)
and is not counted as an auth failure. "Sync now" once per 2 min per partner; test/connect
6 per 5 min. Base URL must be the configured default, `*.elefin.com` over https, or an
admin-approved host (Programme settings → API hosts). Redirects and off-origin next links
are refused. Disconnect deletes the key; the last list stays as a plain list.

Secrets: the key is never returned (only `••••` + last 4), never in errors or events, and
is registered with the logger's redaction (also `Bearer …`, `X-API-Key/X-API-Secret`).

Endpoints (all under `/api`):

- Partner: `GET /partner/brokers/elefin`, `POST /partner/brokers/elefin/test {key?, baseUrl?}`,
  `POST /partner/brokers/elefin/connect {key, baseUrl?}`, `POST /partner/brokers/elefin/sync`,
  `DELETE /partner/brokers/elefin`.
- Admin: `GET /admin/partner-program/elefin`, `GET /admin/partners/:id/elefin`,
  `POST /admin/partners/:id/elefin/sync` (also tries a paused connection once).

Env (API): `ELEFIN_PARTNER_API_URL` (default `https://my.elefin.com/api/v1`),
`ELEFIN_OUTBOUND_IPS`, `ELEFIN_SYNC_MINUTES` (20), `ELEFIN_REQ_PER_MIN` (30). The partner
programme must be on (`PARTNER_PROGRAM_ENABLED`, web `NEXT_PUBLIC_PARTNER_PROGRAM`).

## 3. Live test once a key is provided

Never paste the key in chat, a ticket or a command line argument. From a shell on a
machine allowed by the key's IP setting:

```sh
read -rs ELEFIN_PROBE_KEY && export ELEFIN_PROBE_KEY      # paste, Enter
pnpm --filter api exec tsx scripts/elefin-probe.ts        # what "Test connection" sees
pnpm --filter api exec tsx scripts/elefin-probe.ts --full # also reads every page
unset ELEFIN_PROBE_KEY
```

Optional: `ELEFIN_PROBE_URL=https://…/api/v1` for another base URL, `--paths
accounts=/trading-accounts,clients=/clients` to try other paths, `--fake` for a dry run
against the bundled fake server. Output is counts, abilities, which paths answered and
field **names** only — never the key, names, emails or logins.

Read the result:

- `OK` with `Login seen: yes` → connect it in the partner portal (or let the partner do it).
  Then check on `/admin/partners/elefin` that accounts > 0 and that a referred trader with
  an Elefin MT5 login on that list shows **Verified** on the partner's client list.
- `invalid_key` → wrong/expired key or IP not allowed (Elefin answers 401 for all three).
- `missing_permission` / `no_logins` → ask Elefin to tick the missing ability or the
  `login` field (the output says which).
- `Paths: (none answered)` with 404s → the paths differ; see below.

## 4. If Elefin's paths or fields differ

Everything we assume is in `apps/api/src/modules/partners/ib/elefin/config.ts`:

- `ELEFIN_PATHS` — candidate paths per resource, tried in order (first non-404 wins and is
  stored per connection). Add the real path at the front.
- `ELEFIN_FIELDS` — field names per meaning (login, email, client id, nested accounts,
  deposits, lots, last trade, platform). Add the real name at the front.
- Envelope and pagination are detected in `fields.ts readPage` (Elefin's documented
  `{success, data:{data, meta}}` plus `links.next`, cursors and plain arrays).

Existing connections keep the paths found at connect time: after changing paths, ask the
partner to *Replace key* (or re-connect) so the probe runs again. Re-run
`pnpm --filter api test src/modules/partners` (and with `PARTNERS_TEST_DB=…` for the DB
integration test) after any change; the fake server in `elefin/__tests__/fake-elefin.ts`
can be pointed at the new paths with `new FakeElefin({ paths: { accounts: '/…' } })`.
