#!/usr/bin/env bash
# Partner programme contract tests — runs the Postman collection against a
# DISPOSABLE database. Never point TEST_DB_URL at a real database: step 1 wipes it.
#
#   1. Start the API against the test DB (Claude launch config "api-partner-test",
#      or the env block printed by `run.sh --env`).
#   2. ./run.sh
set -euo pipefail
cd "$(dirname "$0")"

TEST_DB_URL="${TEST_DB_URL:-postgresql://tj@localhost:5444/tradinjournal_test}"
BASE_URL="${BASE_URL:-http://localhost:4100}"
PSQL="${PSQL:-$(command -v psql || echo /opt/homebrew/opt/postgresql@18/bin/psql)}"

case "$TEST_DB_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to run: TEST_DB_URL must be a local database (it gets wiped)." >&2; exit 1 ;;
esac

sql() { "$PSQL" "$TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "$1"; }

echo "▸ API health"
curl -fsS "$BASE_URL/health" >/dev/null || { echo "API not reachable at $BASE_URL" >&2; exit 1; }

echo "▸ Resetting test data"
sql 'TRUNCATE "user", "verification", "reserved_partner_code", "admin_audit_log" CASCADE;'

# Simulates "client c1 connects MT5" the moment c1 is referred. Test DB only.
sql 'CREATE OR REPLACE FUNCTION partner_test_connect() RETURNS trigger AS $$
BEGIN
  IF (SELECT email FROM "user" WHERE id = NEW."userId") = '"'c1@partners.test'"' THEN
    INSERT INTO broker_account (id, "userId", broker, "mt5Login", server, "marginMode", "updatedAt", password)
    VALUES ('"'test_ba_'"' || NEW."userId", NEW."userId", '"'Test Broker'"', 900001, '"'Test-Server'"', '"'HEDGING'"', now(), '"'x'"')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS partner_test_connect ON referral;
CREATE TRIGGER partner_test_connect AFTER INSERT ON referral FOR EACH ROW EXECUTE FUNCTION partner_test_connect();'

node build-collection.mjs >/dev/null
COLLECTION=partners.postman_collection.json

echo "▸ 01 Bootstrap users"
postman collection run "$COLLECTION" -i "01 Bootstrap users" --env-var "baseUrl=$BASE_URL" --bail

echo "▸ Marking test emails verified"
sql "UPDATE \"user\" SET \"emailVerified\" = true WHERE email LIKE '%@partners.test';"

echo "▸ 02–05 Contract tests"
postman collection run "$COLLECTION" \
  -i "02 Partner setup" -i "03 Attribution" -i "04 Portal reads" -i "05 Admin operations" \
  --env-var "baseUrl=$BASE_URL" "$@"
