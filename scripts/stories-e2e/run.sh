#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

TEMPLATE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$TEMPLATE/../.." && pwd)"
cd "$ROOT"
test "$(id -u)" -ne 0

for program in ffmpeg ffprobe openssl timeout; do
  command -v "$program" >/dev/null
done

PG_INIT="$(command -v initdb || true)"
if [ -z "$PG_INIT" ] && [ -d /usr/lib/postgresql ]; then
  PG_INIT="$(find /usr/lib/postgresql -path '*/bin/initdb' -type f | sort -V | tail -n 1)"
fi
test -n "$PG_INIT"
PG_BIN="$(dirname "$PG_INIT")"
test -x "$PG_BIN/pg_ctl"

AVAILABLE_KB="$(df -Pk /tmp | awk 'NR==2 {print $4}')"
if [ "$AVAILABLE_KB" -lt 262144 ]; then
  echo 'STOP: в /tmp меньше 256 МБ свободного места'
  exit 1
fi

RUN_OUT="$ROOT/.test-artifacts/stories-e2e/run-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$RUN_OUT"
SANDBOX="$(mktemp -d /tmp/ya-stories-db.XXXXXXXX)"
mkdir -m 700 "$SANDBOX/socket" "$SANDBOX/tls"
PG_STARTED=0

pgctl() {
  env -i PATH="$PATH" HOME="$HOME" LANG=C "$PG_BIN/pg_ctl" "$@"
}
cleanup() {
  rc=$?
  trap - EXIT INT TERM
  if [ "$PG_STARTED" -eq 1 ] || [ -f "$SANDBOX/data/postmaster.pid" ]; then
    if ! pgctl -D "$SANDBOX/data" -m fast -w stop >"$RUN_OUT/postgres-stop.log" 2>&1; then
      echo "WARNING: временный PostgreSQL не подтвердил остановку: $SANDBOX"
      echo "ARTIFACTS: $RUN_OUT"
      exit 1
    fi
    echo 'ISOLATED_POSTGRES_STOPPED'
  fi
  if [ "$rc" -eq 0 ]; then
    case "$SANDBOX" in
      /tmp/ya-stories-db.*) rm -rf -- "$SANDBOX" ;;
      *) echo 'STOP: unexpected sandbox'; exit 1 ;;
    esac
  else
    echo "FAILED_SANDBOX_RETAINED: $SANDBOX"
  fi
  echo "TEST_RUNNER: $TEMPLATE/run.sh"
  echo "ARTIFACTS: $RUN_OUT"
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 1 \
  -subj '/CN=localhost' \
  -keyout "$SANDBOX/tls/key.pem" -out "$SANDBOX/tls/cert.pem" \
  >"$RUN_OUT/tls-generation.log" 2>&1

env -i PATH="$PATH" HOME="$HOME" LANG=C \
  "$PG_INIT" -D "$SANDBOX/data" -U stories_test_owner \
  --auth-local=trust --auth-host=reject \
  --no-locale --encoding=UTF8 >"$RUN_OUT/initdb.log" 2>&1

pgctl -D "$SANDBOX/data" -l "$RUN_OUT/postgres.log" \
  -o "-c listen_addresses='' -c unix_socket_directories='$SANDBOX/socket' -p 55448 -c max_connections=12 -c shared_buffers=16MB" \
  -w start
PG_STARTED=1

if [ -z "${YA_BROWSER_MODES:-}" ]; then
  YA_BROWSER_MODES='["stories-guest-chat","stories-guest-auth","stories-live-320","stories-live-390","stories-live-1280"]'
fi

timeout --signal=TERM --kill-after=15s 240s \
  env -i PATH="$PATH" HOME="$HOME" LANG=C \
  YA_SANDBOX="$SANDBOX" YA_OUT="$RUN_OUT" YA_TLS_DIR="$SANDBOX/tls" \
  YA_BROWSER_FILE="$TEMPLATE/browser.mjs" \
  YA_BROWSER_MODES="${YA_BROWSER_MODES:-[\"stories-live-320\"]}" \
  node --experimental-strip-types "$TEMPLATE/check.mjs" \
  2>&1 | tee "$RUN_OUT/run.log"

python3 - "$RUN_OUT/browser/live-browser-results.json" <<'PY'
import json, sys
results = json.load(open(sys.argv[1]))
for result in results:
    print(result["status"], result["case"])
    if result["status"] != "PASS":
        print(result.get("error", result))
if not results or any(result["status"] != "PASS" for result in results):
    raise SystemExit(1)
PY

echo 'HTTPS_BROWSER_CHECK_COMPLETE'
echo 'APPLICATION_SOURCE_UNCHANGED'
echo 'PRODUCTION_DATABASE_NOT_USED'
echo 'NOT_DEPLOYED'
