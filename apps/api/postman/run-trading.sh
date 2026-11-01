#!/usr/bin/env bash
# Trading platform contract tests (Z5): the Postman collection built by
# build-trading-collection.ts, against the local test API (launch config
# "api-trading-test": port 4200, test DB, scheduler off, ADMIN_EMAILS=admin@trading.test).
#
# Nothing is wiped: the run signs up two users with a fresh tag, and deletes
# only those users' rows at the end. The admin password is read from
# .env.trading-test.local and handed to the runner, never printed.
#
#   ./run-trading.sh            (extra args are passed to `postman collection run`)
set -euo pipefail
cd "$(dirname "$0")"

TEST_DB_URL="${TEST_DB_URL:-postgresql://tj@localhost:5444/tradinjournal_test}"
BASE_URL="${BASE_URL:-http://localhost:4200}"
APP_URL="${APP_URL:-http://localhost:3040}"  # must match the API's CORS_ORIGIN
PSQL="${PSQL:-$(command -v psql || echo /opt/homebrew/opt/postgresql@18/bin/psql)}"
ENV_FILE="../../../.env.trading-test.local"

case "$TEST_DB_URL" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to run: TEST_DB_URL must be a local test database." >&2; exit 1 ;;
esac
case "$BASE_URL" in
  http://localhost*|http://127.0.0.1*) ;;
  *) echo "Refusing to run: BASE_URL must be the local test API." >&2; exit 1 ;;
esac

sql() { "$PSQL" "$TEST_DB_URL" -v ON_ERROR_STOP=1 -q -c "$1"; }

echo "▸ API health"
curl -fsS "$BASE_URL/health" >/dev/null || { echo "API not reachable at $BASE_URL" >&2; exit 1; }

ADMIN_PASSWORD="$(sed -n 's/^TEST_USER_PASSWORD=//p' "$ENV_FILE" | tr -d '"'"'"'')"
[ -n "$ADMIN_PASSWORD" ] || { echo "No TEST_USER_PASSWORD in $ENV_FILE" >&2; exit 1; }

TAG="pm$(date +%s)"
A_EMAIL="$TAG-a@pm-trading.test"
B_EMAIL="$TAG-b@pm-trading.test"
cleanup() {
  echo "▸ Removing this run's users ($TAG)"
  local ids="SELECT id FROM \"user\" WHERE email IN ('$A_EMAIL', '$B_EMAIL')"
  sql "DELETE FROM journal_entry WHERE \"userId\" IN ($ids); DELETE FROM ai_conversation WHERE \"userId\" IN ($ids); DELETE FROM price_alert WHERE \"userId\" IN ($ids); DELETE FROM trader_strategy WHERE \"userId\" IN ($ids); DELETE FROM \"user\" WHERE email IN ('$A_EMAIL', '$B_EMAIL');" || true
}
trap cleanup EXIT

(cd .. && npx tsx postman/build-trading-collection.ts)
COLLECTION=trading-platform.postman_collection.json
VARS=(--env-var "baseUrl=$BASE_URL" --env-var "appUrl=$APP_URL" --env-var "aEmail=$A_EMAIL" --env-var "bEmail=$B_EMAIL" --env-var "adminPassword=$ADMIN_PASSWORD")

echo "▸ 01 Bootstrap users"
postman collection run "$COLLECTION" -i "01 Bootstrap users" "${VARS[@]}" --bail

echo "▸ Marking this run's emails verified"
sql "UPDATE \"user\" SET \"emailVerified\" = true WHERE email IN ('$A_EMAIL', '$B_EMAIL');"

echo "▸ 02–10 Contract tests"
postman collection run "$COLLECTION" \
  -i "02 Sign in and access" -i "03 Account" -i "04 Feedback" -i "05 Strategies" -i "06 Paper runs" \
  -i "07 Marketplace" -i "08 Alerts, screens and journal" -i "09 Trading desk and API keys" -i "10 Exchanges, copy trading and options" \
  "${VARS[@]}" "$@"
