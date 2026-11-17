#!/usr/bin/env bash
# Elefin partner onboarding + referral flow — runs elefin-partner.postman_collection.json
# against a DISPOSABLE database and a fake Elefin. Never point TEST_DB_URL at a real
# database: step 1 wipes it.
#
#   Needs: Postgres with the migrations applied at TEST_DB_URL, Redis, the fake Elefin
#     pnpm --filter api exec tsx postman/fake-elefin-server.ts 8997
#   and the API started against TEST_DB_URL with PARTNER_PROGRAM_ENABLED=true,
#   ADMIN_EMAILS=admin@partners.test, IN_PROCESS_SCHEDULER=false, RESEND_API_KEY= (empty),
#   CREDENTIAL_ENCRYPTION_KEY=<64 hex>, ELEFIN_PARTNER_API_URL=http://127.0.0.1:8997/api/v1,
#   ELEFIN_OUTBOUND_IPS="152.55.180.240,162.220.234.242,152.55.180.242".
#   ./run-elefin.sh            (extra args are passed to `postman collection run`)
set -euo pipefail
cd "$(dirname "$0")"

TEST_DB_URL="${TEST_DB_URL:-postgresql://tj@localhost:5444/tradinjournal_partner}"
BASE_URL="${BASE_URL:-http://localhost:4400}"
APP_URL="${APP_URL:-http://localhost:3060}"
FAKE_URL="${FAKE_URL:-http://127.0.0.1:8997}"
PSQL="${PSQL:-$(command -v psql || echo /opt/homebrew/opt/postgresql@18/bin/psql)}"

case "$TEST_DB_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to run: TEST_DB_URL must be a local database (it gets wiped)." >&2; exit 1 ;;
esac

