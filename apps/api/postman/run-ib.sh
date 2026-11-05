#!/usr/bin/env bash
# IB partner flow tests — runs ib-partner.postman_collection.json against a DISPOSABLE
# database. Never point TEST_DB_URL at a real database: step 1 wipes it.
#
#   Needs: Postgres with the migrations applied at TEST_DB_URL, Redis, the fake MT5
#   bridge on :8999 (node fake-bridge.mjs 8999), and the API started against TEST_DB_URL
#   with PARTNER_PROGRAM_ENABLED=true, ADMIN_EMAILS=admin@partners.test,
#   INTERNAL_API_TOKEN=partner-test-internal-token, MT5_BRIDGE_URL=http://127.0.0.1:8999.
#   ./run-ib.sh            (extra args are passed to `postman collection run`)
set -euo pipefail
cd "$(dirname "$0")"

TEST_DB_URL="${TEST_DB_URL:-postgresql://tj@localhost:5444/tradinjournal_partner}"
BASE_URL="${BASE_URL:-http://localhost:4300}"
APP_URL="${APP_URL:-http://localhost:3060}"
PSQL="${PSQL:-$(command -v psql || echo /opt/homebrew/opt/postgresql@18/bin/psql)}"

case "$TEST_DB_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to run: TEST_DB_URL must be a local database (it gets wiped)." >&2; exit 1 ;;
esac

sql() { "$PSQL" "$TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "$1"; }
VARS=()
run() {
  local args=()
  for f in "$@"; do args+=(-i "$f"); done
  postman collection run "$COLLECTION" "${args[@]}" --env-var "baseUrl=$BASE_URL" --env-var "altUrl=${BASE_URL/localhost/127.0.0.1}" \
    --env-var "appUrl=$APP_URL" ${VARS[@]+"${VARS[@]}"} $EXTRA
}
q() { "$PSQL" "$TEST_DB_URL" -At -c "$1"; }

echo "▸ API and fake bridge"
curl -fsS "$BASE_URL/health" >/dev/null || { echo "API not reachable at $BASE_URL" >&2; exit 1; }
curl -fs -o /dev/null http://127.0.0.1:8999/__stats || { echo "Start the fake bridge: node fake-bridge.mjs 8999" >&2; exit 1; }

echo "▸ Resetting test data"
sql 'TRUNCATE "user", "verification", "reserved_partner_code", "admin_audit_log", "partner_event", "external_account" CASCADE;'
sql "DELETE FROM system_setting WHERE key = 'partner.program';"

node build-ib-collection.mjs >/dev/null
COLLECTION=ib-partner.postman_collection.json
EXTRA="$*"
verify_emails() { sql "UPDATE \"user\" SET \"emailVerified\" = true WHERE email LIKE '%@partners.test';"; }

# Postman CLI can't carry variables between runs, so each stage signs in again and
# the IDs it needs come from the database.
echo "▸ A · users"
run "01 Bootstrap users"
verify_emails

echo "▸ B · application, broker list, referred signups"
run "02 Partner application" "03 Broker IB connection" "04 Referred signups"
verify_emails

PID=$(q "SELECT p.id FROM partner p JOIN \"user\" u ON u.id = p.\"userId\" WHERE u.email = 'honey@partners.test'")
CODE=$(q "SELECT code FROM partner_code WHERE \"partnerId\" = '$PID' AND \"isPrimary\"")
XL=$(q "SELECT id FROM partner_broker WHERE \"partnerId\" = '$PID' AND broker = 'xellion'")
VARS=(--env-var "honeyPid=$PID" --env-var "honeyCode=$CODE" --env-var "xlId=$XL")

echo "▸ C · verification, packages, locks, review, grace"
run "00 Sign in all" "05 Client verification" "06 Packages and access" "07 Feature locks" "08 Admin review" "09a Grace and suspension"

echo "▸ Moving grace ends into the past"
sql "UPDATE client_entitlement SET \"graceUntil\" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE status = 'GRACE';"
VARS+=(--env-var "pkgStarter=$(q "SELECT id FROM partner_package WHERE \"partnerId\" = '$PID' AND name = 'Starter'")")
for u in t1 t2 t3; do
  VARS+=(--env-var "${u}Acc=$(q "SELECT b.id FROM broker_account b JOIN \"user\" u ON u.id = b.\"userId\" WHERE u.email = '$u@partners.test'")")
done

echo "▸ D · after grace, join later, consent, admin, disconnect"
run "00 Sign in all" "09b After grace" "10 Join later, consent, partner views" "11 Super admin" "12 Disconnect" \
  "13 Broker integrations" "14 MT4 and other platforms" "15 Partner tools" "16 Package moderation" "17 Reports"

end_limited() { sql "UPDATE partner_package SET \"endsAt\" = (now() AT TIME ZONE 'UTC') - interval '1 minute' WHERE name = 'Limited';"; }

echo "▸ E · custom date ranges, package end dates"
run "00 Sign in all" "18a Custom ranges" "18b Package end dates"
echo "▸ Moving Limited's end into the past"
end_limited
run "00 Sign in all" "18c After the last day"
echo "▸ Its new last day passes too"
end_limited
run "00 Sign in all" "18d The last day passes"

echo "▸ Broker API keys are never stored in plain text"
sql "SELECT COUNT(*) AS plain_api_keys FROM partner_broker WHERE \"apiKey\" IS NOT NULL AND \"apiKey\" NOT LIKE 'enc:v1:%';"
