#!/usr/bin/env bash
#
# Doc 14 section 5 step 8 / 11.5 -- the install is not finished until the service answers
# *healthily*. Linux equivalent of installer/verify-health.ps1.
#
# An installer that reports success over a broken service is worse than one that fails: the
# failure surfaces later, to someone who no longer has the installation in front of them
# (doc 14 section 5 step 8). /api/health answers 200 while degraded, by design (doc 14
# section 5.1), so this requires `status: ok`, not merely a response.
set -euo pipefail

usage() { echo "Kullanim: $0 --port N --data-dir DIR [--timeout-seconds N]" >&2; exit 2; }

port=""
data_dir=""
timeout_seconds=90
while [ $# -gt 0 ]; do
  case "$1" in
    --port) port="$2"; shift 2 ;;
    --data-dir) data_dir="$2"; shift 2 ;;
    --timeout-seconds) timeout_seconds="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$port" ] && [ -n "$data_dir" ] || usage

# `curl` is a Depends: of the package, so on an apt install it is always here. This says so out
# loud anyway, because the failure it prevents is the worst kind of wrong answer: `curl -fsS`
# exits non-zero for a missing binary exactly as it does for a refused connection, so without
# this check a machine with no curl reports the service as dead for the full timeout and the
# installation fails with a message that blames the wrong thing (found 2026-09-11).
if ! command -v curl >/dev/null 2>&1; then
  echo "curl bulunamadi; servis sagligi dogrulanamiyor. 'apt-get install curl' ile kurup tekrar deneyin." >&2
  exit 1
fi

url="http://127.0.0.1:$port/api/health"
deadline=$((SECONDS + timeout_seconds))
last_seen="(hic yanit alinamadi)"

while [ "$SECONDS" -lt "$deadline" ]; do
  if body="$(curl -fsS --max-time 5 "$url" 2>/dev/null)"; then
    # No dependency on Node or jq being on PATH at this point in the install: `status` is
    # always a short bare string in this payload, so a plain grep is enough and cannot be
    # tricked by anything else in the JSON having "status" as a substring of its own value.
    status="$(printf '%s' "$body" | grep -o '"status"[[:space:]]*:[[:space:]]*"[a-z]*"' | head -n1 | sed -E 's/.*"([a-z]+)"$/\1/')"
    if [ "$status" = "ok" ]; then
      echo "Servis calisiyor: $url"
      exit 0
    fi
    # Reached but not ready: still booting, or migrating. Keep the reason for the failure
    # message -- "degraded, database unreachable" is a far better report than "no answer".
    last_seen="$body"
  else
    last_seen="baglanti kurulamadi"
  fi
  sleep 3
done

log_path="$data_dir/logs/buybox.err.log"
echo "Servis ${timeout_seconds} saniye icinde calisir duruma gelmedi ($url)." >&2
echo "Son durum: $last_seen" >&2
echo "Ayrinti icin gunluk dosyasi: $log_path" >&2
exit 1