sql() { "$PSQL" "$TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "$1"; }
q() { "$PSQL" "$TEST_DB_URL" -At -c "$1"; }
EMPTY='{}'
fake() { curl -fsS -X POST "$FAKE_URL/__control/$1" -H 'Content-Type: application/json' -d "${2:-$EMPTY}" >/dev/null; }

# Made-up keys for the fake. GOOD works from anywhere; LOCKED only from our server IPs.
GOOD_ID=fxcrm_pk_e2eshash01
GOOD_SECRET=fxcrm_sk_e2egood7Hq2LmX9vRt4Wz8Kd
LOCKED_ID=fxcrm_pk_e2elocked1
LOCKED_SECRET=fxcrm_sk_e2elockedPp3Nn6Bb9Cc2Xx
SEED=40

echo "▸ API and fake Elefin"
curl -fsS "$BASE_URL/health" >/dev/null || { echo "API not reachable at $BASE_URL" >&2; exit 1; }
curl -fsS "$FAKE_URL/__stats" >/dev/null || { echo "Start the fake Elefin: pnpm --filter api exec tsx postman/fake-elefin-server.ts 8997" >&2; exit 1; }

echo "▸ Resetting test data"
sql 'TRUNCATE "user", "verification", "reserved_partner_code", "admin_audit_log", "partner_event", "external_account" CASCADE;'
sql "DELETE FROM system_setting WHERE key = 'partner.program';"

echo "▸ Elefin's side: partner #23's book, one client of another IB"
fake reset
fake key "{\"key\":\"$GOOD_ID\",\"secret\":\"$GOOD_SECRET\"}"
fake key "{\"key\":\"$LOCKED_ID\",\"secret\":\"$LOCKED_SECRET\",\"allowedIps\":[\"152.55.180.240\",\"162.220.234.242\",\"152.55.180.242\"]}"
fake seed "{\"n\":$SEED}"
fake client '{"email":"asha@elefin-e2e.test","status":"active","deposits":500,"lots":2.5}'
fake client '{"email":"eve@elefin-e2e.test","status":"active","deposits":250,"lots":1}'
fake client '{"email":"dev@elefin-e2e.test","status":"active"}'
fake client '{"email":"chen@elefin-e2e.test","status":"suspended","deposits":100,"lots":0.4}'
fake client '{"email":"ben@elefin-e2e.test","status":"active","deposits":300,"partnerId":99}'

node build-elefin-collection.mjs >/dev/null
COLLECTION=elefin-partner.postman_collection.json
VARS=(--env-var "goodKey=$GOOD_ID.$GOOD_SECRET" --env-var "goodKeyId=$GOOD_ID" --env-var "goodSecret=$GOOD_SECRET"
      --env-var "lockedKey=$LOCKED_ID.$LOCKED_SECRET" --env-var "lockedSecret=$LOCKED_SECRET" --env-var "bookSize=$((SEED + 4))")
run() {
  local args=()
  for f in "$@"; do args+=(-i "$f"); done
  postman collection run "$COLLECTION" "${args[@]}" --env-var "baseUrl=$BASE_URL" --env-var "altUrl=${BASE_URL/localhost/127.0.0.1}" \
    --env-var "appUrl=$APP_URL" --env-var "fakeUrl=$FAKE_URL" "${VARS[@]}" $EXTRA
}
EXTRA="$*"

echo "▸ A · admin and partner accounts"
run "01 Bootstrap"
sql "UPDATE \"user\" SET \"emailVerified\" = true WHERE email IN ('admin@partners.test', 'shash@elefin-e2e.test');"

echo "▸ B · application, Elefin key, referred signups"
run "02 Partner joins" "03 Connect Elefin" "04 Referral signups"

# The codes we emailed (no email provider here, so they're read where they're kept).
PID=$(q "SELECT p.id FROM partner p JOIN \"user\" u ON u.id = p.\"userId\" WHERE u.email = 'shash@elefin-e2e.test'")
CODE=$(q "SELECT code FROM partner_code WHERE \"partnerId\" = '$PID' AND \"isPrimary\"")
VARS+=(--env-var "shashPid=$PID" --env-var "shashCode=$CODE")
for u in asha ben chen dev eve; do
  OTP=$(q "SELECT split_part(value, ':', 1) FROM verification WHERE identifier = 'email-verification-otp-$u@elefin-e2e.test' ORDER BY \"createdAt\" DESC LIMIT 1")
  [ -n "$OTP" ] || { echo "No verification code was sent to $u" >&2; exit 1; }
  VARS+=(--env-var "${u}Otp=$OTP")
done

echo "▸ The key is stored encrypted"
PLAIN=$(q "SELECT COUNT(*) FROM partner_broker WHERE \"apiKey\" IS NOT NULL AND \"apiKey\" NOT LIKE 'enc:v1:%'")
LEAK=$(q "SELECT COUNT(*) FROM partner_broker WHERE \"apiKey\" LIKE '%$GOOD_SECRET%' OR \"apiConfig\"::text LIKE '%$GOOD_SECRET%'")
[ "$PLAIN" = 0 ] && [ "$LEAK" = 0 ] || { echo "✗ Elefin key stored in plain text" >&2; exit 1; }
echo "  ✓ encrypted (enc:v1), secret not in the config"

echo "▸ C · traders confirm, lookups, late code, what everyone sees, package, Elefin changes, key off, IPs, disconnect"
run "00 Sign in admin and partner" "05 Traders confirm their email" "06 Late code" "07 Partner and admin see it" "08 A package unlocks for verified clients" \
  "09 Elefin changes a client" "10 Elefin switches the key off" "11 Elefin’s IP allow-list changes" "12 Disconnect"

echo "▸ After disconnecting, the key is gone from the database"
LEFT=$(q "SELECT COUNT(*) FROM partner_broker WHERE broker = 'elefin' AND \"apiKey\" IS NOT NULL")
[ "$LEFT" = 0 ] || { echo "✗ key still stored after disconnect" >&2; exit 1; }
echo "  ✓ no Elefin key stored"
echo "▸ Requests the fake Elefin answered"
curl -fsS "$FAKE_URL/__stats"; echo
